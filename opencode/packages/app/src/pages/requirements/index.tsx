import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDirectoryPicker } from "@/components/directory-picker"
import { attachmentMime } from "@/components/prompt-input/files"
import { ACCEPTED_IMAGE_TYPES } from "@/constants/file-picker"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { createTabPromptState } from "@/context/prompt"
import { createDraftPromptSession } from "@/context/prompt-state"
import { useServer } from "@/context/server"
import { useSettings } from "@/context/settings"
import { useTabs, tabKey, type Tab } from "@/context/tabs"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { displayName } from "@/pages/layout/helpers"
import { isIntegrationEmpty } from "./apifox"
import { serializeRequirementBrief } from "./brief"
import { findOpenTabForProject, pickLatestProjectSession } from "./handoff-coding"
import { useRequirements } from "./context"
import { DialogCreateRequirement } from "./dialog-create-requirement"
import { DialogTapdConfig } from "./dialog-tapd"
import { AssistantChatPanel } from "./assistant-chat"
import { AssetPreviewPane } from "./asset-preview"
import { SpecFormPanel, isRequirementDocumentEmpty } from "./spec-form-panel"
import { REQUIREMENT_SECTION_KEYS, parseDocumentSections } from "./document-template"
import { extractTapdWorkspaceId } from "./tapd"
import {
  canImportTapdImages,
  extractTapdStoryId,
  importTapdStoryImages,
  isImageAsset,
  normalizeAssetDataUrl,
  assetExtBadge,
  assetMimeFromFilename,
  assetPreviewKind,
  sniffMimeFromBytes,
} from "./tapd-import"
import type { RequirementAsset, RequirementProject } from "./types"
import { EMPTY_INTEGRATION } from "./types"
import { showToast } from "@/utils/toast"
import "./requirements.css"

const ASSET_MAX_BYTES = 8 * 1024 * 1024
const ASSET_PICKER_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "pdf",
  "xlsx",
  "xls",
  "csv",
  "txt",
  "md",
  "doc",
  "docx",
  "json",
]
const ASSET_ACCEPT = [
  ...ACCEPTED_IMAGE_TYPES,
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx",
  ".xls",
  ".csv",
  ".txt",
  ".md",
  ".doc",
  ".docx",
].join(",")

function isAllowedRequirementAsset(mime: string, filename: string) {
  const kind = assetPreviewKind({ mime, filename })
  if (kind === "image" || kind === "pdf" || kind === "spreadsheet" || kind === "doc") return true
  return mime.startsWith("text/") || mime === "application/json"
}

async function readFileAsAsset(file: File): Promise<{ dataUrl: string; mime: string; filename: string } | undefined> {
  if (file.size > ASSET_MAX_BYTES) return

  const filename = file.name || "attachment"
  const declared = (await attachmentMime(file)) || file.type || ""
  const fromName = assetMimeFromFilename(filename)

  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"))
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(file)
  })
  if (!raw.startsWith("data:")) return
  const idx = raw.indexOf(",")
  if (idx === -1) return
  const payload = raw.slice(idx + 1)

  let sniffed = ""
  try {
    const binary = atob(payload.slice(0, 96))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    sniffed = sniffMimeFromBytes(bytes, filename)
  } catch {
    // ignore
  }

  const mime =
    (sniffed && sniffed !== "application/octet-stream" && sniffed !== "application/zip" ? sniffed : "") ||
    (declared.startsWith("image/") || declared === "application/pdf" || declared.startsWith("text/") ? declared : "") ||
    (fromName !== "application/octet-stream" ? fromName : "") ||
    declared ||
    "application/octet-stream"

  if (!isAllowedRequirementAsset(mime, filename)) return

  return {
    dataUrl: `data:${mime};base64,${payload}`,
    mime,
    filename,
  }
}

function specFilledCount(project: RequirementProject): number {
  const sections = parseDocumentSections(project.document)
  return REQUIREMENT_SECTION_KEYS.filter((key) => sections[key].trim()).length
}

function specStatus(filled: number): "ready" | "draft" | "progress" {
  if (filled >= REQUIREMENT_SECTION_KEYS.length) return "ready"
  if (filled > 0) return "progress"
  return "draft"
}

