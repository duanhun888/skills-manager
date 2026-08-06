import type { Message, Session } from "@opencode-ai/sdk/v2/client"
import { showToast } from "@/utils/toast"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Binary } from "@opencode-ai/core/util/binary"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { batch, startTransition, type Accessor } from "solid-js"
import { useTabs } from "@/context/tabs"
import { useServerSync, type ServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useLocal, type ModelSelection } from "@/context/local"
import { usePermission } from "@/context/permission"
import { type ContextItem, type ImageAttachmentPart, type Prompt, type usePrompt } from "@/context/prompt"
import { useSDK, type DirectorySDK } from "@/context/sdk"
import { useSync, type DirectorySync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { buildRequestParts } from "./build-request-parts"
import {
  buildCodingFollowupText,
  buildVisionDescribeUserText,
  collectAssistantText,
  visionDescribeMode,
  visionDescribeSystem,
} from "./coding-vision"
import { ocrImages } from "./coding-ocr"
import { setCursorPosition } from "./editor-dom"
import { formatServerError } from "@/utils/server-errors"
import { ScopedKey } from "@/utils/server-scope"
import { createPromptSubmissionState } from "./submission-state"
import {
  modelSupportsImages,
  parseCodingImagePriority,
  parseProviderModel,
  useSkillsModelPolicy,
} from "@/utils/skills-model-policy"

function textPrompt(content: string): Prompt {
  return [{ type: "text", content, start: 0, end: content.length }]
}

type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
}

const pending = new Map<string, PendingPrompt>()

export type FollowupDraft = {
  sessionID: string
  sessionDirectory: string
  prompt: Prompt
  context: (ContextItem & { key: string })[]
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
}

export type FollowupVisionDescribe = {
  visionModel?: { providerID: string; modelID: string }
  /** Optional PaddleX OCR base URL, e.g. http://192.168.1.230:8080 */
  ocrUrl?: string
  /** Pipeline order when both OCR and VL are available. Default: ocr_then_vl */
  priority?: "ocr_then_vl" | "vl_then_ocr" | "ocr_only" | "vl_only"
  /** When true, skip two-pass (coding model can see images). */
  codingSupportsImages: boolean
  locale: string
  onDescribeStart?: () => void
  onOcrStart?: () => void
  onOcrFallbackVision?: (reason?: string) => void
  onVisionFallbackOcr?: () => void
}

type FollowupSendInput = {
  client: DirectorySDK["client"]
  serverSync: ServerSync
  sync: DirectorySync
  draft: FollowupDraft
  messageID?: string
  optimisticBusy?: boolean
  before?: () => Promise<boolean> | boolean
  /** When set and draft has images, describe with vision model then continue without images. */
  vision?: FollowupVisionDescribe
}

const draftText = (prompt: Prompt) => prompt.map((part) => ("content" in part ? part.content : "")).join("")

const draftImages = (prompt: Prompt) => prompt.filter((part): part is ImageAttachmentPart => part.type === "image")

async function resolveVisionDescription(input: {
  client: DirectorySDK["client"]
  draft: FollowupDraft
  images: ImageAttachmentPart[]
  text: string
  vision: FollowupVisionDescribe
}) {
  const model = input.vision.visionModel
  if (!model?.providerID || !model.modelID) {
    throw new Error("vision model not configured")
  }

  const visionMessageID = Identifier.ascending("message")
  const visionText = buildVisionDescribeUserText(input.text, input.vision.locale)
  const { requestParts } = buildRequestParts({
    prompt: input.draft.prompt,
    context: input.draft.context,
    images: input.images,
    text: visionText,
    sessionID: input.draft.sessionID,
    messageID: visionMessageID,
    sessionDirectory: input.draft.sessionDirectory,
  })

  const visionResult = await input.client.session.prompt({
    sessionID: input.draft.sessionID,
    agent: "requirements",
    model: {
      providerID: model.providerID,
      modelID: model.modelID,
    },
    system: visionDescribeSystem(visionDescribeMode(input.text)),
    parts: requestParts,
  })

  let description = collectAssistantText(visionResult.data?.parts)
  if (!description) {
    try {
      const messages = await input.client.session.messages({ sessionID: input.draft.sessionID, limit: 8 })
      const rows = messages.data ?? []
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i] as { info?: { role?: string }; parts?: unknown }
        if (row?.info?.role !== "assistant") continue
        description = collectAssistantText(row.parts)
        if (description) break
      }
    } catch {
      // keep empty
    }
  }
  return description
}

