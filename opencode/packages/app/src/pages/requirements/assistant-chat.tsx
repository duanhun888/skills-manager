import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { ImagePreview } from "@opencode-ai/ui/image-preview"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { ModelSelectorPopoverV2 } from "@/components/dialog-select-model"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { type ModelKey, useModels } from "@/context/models"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { formatServerError, isLocalSessionNotFoundError, isSessionNotFoundError } from "@/utils/server-errors"
import { useSkillsModelPolicy } from "@/utils/skills-model-policy"
import {
  REQUIREMENT_ANALYSIS_SYSTEM,
  defaultAnalyzePrompt,
  formatConnectorContext,
  isRequirementSections,
  parseRequirementSectionsFromText,
  shouldAttachAnalysisAssets,
  summarizeAnalysis,
  toFileParts,
} from "./analyze"
import { formatDocumentContext } from "./asset-text"
import { isApifoxConnected, isIntegrationEmpty } from "./apifox"
import { useRequirements } from "./context"
import { DialogConnectors } from "./dialog-connectors"
import { DialogIntegrationConfig } from "./dialog-integration"
import { DialogTapdConfig } from "./dialog-tapd"
import { isTapdConnected } from "./tapd"
import { isRequirementDocumentEmpty } from "./spec-form-panel"
import { assetExtBadge, isImageAsset, normalizeAssetDataUrl } from "./tapd-import"
import type { RequirementAsset, RequirementMessageAttachment, RequirementProject } from "./types"
import { EMPTY_INTEGRATION } from "./types"