export function RequirementsListPage() {
  const language = useLanguage()
  const requirements = useRequirements()
  const navigate = useNavigate()
  const dialog = useDialog()
  const layout = useLayout()
  const [query, setQuery] = createSignal("")
  const [systemFilter, setSystemFilter] = createSignal<string>("all")

  const systems = createMemo(() => {
    const map = new Map<string, string>()
    for (const item of requirements.projects()) {
      if (!item.systemDirectory) continue
      map.set(item.systemDirectory, item.systemName || item.systemDirectory)
    }
    for (const project of layout.projects.list()) {
      if (!map.has(project.worktree)) map.set(project.worktree, displayName(project))
    }
    return [...map.entries()].map(([directory, name]) => ({ directory, name }))
  })

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    const system = systemFilter()
    return requirements.projects().filter((item) => {
      if (system !== "all") {
        if (system === "unassigned") {
          if (item.systemDirectory) return false
        } else if (item.systemDirectory !== system) {
          return false
        }
      }
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        (item.systemName ?? "").toLowerCase().includes(q) ||
        (item.systemDirectory ?? "").toLowerCase().includes(q)
      )
    })
  })

  const openCreate = () => {
    void dialog.show(() => (
      <DialogCreateRequirement
        onCreated={(id) => {
          navigate(`/requirements/${id}`)
        }}
      />
    ))
  }

  return (
    <div data-component="requirements-shell" data-page="list" class="size-full min-h-0 flex flex-col">
      <header data-component="requirements-list-hero">
        <div data-component="requirements-list-hero-inner">
          <div class="min-w-0">
            <p data-component="requirements-list-eyebrow">{language.t("requirements.list.eyebrow")}</p>
            <h1 data-component="requirements-list-title">{language.t("requirements.title")}</h1>
            <p data-component="requirements-list-subtitle">{language.t("requirements.subtitle")}</p>
          </div>
          <ButtonV2 size="normal" variant="contrast" icon="plus" onClick={openCreate}>
            {language.t("requirements.action.new")}
          </ButtonV2>
        </div>
      </header>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <div data-component="requirements-list-content">
          <div data-component="requirements-list-toolbar">
            <div data-component="requirements-list-search">
              <IconV2 name="magnifying-glass" size="small" />
              <TextInputV2
                value={query()}
                placeholder={language.t("requirements.list.search")}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
            </div>
            <div data-component="requirements-list-filters" role="tablist" aria-label={language.t("requirements.list.filter.all")}>
              <button
                type="button"
                data-component="requirements-filter-chip"
                data-active={systemFilter() === "all" ? "true" : undefined}
                onClick={() => setSystemFilter("all")}
              >
                {language.t("requirements.list.filter.all")}
              </button>
              <button
                type="button"
                data-component="requirements-filter-chip"
                data-active={systemFilter() === "unassigned" ? "true" : undefined}
                onClick={() => setSystemFilter("unassigned")}
              >
                {language.t("requirements.list.filter.unassigned")}
              </button>
              <For each={systems()}>
                {(item) => (
                  <button
                    type="button"
                    data-component="requirements-filter-chip"
                    data-active={systemFilter() === item.directory ? "true" : undefined}
                    title={item.directory}
                    onClick={() => setSystemFilter(item.directory)}
                  >
                    {item.name}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div data-component="requirements-list-stats">
            <span>{language.t("requirements.list.count", { count: filtered().length })}</span>
            <span data-slot="dot" aria-hidden="true" />
            <span>{language.t("requirements.list.systems", { count: systems().length })}</span>
          </div>

          <Show
            when={filtered().length > 0}
            fallback={
              <div data-component="requirements-list-empty">
                <div data-slot="icon">
                  <IconV2 name="edit" />
                </div>
                <p data-slot="title">
                  {requirements.projects().length === 0
                    ? language.t("requirements.empty")
                    : language.t("requirements.list.emptyFilter")}
                </p>
                <p data-slot="hint">{language.t("requirements.empty.hint")}</p>
                <ButtonV2 size="normal" variant="contrast" onClick={openCreate}>
                  {language.t("requirements.action.new")}
                </ButtonV2>
              </div>
            }
          >
            <ul data-component="requirements-card-list">
              <For each={filtered()}>
                {(project) => <RequirementListCard project={project} onRemove={() => requirements.remove(project.id)} />}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </div>
  )
}

function RequirementListCard(props: { project: RequirementProject; onRemove: () => void }) {
  const language = useLanguage()
  const cover = () => props.project.assets.find((asset) => isImageAsset(asset)) ?? props.project.assets[0]
  const filled = () => specFilledCount(props.project)
  const status = () => specStatus(filled())
  const percent = () => Math.round((filled() / REQUIREMENT_SECTION_KEYS.length) * 100)
  const hasIntegration = () => !isIntegrationEmpty(props.project.integration)

  return (
    <li>
      <A href={`/requirements/${props.project.id}`} data-component="requirements-card">
        <div data-component="requirements-card-cover" data-empty={!cover() ? "true" : undefined}>
          <Show
            when={cover()}
            fallback={
              <div data-slot="placeholder">
                <IconV2 name="monitor" size="small" />
              </div>
            }
          >
            {(asset) => {
              const display = () => normalizeAssetDataUrl(asset())
              return display().kind === "image" ? (
                <img src={display().dataUrl} alt="" />
              ) : (
                <div class="flex h-full items-center justify-center text-12-regular text-v2-text-text-weak p-2 text-center">
                  {assetExtBadge(asset().filename)}
                </div>
              )
            }}
          </Show>
          <span data-component="requirements-status" data-status={status()}>
            {status() === "ready"
              ? language.t("requirements.status.ready")
              : status() === "progress"
                ? language.t("requirements.status.progress")
                : language.t("requirements.status.draft")}
          </span>
        </div>
        <div data-component="requirements-card-body">
          <div data-component="requirements-card-title-row">
            <h2 data-component="requirements-card-title">{props.project.title}</h2>
            <Show when={props.project.systemName || props.project.systemDirectory}>
              <span data-component="requirements-system-chip">
                {props.project.systemName || props.project.systemDirectory}
              </span>
            </Show>
          </div>

          <div data-component="requirements-card-progress">
            <div data-component="requirements-progress-track">
              <div data-component="requirements-progress-fill" style={{ width: `${percent()}%` }} />
            </div>
            <span>{language.t("requirements.meta.spec", { count: filled() })}</span>
          </div>

          <div data-component="requirements-card-meta">
            <span>{language.t("requirements.meta.assets", { count: props.project.assets.length })}</span>
            <Show when={hasIntegration()}>
              <span data-slot="integration">{language.t("requirements.meta.integration")}</span>
            </Show>
            <span data-slot="time">{new Date(props.project.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        <button
          type="button"
          data-component="requirements-card-delete"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            props.onRemove()
          }}
        >
          {language.t("common.delete")}
        </button>
      </A>
    </li>
  )
}

export function RequirementsEditorPage() {
  const language = useLanguage()
  const requirements = useRequirements()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dialog = useDialog()
  const layout = useLayout()
  const server = useServer()
  const global = useGlobal()
  const settings = useSettings()
  const tabs = useTabs()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const [previewId, setPreviewId] = createSignal<string>()
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set())
  const [chatAssetIds, setChatAssetIds] = createSignal<Set<string>>(new Set())
  const [composerFocusTick, setComposerFocusTick] = createSignal(0)
  const [handoffError, setHandoffError] = createSignal<string>()
  const [sendingHandoff, setSendingHandoff] = createSignal(false)
  const [dragging, setDragging] = createSignal(false)
  const [importingTapd, setImportingTapd] = createSignal(false)

  const project = createMemo(() => requirements.projects().find((item) => item.id === params.id))

  const canImportTapd = createMemo(() => {
    const item = project()?.integration ?? EMPTY_INTEGRATION
    const workspace =
      item.tapdWorkspaceId.trim() ||
      extractTapdWorkspaceId(item.tapdUrl) ||
      extractTapdWorkspaceId(item.tapdStoryUrl) ||
      ""
    return canImportTapdImages({
      tapdWorkspaceId: workspace,
      tapdStoryUrl: item.tapdStoryUrl,
      tapdAccessToken: item.tapdAccessToken,
    })
  })

  createEffect(() => {
    const current = project()
    if (!current) return
    const ids = current.assets.map((asset) => asset.id)
    const idSet = new Set(ids)
    setSelectedIds((prev) => {
      const next = new Set<string>()
      for (const id of ids) {
        if (prev.size === 0 || prev.has(id)) next.add(id)
      }
      if (next.size === 0) for (const id of ids) next.add(id)
      return next
    })
    setChatAssetIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (idSet.has(id)) next.add(id)
      }
      return next
    })
  })

  const preview = createMemo(() => {
    const current = project()
    if (!current) return
    const id = previewId()
    return current.assets.find((asset) => asset.id === id) ?? current.assets[0]
  })

  const chatAssets = createMemo(() => {
    const current = project()
    if (!current) return [] as RequirementAsset[]
    const pinned = chatAssetIds()
    return current.assets.filter((asset) => pinned.has(asset.id))
  })

  const analysisAssets = createMemo(() => {
    const current = project()
    if (!current) return [] as RequirementAsset[]
    const selected = selectedIds()
    const pinned = chatAssetIds()
    const images = current.assets.filter((asset) => isImageAsset(asset))
    const filtered = images.filter((asset) => selected.has(asset.id) || pinned.has(asset.id))
    return filtered.length > 0 ? filtered : images
  })

  const canSendToCoding = createMemo(() => {
    const current = project()
    if (!current) return false
    if ((current.handoffMessageIds?.length ?? 0) > 0) return true
    return !isRequirementDocumentEmpty(current.document)
  })

  const addFiles = async (files: FileList | File[], opts?: { attachToChat?: boolean }) => {
    const current = project()
    if (!current) return
    let added = 0
    let tooLarge = 0
    for (const file of Array.from(files)) {
      if (file.size > ASSET_MAX_BYTES) {
        tooLarge += 1
        continue
      }
      const loaded = await readFileAsAsset(file)
      if (!loaded) continue
      const asset = requirements.addAsset(current.id, loaded)
      if (!asset) continue
      added += 1
      setPreviewId(asset.id)
      if (isImageAsset(asset)) {
        setSelectedIds((prev) => new Set([...prev, asset.id]))
      }
      if (opts?.attachToChat) {
        setChatAssetIds((prev) => {
          if (prev.has(asset.id)) return prev
          const next = new Set(prev)
          next.add(asset.id)
          return next
        })
      }
    }
    if (tooLarge > 0) {
      showToast({
        title: language.t("requirements.assets.tooLargeTitle"),
        description: language.t("requirements.assets.tooLarge"),
      })
    }
    if (added === 0 && Array.from(files).length > 0) {
      showToast({
        title: language.t("prompt.toast.pasteUnsupported.title"),
        description: language.t("requirements.assets.addUnsupported"),
      })
      return
    }
    if (opts?.attachToChat && added > 0) {
      setComposerFocusTick((tick) => tick + 1)
    }
  }

  const openPicker = async (opts?: { attachToChat?: boolean }) => {
    if (platform.openAttachmentPickerDialog) {
      await platform.openAttachmentPickerDialog(
        {
          multiple: true,
          accept: [...ACCEPTED_IMAGE_TYPES, "application/pdf", "text/csv", "text/plain", "application/json"],
          extensions: ASSET_PICKER_EXTENSIONS,
          title: language.t("requirements.action.addAsset"),
        },
        async (file) => {
          await addFiles([file], opts)
        },
      )
      return
    }
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ASSET_ACCEPT
    input.multiple = true
    input.onchange = () => {
      if (input.files?.length) void addFiles(input.files, opts)
    }
    input.click()
  }

  const onPaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
    if (files.length === 0) return
    event.preventDefault()
    void addFiles(files, { attachToChat: true })
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const files = event.dataTransfer?.files
    if (files?.length) void addFiles(files, { attachToChat: true })
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addAssetToChat = (id: string) => {
    setChatAssetIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
    const asset = project()?.assets.find((item) => item.id === id)
    if (asset && isImageAsset(asset)) {
      setSelectedIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
    }
    setPreviewId(id)
    setComposerFocusTick((tick) => tick + 1)
  }

  const removeAssetFromChat = (id: string) => {
    setChatAssetIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const clearChatAssets = () => {
    setChatAssetIds(new Set())
  }

  const openTapdImport = () => {
    const current = project()
    if (!current) return
    if (!canImportTapd()) {
      void dialog.show(() => (
        <DialogTapdConfig
          projectId={current.id}
          onImported={(ids) => {
            if (ids.length === 0) return
            const images = ids.filter((id) => {
              const asset = requirements.projects().find((item) => item.id === current.id)?.assets.find((a) => a.id === id)
              return asset ? isImageAsset(asset) : false
            })
            setSelectedIds((prev) => new Set([...prev, ...images]))
            setPreviewId(ids[0])
          }}
        />
      ))
      return
    }
    void importFromTapd()
  }

  const importFromTapd = async () => {
    const current = project()
    if (!current) return
    if (!canImportTapd()) {
      showToast({ title: language.t("requirements.tapd.importNeed") })
      return
    }
    if (importingTapd()) return
    setImportingTapd(true)
    try {
      const item = current.integration ?? EMPTY_INTEGRATION
      const workspaceId =
        item.tapdWorkspaceId.trim() ||
        extractTapdWorkspaceId(item.tapdUrl) ||
        extractTapdWorkspaceId(item.tapdStoryUrl) ||
        ""
      const storyId = extractTapdStoryId(item.tapdStoryUrl) || ""
      const existing = new Set(current.assets.map((asset) => `${asset.note}::${asset.filename}`))
      const { images, errors } = await importTapdStoryImages({
        workspaceId,
        storyId,
        accessToken: item.tapdAccessToken.trim(),
        fetch: platform.fetch ?? fetch,
      })
      const addedIds: string[] = []
      for (const image of images) {
        const key = `${image.note}::${image.filename}`
        if (existing.has(key)) continue
        existing.add(key)
        const asset = requirements.addAsset(current.id, {
          filename: image.filename,
          mime: image.mime,
          dataUrl: image.dataUrl,
          note: image.note,
        })
        if (asset) addedIds.push(asset.id)
      }
      if (addedIds.length > 0) {
        const imageIds = addedIds.filter((id) => {
          const asset = requirements.projects().find((item) => item.id === current.id)?.assets.find((a) => a.id === id)
          return asset ? isImageAsset(asset) : false
        })
        setSelectedIds((prev) => new Set([...prev, ...imageIds]))
        setPreviewId(addedIds[0])
      }
      if (addedIds.length === 0 && errors.length === 0) {
        showToast({ title: language.t("requirements.tapd.importEmpty") })
      } else if (errors.length > 0 && addedIds.length > 0) {
        showToast({
          title: language.t("requirements.tapd.importPartial", {
            ok: addedIds.length,
            fail: errors.length,
          }),
          description: errors[0],
        })
      } else if (addedIds.length > 0) {
        showToast({ title: language.t("requirements.tapd.importOk", { count: addedIds.length }) })
      } else {
        showToast({
          title: language.t("requirements.tapd.importFailed"),
          description: errors[0],
        })
      }
    } catch (err) {
      showToast({
        title: language.t("requirements.tapd.importFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setImportingTapd(false)
    }
  }

  const applyBriefToTab = (tab: Tab, brief: string, sessionDirectory?: string) => {
    const parts = [{ type: "text" as const, content: brief, start: 0, end: brief.length }]
    if (tab.type === "draft") {
      const promptSession = tabs.state(tab, "prompt", () => createDraftPromptSession(tab.draftID))
      promptSession.set(parts, brief.length)
      tabs.select(tab)
      return true
    }
    const conn = server.current
    if (!conn) return false
    const ctx = global.ensureServerCtx(conn)
    const directory =
      sessionDirectory ?? tabs.info[tabKey(tab)]?.directory ?? ctx.sync.session.peek(tab.sessionId)?.directory
    if (!directory) return false
    const promptSession = createTabPromptState(tabs, tab, ctx.sdk.scope, {
      dir: base64Encode(directory),
      id: tab.sessionId,
    })
    promptSession.set(parts, brief.length)
    tabs.select(tab)
    return true
  }

  const sendToCoding = async () => {
    const current = project()
    if (!current || sendingHandoff()) return
    setHandoffError()
    if (!canSendToCoding()) {
      setHandoffError(language.t("requirements.handoff.needContent"))
      return
    }
    const directory = current.systemDirectory
    if (!directory) {
      setHandoffError(language.t("requirements.editor.needLinkedProject"))
      return
    }

    const brief = serializeRequirementBrief(current)
    setSendingHandoff(true)
    try {
      layout.projects.open(directory)
      server.projects.touch(directory)

      const conn = server.current
      if (!conn) {
        setHandoffError(language.t("requirements.handoff.noProject"))
        return
      }
      const ctx = global.ensureServerCtx(conn)

      const openTab = findOpenTabForProject({
        tabs: [...tabs.store],
        server: server.key,
        directory,
        sessionDirectory: (sessionId) =>
          tabs.info[tabKey({ type: "session", server: server.key, sessionId })]?.directory ??
          ctx.sync.session.peek(sessionId)?.directory,
      })
      if (openTab && applyBriefToTab(openTab, brief)) return

      await ctx.sync.project.loadSessions(directory)
      const [child] = ctx.sync.child(directory, { bootstrap: false })
      const latest = pickLatestProjectSession(child.session)
      if (latest) {
        const sessionTab = { type: "session" as const, server: server.key, sessionId: latest.id }
        const tab = tabs.addSessionTab(sessionTab)
        tabs.rememberSessionInfo(sessionTab, latest)
        if (applyBriefToTab(tab, brief, latest.directory)) {
          if (!settings.general.newLayoutDesigns()) {
            navigate(`/${base64Encode(directory)}/session/${latest.id}`)
          }
          return
        }
      }

      if (settings.general.newLayoutDesigns()) {
        await tabs.newDraft({ server: server.key, directory }, brief)
        return
      }

      navigate(`/${base64Encode(directory)}/session?prompt=${encodeURIComponent(brief)}`)
    } finally {
      setSendingHandoff(false)
    }
  }

  const systemOptions = createMemo(() => {
    const map = new Map<string, { directory: string; name: string }>()
    const push = (directory: string, name: string) => {
      if (!directory || map.has(directory)) return
      map.set(directory, { directory, name })
    }
    const last = server.projects.last()
    if (last) push(last, last.split(/[/\\]/).filter(Boolean).at(-1) ?? last)
    for (const closed of server.projects.recentlyClosed()) {
      push(closed, closed.split(/[/\\]/).filter(Boolean).at(-1) ?? closed)
    }
    for (const item of layout.projects.list()) {
      push(item.worktree, displayName(item))
    }
    const current = project()
    if (current?.systemDirectory) {
      push(current.systemDirectory, current.systemName || current.systemDirectory)
    }
    return [...map.values()]
  })

  const bindLinkedProject = (directory: string, name: string) => {
    const id = project()?.id
    if (!id) return
    requirements.setSystem(id, { directory, name })
    layout.projects.open(directory)
    server.projects.touch(directory)
  }

  const browseLinkedProject = () => {
    const conn = server.current
    if (!conn) return
    pickDirectory({
      server: conn,
      title: language.t("requirements.field.browseProject"),
      onSelect: (result) => {
        const directory = Array.isArray(result) ? result[0] : result
        if (!directory) return
        const name = directory.split(/[/\\]/).filter(Boolean).at(-1) ?? directory
        bindLinkedProject(directory, name)
      },
    })
  }

  return (
    <Show
      when={project()}
      fallback={
        <div class="size-full flex flex-col items-center justify-center gap-3">
          <p class="text-14-regular text-v2-text-text-muted">{language.t("requirements.notFound")}</p>
          <A href="/requirements" class="text-14-medium text-v2-text-text-base underline">
            {language.t("requirements.action.backToList")}
          </A>
        </div>
      }
    >
      {(current) => (
        <div
          data-component="requirements-shell"
          class="size-full min-h-0 flex flex-col"
          onPaste={onPaste}
          onDragEnter={(event) => {
            event.preventDefault()
            if (event.dataTransfer?.types.includes("Files")) setDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false)
          }}
          onDrop={onDrop}
        >
          <header data-component="requirements-editor-header">
            <A href="/requirements" data-component="requirements-back-link">
              <IconV2 name="chevron-down" size="small" style={{ transform: "rotate(90deg)" }} />
              {language.t("requirements.action.backToList")}
            </A>
            <div data-component="requirements-editor-title">
              <TextInputV2
                value={current().title}
                onInput={(event) => requirements.rename(current().id, event.currentTarget.value)}
                placeholder={language.t("requirements.field.title")}
                aria-label={language.t("requirements.field.title")}
              />
            </div>
            <div
              data-component="requirements-editor-project"
              title={
                current().systemDirectory
                  ? current().systemDirectory
                  : language.t("requirements.editor.needLinkedProject")
              }
              data-missing={!current().systemDirectory || undefined}
            >
              <IconV2 name="folder" size="small" />
              <Show
                when={systemOptions().length > 0 || current().systemDirectory}
                fallback={
                  <span data-component="requirements-editor-project-empty">
                    {language.t("requirements.editor.noOpenProjects")}
                  </span>
                }
              >
                <SelectV2
                  appearance="inline"
                  options={systemOptions()}
                  current={
                    systemOptions().find((item) => item.directory === current().systemDirectory) ??
                    (current().systemDirectory
                      ? {
                          directory: current().systemDirectory!,
                          name: current().systemName || current().systemDirectory!,
                        }
                      : undefined)
                  }
                  value={(item) => item.directory}
                  label={(item) => item.name}
                  placeholder={language.t("requirements.field.linkedProjectPlaceholder")}
                  onSelect={(item) => {
                    if (!item) {
                      requirements.setSystem(current().id, undefined)
                      return
                    }
                    bindLinkedProject(item.directory, item.name)
                  }}
                />
              </Show>
              <ButtonV2
                size="small"
                variant="ghost"
                data-component="requirements-editor-project-browse"
                onClick={browseLinkedProject}
                title={language.t("requirements.field.browseProject")}
              >
                {language.t("requirements.field.browseProject")}
              </ButtonV2>
            </div>
          </header>
          <Show when={dragging()}>
            <div data-component="requirements-drop-banner" class="mt-2">
              {language.t("requirements.assets.dropHere")}
            </div>
          </Show>
          <div data-component="requirements-editor-grid">
            <AssetsPanel
              project={current()}
              preview={preview()}
              selectedIds={selectedIds()}
              chatAssetIds={chatAssetIds()}
              importingTapd={importingTapd()}
              onImportTapd={openTapdImport}
              onSelect={setPreviewId}
              onToggleSelected={toggleSelected}
              onAddToChat={addAssetToChat}
              onRemoveFromChat={removeAssetFromChat}
              onAddFiles={addFiles}
              onNote={(assetId, note) => requirements.updateAssetNote(current().id, assetId, note)}
              onRemove={(assetId) => requirements.removeAsset(current().id, assetId)}
              openPicker={openPicker}
            />
            <AssistantChatPanel
              project={current()}
              analysisAssets={analysisAssets()}
              chatAssets={chatAssets()}
              composerFocusTick={composerFocusTick()}
              onRemoveChatAsset={removeAssetFromChat}
              onClearChatAssets={clearChatAssets}
              onAddAssets={() => void openPicker({ attachToChat: true })}
            />
            <SpecFormPanel
              projectId={current().id}
              document={current().document}
              onChange={(value) => requirements.setDocument(current().id, value)}
              integration={current().integration}
              handoffCount={current().handoffMessageIds?.length ?? 0}
              canSend={canSendToCoding()}
              sending={sendingHandoff()}
              sendError={handoffError()}
              onSend={() => void sendToCoding()}
            />
          </div>
        </div>
      )}
    </Show>
  )
}

function AssetsPanel(props: {
  project: RequirementProject
  preview: RequirementAsset | undefined
  selectedIds: Set<string>
  chatAssetIds: Set<string>
  importingTapd: boolean
  onImportTapd: () => void
  onSelect: (id: string) => void
  onToggleSelected: (id: string) => void
  onAddToChat: (id: string) => void
  onRemoveFromChat: (id: string) => void
  onAddFiles: (files: FileList | File[]) => void | Promise<void>
  onNote: (assetId: string, note: string) => void
  onRemove: (assetId: string) => void
  openPicker: () => void | Promise<void>
}) {
  const language = useLanguage()
  let input: HTMLInputElement | undefined

  return (
    <section data-component="requirements-panel">
      <div data-component="requirements-panel-header" data-layout="stack">
        <div data-slot="heading" class="flex items-center justify-between gap-2 min-w-0">
          <h2 data-component="requirements-panel-title">{language.t("requirements.panel.assets")}</h2>
        </div>
        <div data-slot="actions">
          <ButtonV2
            size="small"
            variant="ghost"
            disabled={props.importingTapd}
            onClick={props.onImportTapd}
            title={language.t("requirements.tapd.importFromTapdHint")}
          >
            {props.importingTapd
              ? language.t("requirements.tapd.importing")
              : language.t("requirements.tapd.importFromTapd")}
          </ButtonV2>
          <ButtonV2
            size="small"
            variant="ghost"
            icon="plus"
            onClick={() => void props.openPicker()}
            title={language.t("requirements.action.addAsset")}
          >
            {language.t("requirements.action.addAssetShort")}
          </ButtonV2>
        </div>
        <input
          ref={input}
          type="file"
          accept={ASSET_ACCEPT}
          multiple
          class="hidden"
          onChange={(event) => {
            const files = event.currentTarget.files
            if (files?.length) void props.onAddFiles(files)
            event.currentTarget.value = ""
          }}
        />
      </div>

      <div data-component="requirements-canvas" class="shrink-0 min-h-[200px] max-h-[320px] flex-[0_0_auto]">
        <Show
          when={props.preview?.id}
          fallback={
            <button type="button" data-component="requirements-canvas-empty" onClick={() => input?.click()}>
              <span data-slot="icon">
                <IconV2 name="monitor" size="small" />
              </span>
              <span class="text-12-medium text-v2-text-text-base">{language.t("requirements.assets.emptyTitle")}</span>
              <span class="text-12-regular text-v2-text-text-weak">{language.t("requirements.assets.empty")}</span>
            </button>
          }
          keyed
        >
          {(id) => {
            const asset = () => props.project.assets.find((item) => item.id === id) ?? props.preview!
            return <AssetPreviewPane assetId={id} asset={asset()} />
          }}
        </Show>
      </div>

      <Show when={props.preview}>
        {(asset) => (
          <div class="shrink-0 px-3 py-2 border-b border-v2-border-border-weak">
            <TextInputV2
              value={asset().note}
              placeholder={language.t("requirements.field.assetNote")}
              onInput={(event) => props.onNote(asset().id, event.currentTarget.value)}
            />
          </div>
        )}
      </Show>

      <div class="flex-1 min-h-0 overflow-y-auto p-2">
        <Show when={props.project.assets.length > 0}>
          <ul class="flex flex-col gap-1">
            <For each={props.project.assets}>
              {(asset) => {
                const display = () => normalizeAssetDataUrl(asset)
                const image = () => display().kind === "image"
                const inChat = () => props.chatAssetIds.has(asset.id)
                return (
                  <li
                    classList={{
                      "bg-v2-background-bg-layer-03 ring-1 ring-v2-border-border-weak": props.preview?.id === asset.id,
                    }}
                  >
                    <ContextMenu>
                      <ContextMenu.Trigger
                        as="div"
                        class="group flex w-full min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5 hover:bg-v2-overlay-simple-overlay-hover"
                      >
                        <input
                          type="checkbox"
                          class="shrink-0"
                          checked={image() && props.selectedIds.has(asset.id)}
                          disabled={!image()}
                          title={image() ? undefined : language.t("requirements.assets.analyzeImagesOnly")}
                          onChange={() => {
                            if (image()) props.onToggleSelected(asset.id)
                          }}
                          aria-label={language.t("requirements.assets.includeInAnalysis")}
                        />
                        <button type="button" class="min-w-0 flex-1 flex items-center gap-2 text-left" onClick={() => props.onSelect(asset.id)}>
                          <Show
                            when={image()}
                            fallback={
                              <div data-component="requirements-thumb" data-kind={display().kind}>
                                {assetExtBadge(asset.filename)}
                              </div>
                            }
                          >
                            <img data-component="requirements-thumb" src={display().dataUrl} alt="" />
                          </Show>
                          <div class="min-w-0 flex-1">
                            <div class="text-12-medium text-v2-text-text-base truncate">{asset.filename}</div>
                            <Show when={asset.note.trim() || inChat()}>
                              <div class="text-12-regular text-v2-text-text-weak truncate">
                                <Show when={inChat()}>
                                  <span data-slot="in-chat">{language.t("requirements.assets.inChat")}</span>
                                </Show>
                                <Show when={inChat() && asset.note.trim()}> · </Show>
                                <Show when={asset.note.trim()}>{asset.note}</Show>
                              </div>
                            </Show>
                          </div>
                        </button>
                        <button
                          type="button"
                          class="opacity-0 group-hover:opacity-100 text-12-regular text-v2-text-text-weak"
                          onClick={() => props.onRemove(asset.id)}
                        >
                          {language.t("common.delete")}
                        </button>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content>
                          <Show
                            when={inChat()}
                            fallback={
                              <ContextMenu.Item onSelect={() => props.onAddToChat(asset.id)}>
                                <ContextMenu.ItemLabel>{language.t("prompt.action.addToChat")}</ContextMenu.ItemLabel>
                              </ContextMenu.Item>
                            }
                          >
                            <ContextMenu.Item onSelect={() => props.onRemoveFromChat(asset.id)}>
                              <ContextMenu.ItemLabel>{language.t("prompt.action.removeFromChat")}</ContextMenu.ItemLabel>
                            </ContextMenu.Item>
                          </Show>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu>
                  </li>
                )
              }}
            </For>
          </ul>
        </Show>
      </div>
    </section>
  )
}