/** Pass1: describe images via OCR and/or VL according to configured priority. */
async function resolveImageDescription(input: {
  client: DirectorySDK["client"]
  draft: FollowupDraft
  images: ImageAttachmentPart[]
  text: string
  vision: FollowupVisionDescribe
}): Promise<{ text: string; source: "ocr" | "vl" }> {
  const ocrUrl = input.vision.ocrUrl?.trim()
  const visionReady = !!input.vision.visionModel?.providerID && !!input.vision.visionModel?.modelID
  const priority = input.vision.priority ?? "ocr_then_vl"

  const runOcr = async (): Promise<{ text: string; source: "ocr" } | { ok: false; reason: string }> => {
    if (!ocrUrl) return { ok: false, reason: "no_endpoint" }
    input.vision.onOcrStart?.()
    console.info("[coding-ocr] pipeline start", {
      endpoint: ocrUrl,
      priority,
      imageCount: input.images.length,
    })
    const ocr = await ocrImages({
      endpoint: ocrUrl,
      dataUrls: input.images.map((image) => image.dataUrl),
    })
    if (ocr.ok) {
      console.info("[coding-ocr] pipeline ok", { lineCount: ocr.lineCount, avgScore: ocr.avgScore })
      return { text: ocr.text, source: "ocr" }
    }
    console.warn("[coding-ocr] pipeline failed → may fallback VL", { reason: ocr.reason })
    return { ok: false, reason: ocr.reason }
  }

  const runVl = async (): Promise<{ text: string; source: "vl" } | { ok: false; reason: string }> => {
    if (!visionReady) return { ok: false, reason: "no_vision_model" }
    input.vision.onDescribeStart?.()
    const description = await resolveVisionDescription(input)
    if (!description) return { ok: false, reason: "empty" }
    return { text: description, source: "vl" }
  }

  if (priority === "ocr_only") {
    const ocr = await runOcr()
    if ("source" in ocr) return ocr
    throw new Error(`OCR failed (${ocr.reason})`)
  }

  if (priority === "vl_only") {
    const vl = await runVl()
    if ("source" in vl) return vl
    throw new Error(`vision describe failed (${vl.reason})`)
  }

  if (priority === "vl_then_ocr") {
    const vl = await runVl()
    if ("source" in vl) return vl
    if (!ocrUrl) throw new Error(`vision describe failed (${vl.reason}) and no OCR configured`)
    input.vision.onVisionFallbackOcr?.()
    const ocr = await runOcr()
    if ("source" in ocr) return ocr
    throw new Error(`vision and OCR both failed (vl=${vl.reason}, ocr=${ocr.reason})`)
  }

  // ocr_then_vl (default)
  if (ocrUrl) {
    const ocr = await runOcr()
    if ("source" in ocr) return ocr
    if (!visionReady) throw new Error(`OCR failed (${ocr.reason}) and no vision model configured`)
    input.vision.onOcrFallbackVision?.(ocr.reason)
  }
  const vl = await runVl()
  if ("source" in vl) return vl
  throw new Error(`vision describe failed (${vl.reason})`)
}