export function AssistantChatPanel(props: {
  project: RequirementProject
  analysisAssets: RequirementAsset[]
  chatAssets: RequirementAsset[]
  composerFocusTick?: number
  onRemoveChatAsset: (id: string) => void
  onClearChatAssets: () => void
  onAddAssets: () => void | Promise<void>
}) {
  const language = useLanguage()
  const requirements = useRequirements()
  const dialog = useDialog()
  const layout = useLayout()
  const server = useServer()
  const serverSDK = useServerSDK()
  const models = useModels()
  const skillsPolicy = useSkillsModelPolicy()
  const [draft, setDraft] = createSignal("")
  const [sending, setSending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [selectedKey, setSelectedKey] = createSignal<ModelKey>()
  const [hintDismissed, setHintDismissed] = createSignal(false)
  let abort: AbortController | undefined
  let scroller: HTMLDivElement | undefined
  let composerInput: HTMLTextAreaElement | undefined

  onCleanup(() => abort?.abort())

  createEffect(() => {
    const tick = props.composerFocusTick
    if (!tick) return
    queueMicrotask(() => composerInput?.focus())
  })

  // Spec mirrors checked messages only — clear leftover Spec when nothing is checked.
  createEffect(() => {
    const ids = props.project.handoffMessageIds ?? []
    if (ids.length > 0) return
    if (isRequirementDocumentEmpty(props.project.document)) return
    requirements.syncSpecFromHandoff(props.project.id)
  })

  const messages = createMemo(() => props.project.messages)
  const handoffCount = createMemo(() => props.project.handoffMessageIds?.length ?? 0)
  const integration = createMemo(() => props.project.integration ?? EMPTY_INTEGRATION)
  const apifoxConnected = createMemo(() => isApifoxConnected(integration()))
  const tapdConnected = createMemo(() => isTapdConnected(integration()))
  const integrationReady = createMemo(() => !isIntegrationEmpty(integration()))
  /** Prefer explicit chat attachments; checkbox materials only for analyze-style turns. */
  const resolveTurnAssets = (userText: string) => {
    if (props.chatAssets.length > 0) return props.chatAssets
    if (shouldAttachAnalysisAssets(userText, 0)) return props.analysisAssets
    return [] as RequirementAsset[]
  }

  const [sendingWithAssets, setSendingWithAssets] = createSignal(false)

  const openCatalog = () => {
    void dialog.show(() => <DialogConnectors projectId={props.project.id} />)
  }

  const openApifox = () => {
    void dialog.show(() => <DialogIntegrationConfig projectId={props.project.id} />)
  }

  const openTapd = () => {
    void dialog.show(() => <DialogTapdConfig projectId={props.project.id} />)
  }

  const fallbackModel = createMemo(() => {
    const list = models.list()
    const policy = skillsPolicy.policy()
    if (policy.mode === "restricted" && policy.requirements_only_models.length > 0) {
      const preferred = policy.requirements_only_models
        .map((key) => {
          const [providerID, ...rest] = key.split("/")
          const modelID = rest.join("/")
          if (!providerID || !modelID) return undefined
          return models.find({ providerID, modelID })
        })
        .find(Boolean)
      if (preferred) return preferred
    }
    const recent = models.recent.list()[0]
    if (recent) {
      const found = models.find(recent)
      if (found) return found
    }
    const vision = list.find((item) => {
      const modalities = (item as { modalities?: { input?: string[] } }).modalities?.input
      return Array.isArray(modalities) ? modalities.includes("image") : false
    })
    return vision ?? list[0]
  })

  const model = createMemo(() => {
    const key = selectedKey()
    if (key) {
      const found = models.find(key)
      if (found) return found
    }
    return fallbackModel()
  })

  const modelSupportsImages = (item: { modalities?: { input?: string[] }; capabilities?: { input?: { image?: boolean } } } | undefined) => {
    if (!item) return false
    const modalities = item.modalities?.input
    if (Array.isArray(modalities)) return modalities.includes("image")
    const caps = item.capabilities?.input
    if (caps && typeof caps.image === "boolean") return caps.image
    // Unknown metadata — allow attempt; provider will error if unsupported.
    return true
  }

  const modelSelection = {
    list: models.list,
    visible: models.visible,
    current: model,
    set(item: ModelKey | undefined, options?: { recent?: boolean }) {
      setSelectedKey(item)
      if (!item) return
      models.setVisibility(item, true)
      if (options?.recent) models.recent.push(item)
    },
  }

  const scrollToBottom = () => {
    queueMicrotask(() => {
      if (!scroller) return
      scroller.scrollTop = scroller.scrollHeight
    })
  }

  const directory = () => props.project.systemDirectory

  const formatAttachmentList = (assets: RequirementAsset[]) => {
    if (assets.length === 0) return ""
    return ["Attachments in this turn:", ...assets.map((asset) => `- ${asset.filename}`)].join("\n")
  }

  const extractMessageError = (info: unknown): string | undefined => {
    if (!info || typeof info !== "object") return
    const err = (info as { error?: unknown }).error
    if (!err) return
    if (typeof err === "string") return err
    // Prefer structured server errors (ConfigInvalidError issues, model-not-found, …)
    // over the bare NamedError name that `.message` often collapses to.
    const readable = formatServerError(err, language.t)
    if (readable && readable !== "Unknown error" && readable !== language.t("error.chain.unknown")) {
      return readable
    }
    if (typeof err === "object") {
      const record = err as { message?: unknown; data?: { message?: unknown } }
      if (typeof record.message === "string" && record.message.trim()) return record.message
      if (typeof record.data?.message === "string" && record.data.message.trim()) return record.data.message
    }
    return
  }

  const collectTextParts = (parts: unknown): string => {
    if (!Array.isArray(parts)) return ""
    return parts
      .flatMap((part) => {
        if (!part || typeof part !== "object") return []
        const item = part as { type?: string; text?: unknown; ignored?: boolean }
        if (item.type === "text" && typeof item.text === "string" && !item.ignored) {
          const text = item.text.trim()
          return text ? [text] : []
        }
        return []
      })
      .join("\n\n")
      .trim()
  }

  const send = async (text?: string) => {
    const typed = (text ?? draft()).trim()
    const assets = resolveTurnAssets(typed)
    const content =
      typed ||
      (assets.length > 0
        ? defaultAnalyzePrompt(assets.filter((asset) => isImageAsset(asset)).length || assets.length)
        : "")
    if (!content || sending()) return

    const dir = directory()
    if (!dir) {
      setError(language.t("requirements.editor.needLinkedProject"))
      return
    }
    const selected = model()
    if (!selected) {
      setError(language.t("requirements.chat.noModel"))
      return
    }

    const fileParts = toFileParts(assets)
    if (fileParts.some((part) => part.mime.startsWith("image/")) && !modelSupportsImages(selected)) {
      setError(language.t("requirements.chat.needVisionModel"))
      showToast({
        title: language.t("requirements.chat.needVisionModelTitle"),
        description: language.t("requirements.chat.needVisionModel"),
      })
      return
    }
    const documentContext = await formatDocumentContext(assets)
    const attachments: RequirementMessageAttachment[] = assets.map((asset) => {
      const display = normalizeAssetDataUrl(asset)
      return {
        assetId: asset.id,
        filename: asset.filename,
        mime: display.mime,
        previewUrl: display.kind === "image" ? display.dataUrl : undefined,
      }
    })

    setError()
    setDraft("")
    props.onClearChatAssets()
    requirements.appendMessage(props.project.id, {
      role: "user",
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
    scrollToBottom()
    setSendingWithAssets(assets.length > 0)
    setSending(true)
    abort?.abort()
    abort = new AbortController()

    try {
      layout.projects.open(dir)
      server.projects.touch(dir)
      const client = serverSDK().createClient({ directory: dir, throwOnError: true })

      const isBareImageMimeError = (value: string) => /file part media type image\b/i.test(value)
      const isMissingSessionError = (err: unknown, id: string) => {
        if (isLocalSessionNotFoundError(err, id) || isSessionNotFoundError(err, id)) return true
        const message = formatServerError(err)
        return message.includes(`Session not found: ${id}`) || /session not found/i.test(message)
      }

      const ensureSession = async (forceNew = false) => {
        let sessionID = forceNew ? undefined : props.project.analysisSessionID
        if (sessionID) {
          try {
            await client.session.get({ sessionID })
          } catch (err) {
            if (isMissingSessionError(err, sessionID) || /session not found/i.test(formatServerError(err))) {
              requirements.setAnalysisSessionID(props.project.id, undefined)
              sessionID = undefined
            } else {
              throw err
            }
          }
        }
        if (!sessionID) {
          const created = await client.session.create({
            title: `Requirements: ${props.project.title}`,
          })
          sessionID = created.data?.id
          if (!sessionID) throw new Error("Failed to create analysis session")
          requirements.setAnalysisSessionID(props.project.id, sessionID)
        }
        return sessionID
      }

      const attachmentList = formatAttachmentList(assets)
      const connectors = formatConnectorContext(integration())
      // Avoid format:json_schema — many providers (e.g. Alibaba/Qwen) fail StructuredOutput tool calls.
      // Ask for JSON in text and parse it, matching how coding chat works.
      // Use plan agent so analysis doesn't wander into coding tools; spreadsheets go as text preview.
      const promptParts = [
        {
          type: "text" as const,
          text: [
            content,
            "",
            attachmentList || undefined,
            attachmentList ? "" : undefined,
            documentContext || undefined,
            documentContext ? "" : undefined,
            connectors,
            connectors ? "" : undefined,
            "Current requirement document:",
            props.project.document.trim() || "(empty)",
          ]
            .filter((line): line is string => line !== undefined)
            .join("\n"),
        },
        ...fileParts,
      ]

      const runPrompt = async (sessionID: string) =>
        client.session.prompt({
          sessionID,
          agent: "requirements",
          model: { providerID: selected.provider.id, modelID: selected.id },
          system: REQUIREMENT_ANALYSIS_SYSTEM,
          parts: promptParts,
        })

      // Image turns: always use a fresh analysis session so prior bad MIME parts cannot poison the request.
      let sessionID = await ensureSession(fileParts.length > 0)
      let result: Awaited<ReturnType<typeof runPrompt>>
      try {
        result = await runPrompt(sessionID)
      } catch (firstErr) {
        const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr)
        const recreate =
          isBareImageMimeError(firstMessage) || isMissingSessionError(firstErr, sessionID)
        if (!recreate) throw firstErr
        // Stale analysisSessionID after OpenCode restart / DB reset, or bad image MIME — start clean.
        requirements.setAnalysisSessionID(props.project.id, undefined)
        sessionID = await ensureSession(true)
        result = await runPrompt(sessionID)
      }

      let info = result.data?.info
      let messageError = extractMessageError(info)
      if (messageError && isBareImageMimeError(messageError)) {
        requirements.setAnalysisSessionID(props.project.id, undefined)
        sessionID = await ensureSession(true)
        result = await runPrompt(sessionID)
        info = result.data?.info
        messageError = extractMessageError(info)
      }
      if (messageError) throw new Error(messageError)

      const structured = info && "structured" in info ? info.structured : undefined
      let replyText = collectTextParts(result.data?.parts)

      if (!replyText) {
        try {
          const messages = await client.session.messages({ sessionID, limit: 8 })
          const rows = messages.data ?? []
          for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i] as { info?: { role?: string }; parts?: unknown }
            if (row?.info?.role !== "assistant") continue
            replyText = collectTextParts(row.parts)
            if (replyText) break
          }
        } catch {
          // keep empty replyText
        }
      }

      const sections =
        (isRequirementSections(structured) ? structured : undefined) ?? parseRequirementSectionsFromText(replyText)

      if (sections) {
        const { notes, ...body } = sections
        const summary = summarizeAnalysis(body, typeof notes === "string" ? notes : undefined)
        requirements.appendMessage(props.project.id, {
          role: "assistant",
          content: summary,
          sections: body,
        })
        if (typeof notes === "string" && notes.trim()) {
          requirements.setAssistantNotes(props.project.id, notes.trim())
        }
        // Spec stays empty until the user checks this message on the right.
      } else {
        const fallback = replyText || language.t("requirements.chat.emptyReply")
        requirements.appendMessage(props.project.id, { role: "assistant", content: fallback })
        // Do not dump unstructured chat replies into analyst notes — they pollute coding handoff.
      }
      scrollToBottom()
    } catch (err) {
      if (abort?.signal.aborted) return
      const message = formatServerError(err, language.t, err instanceof Error ? err.message : String(err))
      setError(message)
      requirements.appendMessage(props.project.id, {
        role: "assistant",
        content: language.t("requirements.chat.failed", { message }),
      })
      showToast({
        title: language.t("requirements.chat.failedTitle"),
        description: message,
      })
      scrollToBottom()
    } finally {
      setSending(false)
      setSendingWithAssets(false)
    }
  }

  const openAttachment = (attachment: RequirementMessageAttachment) => {
    if (attachment.previewUrl?.startsWith("data:")) {
      void dialog.show(() => <ImagePreview src={attachment.previewUrl!} alt={attachment.filename} />)
      return
    }
    const live = props.project.assets.find((asset) => asset.id === attachment.assetId)
    if (live) {
      const display = normalizeAssetDataUrl(live)
      if (display.kind === "image") {
        void dialog.show(() => <ImagePreview src={display.dataUrl} alt={live.filename} />)
        return
      }
      const anchor = document.createElement("a")
      anchor.href = display.dataUrl
      anchor.download = live.filename
      anchor.click()
    }
  }

  return (
    <section data-component="requirements-panel">
      <div data-component="requirements-panel-header" data-layout="stack">
        <div data-slot="heading" class="flex min-w-0 flex-1 items-center justify-between gap-2">
          <h2 data-component="requirements-panel-title">{language.t("requirements.panel.assistant")}</h2>
          <div class="flex shrink-0 items-center gap-2">
            <Show when={messages().length > 0}>
              <Show when={handoffCount() > 0}>
                <span class="text-12-regular text-v2-text-text-weak">
                  {language.t("requirements.handoff.selectedCount", { count: handoffCount() })}
                </span>
              </Show>
              <button
                type="button"
                class="text-12-regular text-v2-text-text-weak hover:text-v2-text-text-base"
                onClick={() => {
                  const assistantIds = messages()
                    .filter((item) => item.role === "assistant" && item.content.trim())
                    .map((item) => item.id)
                  requirements.setHandoffMessages(props.project.id, assistantIds)
                }}
              >
                {language.t("requirements.handoff.selectAssistants")}
              </button>
              <Show when={handoffCount() > 0}>
                <button
                  type="button"
                  class="text-12-regular text-v2-text-text-weak hover:text-v2-text-text-base"
                  onClick={() => requirements.setHandoffMessages(props.project.id, [])}
                >
                  {language.t("requirements.handoff.clearSelection")}
                </button>
              </Show>
              <button
                type="button"
                class="text-12-regular text-v2-text-text-weak hover:text-v2-text-text-base"
                onClick={() => requirements.clearMessages(props.project.id)}
              >
                {language.t("requirements.chat.clear")}
              </button>
            </Show>
          </div>
        </div>
        <Show when={messages().length > 0}>
          <p data-component="requirements-handoff-chat-hint">{language.t("requirements.handoff.chatHint")}</p>
        </Show>
      </div>

      <div ref={scroller} data-component="requirements-chat-stage">
        <Show
          when={messages().length > 0}
          fallback={
            <div data-component="requirements-steps" class="my-auto mx-auto w-full max-w-md">
              <div class="text-13-medium text-v2-text-text-base mb-1">{language.t("requirements.chat.emptyTitle")}</div>
              <div class="flex flex-col gap-2.5 mt-3">
                <div data-component="requirements-step">
                  <span data-component="requirements-step-index">1</span>
                  <span>{language.t("requirements.chat.step1")}</span>
                </div>
                <div data-component="requirements-step">
                  <span data-component="requirements-step-index">2</span>
                  <span>{language.t("requirements.chat.step2")}</span>
                </div>
                <div data-component="requirements-step">
                  <span data-component="requirements-step-index">3</span>
                  <span>{language.t("requirements.chat.step3")}</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 mt-4">
                <ButtonV2 size="small" variant="outline" onClick={() => void props.onAddAssets()}>
                  {language.t("requirements.action.addAsset")}
                </ButtonV2>
              </div>
            </div>
          }
        >
          <For each={messages()}>
            {(message) => {
              const selected = () => (props.project.handoffMessageIds ?? []).includes(message.id)
              return (
                <div
                  data-component="requirements-message-row"
                  data-role={message.role}
                  data-selected={selected() ? "true" : undefined}
                >
                  <div
                    data-component={
                      message.role === "user" ? "requirements-bubble-user" : "requirements-bubble-assistant"
                    }
                  >
                    <Show when={message.role === "user" && (message.attachments?.length ?? 0) > 0}>
                      <div data-slot="user-message-attachments">
                        <For each={message.attachments ?? []}>
                          {(attachment) => (
                            <Show
                              when={attachment.previewUrl}
                              fallback={
                                <button
                                  type="button"
                                  data-slot="user-message-attachment"
                                  data-type="file"
                                  title={attachment.filename}
                                  onClick={() => openAttachment(attachment)}
                                >
                                  <span data-slot="user-message-attachment-badge">{assetExtBadge(attachment.filename)}</span>
                                  <span data-slot="user-message-attachment-name">{attachment.filename}</span>
                                </button>
                              }
                            >
                              <button
                                type="button"
                                data-slot="user-message-attachment"
                                data-type="image"
                                data-clickable
                                title={attachment.filename}
                                onClick={() => openAttachment(attachment)}
                              >
                                <img data-slot="user-message-attachment-image" src={attachment.previewUrl} alt="" />
                              </button>
                            </Show>
                          )}
                        </For>
                      </div>
                    </Show>
                    <div data-slot="user-message-text">{message.content}</div>
                  </div>
                  <label
                    data-component="requirements-message-pick"
                    title={language.t("requirements.handoff.messagePick")}
                  >
                    <input
                      type="checkbox"
                      checked={selected()}
                      onChange={() => requirements.toggleHandoffMessage(props.project.id, message.id)}
                    />
                  </label>
                </div>
              )
            }}
          </For>
          <Show when={sending()}>
            <div class="text-12-regular text-v2-text-text-weak px-1">
              {language.t(
                sendingWithAssets() ? "requirements.chat.thinking" : "requirements.chat.thinkingReply",
              )}
            </div>
          </Show>
        </Show>
      </div>

      <Show when={error()}>
        {(message) => <div class="px-4 pb-1 text-12-regular text-text-danger-base">{message()}</div>}
      </Show>

      <div data-component="requirements-composer">
        <Show when={integrationReady()}>
          <div data-component="requirements-connector-chips">
            <Show when={apifoxConnected()}>
              <button type="button" data-component="requirements-connector-chip" data-connected onClick={openApifox}>
                <span data-slot="label">Apifox</span>
                <Show when={integration().envName.trim()}>
                  <span data-slot="meta">{integration().envName.trim()}</span>
                </Show>
                <Show when={integration().apis.length > 0}>
                  <span data-slot="meta">
                    {language.t("requirements.integration.apiCount", { count: integration().apis.length })}
                  </span>
                </Show>
              </button>
            </Show>
            <Show when={tapdConnected()}>
              <button type="button" data-component="requirements-connector-chip" data-connected data-id="tapd" onClick={openTapd}>
                <span data-slot="label">TAPD</span>
                <Show when={integration().tapdWorkspaceId.trim()}>
                  <span data-slot="meta">{integration().tapdWorkspaceId.trim()}</span>
                </Show>
              </button>
            </Show>
            <Show when={!apifoxConnected() && !tapdConnected() && integrationReady()}>
              <button type="button" data-component="requirements-connector-chip" onClick={openCatalog}>
                <span data-slot="label">{language.t("requirements.connector.manage")}</span>
              </button>
            </Show>
          </div>
        </Show>
        <Show when={!integrationReady() && !hintDismissed()}>
          <div data-component="requirements-connector-hint">
            <button type="button" data-slot="action" onClick={openCatalog}>
              {language.t("requirements.connector.hint")}
            </button>
            <button
              type="button"
              data-slot="dismiss"
              aria-label={language.t("common.close")}
              onClick={() => setHintDismissed(true)}
            >
              <IconV2 name="close" size="small" />
            </button>
          </div>
        </Show>
        <div data-component="requirements-composer-box">
          <Show when={props.chatAssets.length > 0}>
            <div data-slot="prompt-attachments">
              <div data-slot="prompt-attachments-scroll" class="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar px-1 pt-0.5 pb-1">
                <For each={props.chatAssets}>
                  {(asset) => {
                    const display = () => normalizeAssetDataUrl(asset)
                    return (
                      <div class="relative group shrink-0">
                        <Show
                          when={display().kind === "image"}
                          fallback={
                            <button
                              type="button"
                              data-slot="composer-attachment"
                              data-type="file"
                              title={asset.filename}
                              onClick={() =>
                                openAttachment({
                                  assetId: asset.id,
                                  filename: asset.filename,
                                  mime: display().mime,
                                })
                              }
                            >
                              <span data-slot="badge">{assetExtBadge(asset.filename)}</span>
                              <span data-slot="name">{asset.filename}</span>
                            </button>
                          }
                        >
                          <button
                            type="button"
                            data-slot="composer-attachment"
                            data-type="image"
                            title={asset.filename}
                            onClick={() =>
                              openAttachment({
                                assetId: asset.id,
                                filename: asset.filename,
                                mime: display().mime,
                                previewUrl: display().dataUrl,
                              })
                            }
                          >
                            <img src={display().dataUrl} alt="" />
                          </button>
                        </Show>
                        <button
                          type="button"
                          data-slot="composer-attachment-remove"
                          aria-label={language.t("prompt.action.removeFromChat")}
                          onClick={() => props.onRemoveChatAsset(asset.id)}
                        >
                          <IconV2 name="close" size="small" />
                        </button>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>
          <textarea
            ref={(el) => {
              composerInput = el
            }}
            value={draft()}
            placeholder={language.t("requirements.chat.placeholder")}
            disabled={sending()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <div class="flex items-center gap-2 px-1">
            <MenuV2 gutter={6} placement="top-start" modal={false}>
              <MenuV2.Trigger
                as={ButtonV2}
                variant="ghost-muted"
                size="small"
                icon="plus"
                aria-label={language.t("requirements.connector.menu")}
              >
                {"\u200b"}
              </MenuV2.Trigger>
              <MenuV2.Portal>
                <MenuV2.Content>
                  <MenuV2.Item onSelect={() => void props.onAddAssets()}>
                    {language.t("requirements.action.addAsset")}
                  </MenuV2.Item>
                  <MenuV2.Separator />
                  <MenuV2.Item
                    onSelect={openCatalog}
                    badge={
                      apifoxConnected() || tapdConnected()
                        ? language.t("requirements.connector.connected")
                        : undefined
                    }
                  >
                    {language.t("requirements.connector.title")}
                  </MenuV2.Item>
                </MenuV2.Content>
              </MenuV2.Portal>
            </MenuV2>
            <TooltipV2 placement="top" gutter={4} value={language.t("command.model.choose")}>
              <ModelSelectorPopoverV2
                model={modelSelection as never}
                triggerAs={ButtonV2}
                triggerProps={{
                  variant: "ghost-muted",
                  size: "small",
                  class: "min-w-0 max-w-[200px] justify-start group",
                  "data-action": "requirements-model",
                }}
              >
                <Show when={model()?.provider.id}>
                  {(providerID) => (
                    <ProviderIcon
                      id={providerID()}
                      class="size-3.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                </Show>
                <span class="truncate">{model()?.name ?? language.t("dialog.model.select.title")}</span>
                <IconV2 name="chevron-down" size="small" class="shrink-0 opacity-60" />
              </ModelSelectorPopoverV2>
            </TooltipV2>
            <div class="flex-1" />
            <ButtonV2
              size="small"
              disabled={sending() || (!draft().trim() && resolveTurnAssets(draft()).length === 0)}
              onClick={() => void send()}
            >
              {sending() ? language.t("requirements.chat.sending") : language.t("requirements.chat.send")}
            </ButtonV2>
          </div>
        </div>
      </div>
    </section>
  )
}