export async function sendFollowupDraft(input: FollowupSendInput) {
  const text = draftText(input.draft.prompt)
  const images = draftImages(input.draft.prompt)
  const setBusy = () => {
    if (!input.optimisticBusy) return
    input.serverSync.session.set("session_status", input.draft.sessionID, { type: "busy" })
  }

  const setIdle = () => {
    if (!input.optimisticBusy) return
    input.serverSync.session.set("session_status", input.draft.sessionID, { type: "idle" })
  }

  const wait = async () => {
    const ok = await input.before?.()
    if (ok === false) return false
    return true
  }

  const [head, ...tail] = text.split(" ")
  const cmd = head?.startsWith("/") ? head.slice(1) : undefined
  const ocrReady = !!input.vision?.ocrUrl?.trim()
  const visionReady =
    !!input.vision?.visionModel?.providerID && !!input.vision?.visionModel?.modelID
  const priority = input.vision?.priority ?? "ocr_then_vl"
  const pipelineReady =
    (priority === "ocr_only" && ocrReady) ||
    (priority === "vl_only" && visionReady) ||
    (priority !== "ocr_only" && priority !== "vl_only" && (ocrReady || visionReady))
  const shouldDescribe =
    !!input.vision &&
    !input.vision.codingSupportsImages &&
    images.length > 0 &&
    pipelineReady &&
    !(cmd && input.sync.data.command.find((item) => item.name === cmd))

  if (shouldDescribe && input.vision) {
    setBusy()
    try {
      if (!(await wait())) {
        setIdle()
        return false
      }
      const described = await resolveImageDescription({
        client: input.client,
        draft: input.draft,
        images,
        text,
        vision: input.vision,
      })
      const codingText = buildCodingFollowupText(
        text,
        described.text,
        input.vision.locale,
        described.source,
      )
      return await sendFollowupDraft({
        ...input,
        draft: {
          ...input.draft,
          prompt: textPrompt(codingText),
        },
        vision: undefined,
        before: undefined,
      })
    } catch (err) {
      setIdle()
      throw err
    }
  }

  if (cmd && input.sync.data.command.find((item) => item.name === cmd)) {
    setBusy()
    try {
      if (!(await wait())) {
        setIdle()
        return false
      }

      await input.client.session.command({
        sessionID: input.draft.sessionID,
        command: cmd,
        arguments: tail.join(" "),
        agent: input.draft.agent,
        model: `${input.draft.model.providerID}/${input.draft.model.modelID}`,
        variant: input.draft.variant,
        parts: images.map((attachment) => ({
          id: Identifier.ascending("part"),
          type: "file" as const,
          mime: attachment.mime,
          url: attachment.dataUrl,
          filename: attachment.filename,
        })),
      })
      return true
    } catch (err) {
      setIdle()
      throw err
    }
  }

  const messageID = input.messageID ?? Identifier.ascending("message")
  const { requestParts, optimisticParts } = buildRequestParts({
    prompt: input.draft.prompt,
    context: input.draft.context,
    images,
    text,
    sessionID: input.draft.sessionID,
    messageID,
    sessionDirectory: input.draft.sessionDirectory,
  })

  const message: Message = {
    id: messageID,
    sessionID: input.draft.sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: input.draft.agent,
    model: { ...input.draft.model, variant: input.draft.variant },
  }

  const add = () =>
    input.sync.session.optimistic.add({
      directory: input.draft.sessionDirectory,
      sessionID: input.draft.sessionID,
      message,
      parts: optimisticParts,
    })

  const remove = () =>
    input.sync.session.optimistic.remove({
      directory: input.draft.sessionDirectory,
      sessionID: input.draft.sessionID,
      messageID,
    })

  batch(() => {
    setBusy()
    add()
  })

  try {
    if (!(await wait())) {
      batch(() => {
        setIdle()
        remove()
      })
      return false
    }

    await input.client.session.promptAsync({
      sessionID: input.draft.sessionID,
      agent: input.draft.agent,
      model: input.draft.model,
      messageID,
      parts: requestParts,
      variant: input.draft.variant,
    })
    return true
  } catch (err) {
    batch(() => {
      setIdle()
      remove()
    })
    throw err
  }
}

type PromptSubmitInput = {
  prompt: ReturnType<typeof usePrompt>
  info: Accessor<{ id: string } | undefined>
  imageAttachments: Accessor<ImageAttachmentPart[]>
  commentCount: Accessor<number>
  autoAccept: Accessor<boolean>
  mode: Accessor<"normal" | "shell">
  working: Accessor<boolean>
  editor: () => HTMLDivElement | undefined
  queueScroll: () => void
  promptLength: (prompt: Prompt) => number
  addToHistory: (prompt: Prompt, mode: "normal" | "shell") => void
  resetHistoryNavigation: () => void
  setMode: (mode: "normal" | "shell") => void
  setPopover: (popover: "at" | "slash" | null) => void
  newSessionWorktree?: Accessor<string | undefined>
  onNewSessionWorktreeReset?: () => void
  shouldQueue?: Accessor<boolean>
  onQueue?: (draft: FollowupDraft) => void
  onAbort?: () => void
  onSubmit?: () => void
  model?: ModelSelection
}

export function createPromptSubmit(input: PromptSubmitInput) {
  const navigate = useNavigate()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const local = useLocal()
  const permission = usePermission()
  const prompt = input.prompt
  const layout = useLayout()
  const language = useLanguage()
  const skillsPolicy = useSkillsModelPolicy()
  const params = useParams()
  const [search] = useSearchParams<{ draftId?: string }>()
  const tabs = useTabs()
  const pendingKey = (sessionID: string) => ScopedKey.from(sdk().scope, sessionID)

  const errorMessage = (err: unknown) => {
    if (err && typeof err === "object" && "data" in err) {
      const data = (err as { data?: { message?: string } }).data
      if (data?.message) return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  const abort = async () => {
    const sessionID = params.id
    if (!sessionID) return Promise.resolve()

    serverSync().session.set("todo", sessionID, [])

    input.onAbort?.()

    const key = pendingKey(sessionID)
    const queued = pending.get(key)
    if (queued) {
      queued.abort.abort()
      queued.cleanup()
      pending.delete(key)
      return Promise.resolve()
    }
    return sdk()
      .client.session.abort({
        sessionID,
      })
      .catch(() => {})
  }

  const restoreCommentItems = (
    target: ReturnType<ReturnType<typeof usePrompt>["capture"]>,
    items: (ContextItem & { key: string })[],
  ) => {
    for (const item of items) {
      target.context.add({
        type: "file",
        path: item.path,
        selection: item.selection,
        comment: item.comment,
        commentID: item.commentID,
        commentOrigin: item.commentOrigin,
        preview: item.preview,
      })
    }
  }

  const clearContext = (target: ReturnType<ReturnType<typeof usePrompt>["capture"]>) => {
    for (const item of target.context.items()) {
      target.context.remove(item.key)
    }
  }

  const seed = (dir: string, info: Session) => {
    serverSync().session.remember(info)
    const [, setStore] = serverSync().child(dir)
    setStore("session", (list: Session[]) => {
      const result = Binary.search(list, info.id, (item) => item.id)
      const next = [...list]
      if (result.found) {
        next[result.index] = info
        return next
      }
      next.splice(result.index, 0, info)
      return next
    })
  }

  const handleSubmit = async (event: Event) => {
    event.preventDefault()

    const target = prompt.capture()
    const submission = createPromptSubmissionState({
      target,
      prompt: target.current(),
      context: target.context.items().slice(),
    })
    const currentPrompt = submission.prompt
    const context = submission.context
    const text = currentPrompt.map((part) => ("content" in part ? part.content : "")).join("")
    const images = input.imageAttachments().slice()
    const mode = input.mode()

    if (text.trim().length === 0 && images.length === 0 && input.commentCount() === 0) {
      if (input.working()) void abort()
      return
    }

    const modelSelection = input.model ?? local.model
    const currentModel = modelSelection.current()
    const currentAgent = local.agent.current()
    const variant = modelSelection.variant.current()
    if (!currentModel || !currentAgent) {
      showToast({
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description"),
      })
      return
    }

    input.addToHistory(currentPrompt, mode)
    input.resetHistoryNavigation()

    const projectDirectory = sdk().directory
    const permissionState = permission.currentServerState()
    const isNewSession = !params.id
    const shouldAutoAccept = isNewSession && input.autoAccept()
    const worktreeSelection = input.newSessionWorktree?.() || "main"

    let sessionDirectory = projectDirectory
    let client = sdk().client

    if (isNewSession) {
      if (worktreeSelection === "create") {
        const createdWorktree = await client.worktree
          .create({ directory: projectDirectory })
          .then((x) => x.data)
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.worktreeCreateFailed.title"),
              description: errorMessage(err),
            })
            return undefined
          })

        if (!createdWorktree?.directory) {
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: language.t("common.requestFailed"),
          })
          return
        }
        WorktreeState.pending(sdk().scope, createdWorktree.directory)
        sessionDirectory = createdWorktree.directory
      }

      if (worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      if (sessionDirectory !== projectDirectory) {
        client = sdk().createClient({
          directory: sessionDirectory,
          throwOnError: true,
        })
        serverSync().child(sessionDirectory)
      }

      input.onNewSessionWorktreeReset?.()
    }

    let session = input.info()
    if (!session && isNewSession) {
      const created = await client.session
        .create()
        .then((x) => x.data ?? undefined)
        .catch((err) => {
          showToast({
            title: language.t("prompt.toast.sessionCreateFailed.title"),
            description: errorMessage(err),
          })
          return undefined
        })
      if (created) {
        seed(sessionDirectory, created)
        session = created
        await startTransition(() => {
          if (!session) return
          if (shouldAutoAccept) permissionState.enableAutoAccept(session.id, sessionDirectory)
          local.session.promote(sessionDirectory, session.id, {
            agent: currentAgent.name,
            model: { providerID: currentModel.provider.id, modelID: currentModel.id },
            variant: variant ?? null,
          })
          layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
          const draftID = search.draftId
          if (draftID) tabs.promoteDraft(draftID, { server: tabs.draft(draftID).server, sessionId: session.id })
          else navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
          submission.retarget(prompt.capture({ dir: base64Encode(sessionDirectory), id: session.id }))
        })
      }
    }
    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description"),
      })
      return
    }

    const model = {
      modelID: currentModel.id,
      providerID: currentModel.provider.id,
    }
    const agent = currentAgent.name
    const draft: FollowupDraft = {
      sessionID: session.id,
      sessionDirectory,
      prompt: currentPrompt,
      context,
      agent,
      model,
      variant,
    }

    const clearInput = () => {
      submission.clear()
      input.setMode("normal")
      input.setPopover(null)
    }

    const restoreInput = () => {
      const restored = submission.restore()
      if (!restored) return false
      restored.target.set(restored.prompt, input.promptLength(restored.prompt))
      if (!submission.current(prompt.capture())) return true
      input.setMode(mode)
      input.setPopover(null)
      requestAnimationFrame(() => {
        const editor = input.editor()
        if (!editor) return
        editor.focus()
        setCursorPosition(editor, input.promptLength(currentPrompt))
        input.queueScroll()
      })
      return true
    }

    if (!isNewSession && mode === "normal" && input.shouldQueue?.()) {
      input.onQueue?.(draft)
      clearContext(submission.target())
      clearInput()
      return
    }

    input.onSubmit?.()

    if (mode === "shell") {
      clearInput()
      client.session
        .shell({
          sessionID: session.id,
          agent,
          model,
          command: text,
        })
        .catch((err) => {
          showToast({
            title: language.t("prompt.toast.shellSendFailed.title"),
            description: errorMessage(err),
          })
          restoreInput()
        })
      return
    }

    if (text.startsWith("/")) {
      const [cmdName, ...args] = text.split(" ")
      const commandName = cmdName.slice(1)
      const customCommand = sync().data.command.find((c) => c.name === commandName)
      if (customCommand) {
        clearInput()
        client.session
          .command({
            sessionID: session.id,
            command: commandName,
            arguments: args.join(" "),
            agent,
            model: `${model.providerID}/${model.modelID}`,
            variant,
            parts: images.map((attachment) => ({
              id: Identifier.ascending("part"),
              type: "file" as const,
              mime: attachment.mime,
              url: attachment.dataUrl,
              filename: attachment.filename,
            })),
          })
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.commandSendFailed.title"),
              description: formatServerError(err, language.t, language.t("common.requestFailed")),
            })
            restoreInput()
          })
        return
      }
    }

    const commentItems = context.filter((item) => item.type === "file" && !!item.comment?.trim())
    const messageID = Identifier.ascending("message")

    const removeOptimisticMessage = () => {
      sync().session.optimistic.remove({
        directory: sessionDirectory,
        sessionID: session.id,
        messageID,
      })
    }

    for (const item of commentItems) submission.target().context.remove(item.key)

    const waitForWorktree = async () => {
      const worktree = WorktreeState.get(sdk().scope, sessionDirectory)
      if (!worktree || worktree.status !== "pending") return true

      if (sessionDirectory === projectDirectory) {
        sync().set("session_status", session.id, { type: "busy" })
      }

      const controller = new AbortController()
      const cleanup = () => {
        if (sessionDirectory === projectDirectory) {
          sync().set("session_status", session.id, { type: "idle" })
        }
        removeOptimisticMessage()
        if (restoreInput()) restoreCommentItems(submission.target(), commentItems)
      }

      pending.set(pendingKey(session.id), { abort: controller, cleanup })

      const abortWait = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        if (controller.signal.aborted) {
          resolve({ status: "failed", message: "aborted" })
          return
        }
        controller.signal.addEventListener(
          "abort",
          () => {
            resolve({ status: "failed", message: "aborted" })
          },
          { once: true },
        )
      })

      const timeoutMs = 5 * 60 * 1000
      const timer = { id: undefined as number | undefined }
      const timeout = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        timer.id = window.setTimeout(() => {
          resolve({
            status: "failed",
            message: language.t("workspace.error.stillPreparing"),
          })
        }, timeoutMs)
      })

      const result = await Promise.race([
        WorktreeState.wait(sdk().scope, sessionDirectory),
        abortWait,
        timeout,
      ]).finally(() => {
        if (timer.id === undefined) return
        clearTimeout(timer.id)
      })
      pending.delete(pendingKey(session.id))
      if (controller.signal.aborted) return false
      if (result.status === "failed") throw new Error(result.message)
      return true
    }

    const needsVision =
      mode === "normal" &&
      images.length > 0 &&
      !modelSupportsImages(currentModel) &&
      !text.startsWith("/")

    // Ensure this submit path sees the latest policy (hook instances can race).
    if (needsVision) await skillsPolicy.refresh({ force: true })

    const policy = skillsPolicy.policy()
    const visionModel = parseProviderModel(policy.coding_vision_model)
    const ocrUrl = policy.coding_ocr_url?.trim() || undefined
    const priority = parseCodingImagePriority(policy.coding_image_priority)

    const pipelineReady =
      (priority === "ocr_only" && !!ocrUrl) ||
      (priority === "vl_only" && !!visionModel) ||
      (priority !== "ocr_only" && priority !== "vl_only" && (!!ocrUrl || !!visionModel))

    if (needsVision && !pipelineReady) {
      showToast({
        title: language.t("prompt.toast.visionModelRequired.title"),
        description: language.t("prompt.toast.visionModelRequired.description"),
      })
      return
    }

    const vision =
      needsVision && pipelineReady
        ? {
            visionModel,
            ocrUrl,
            priority,
            codingSupportsImages: false,
            locale: language.locale(),
            onOcrStart: () => {
              showToast({
                title: language.t("prompt.toast.ocrStart.title"),
                description: language.t("prompt.toast.ocrStart.description"),
              })
            },
            onOcrFallbackVision: (reason) => {
              showToast({
                title: language.t("prompt.toast.ocrFallbackVision.title"),
                description: `${language.t("prompt.toast.ocrFallbackVision.description")}${reason ? ` [${reason}]` : ""}`,
              })
            },
            onVisionFallbackOcr: () => {
              showToast({
                title: language.t("prompt.toast.visionFallbackOcr.title"),
                description: language.t("prompt.toast.visionFallbackOcr.description"),
              })
            },
            onDescribeStart: () => {
              showToast({
                title: language.t("prompt.toast.visionDescribe.title"),
                description: language.t("prompt.toast.visionDescribe.description"),
              })
            },
          }
        : undefined

    clearInput()

    void sendFollowupDraft({
      client,
      sync: sync(),
      serverSync: serverSync(),
      draft,
      messageID,
      optimisticBusy: sessionDirectory === projectDirectory,
      before: waitForWorktree,
      vision,
    }).catch((err) => {
      pending.delete(pendingKey(session.id))
      if (sessionDirectory === projectDirectory) {
        sync().set("session_status", session.id, { type: "idle" })
      }
      const isVision = !!vision && !vision.codingSupportsImages && images.length > 0
      showToast({
        title: language.t(
          isVision ? "prompt.toast.visionDescribeFailed.title" : "prompt.toast.promptSendFailed.title",
        ),
        description: isVision
          ? errorMessage(err) || language.t("prompt.toast.visionDescribeFailed.description")
          : errorMessage(err),
      })
      removeOptimisticMessage()
      if (restoreInput()) restoreCommentItems(submission.target(), commentItems)
    })
  }

  return {
    abort,
    handleSubmit,
  }
}
