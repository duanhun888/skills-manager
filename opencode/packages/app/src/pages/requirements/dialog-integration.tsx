import { For, Show, createMemo, createSignal } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogBody, DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { uuid } from "@/utils/uuid"
import {
  APIFOX_MCP_DOCS,
  APIFOX_TOKEN_DOCS,
  buildApifoxMcpConfig,
  buildApifoxMcpEntry,
  extractApifoxFolderId,
  extractApifoxProjectId,
  isApifoxReady,
  mergeApiRefs,
  parseApiLines,
  parseApifoxFolderIds,
  resolveApifoxMcpServerName,
} from "./apifox"
import { canImportApifoxApis, fetchApifoxApiOperations, type ApifoxOpenApiOperation } from "./apifox-import"
import { useRequirements } from "./context"
import type { RequirementApiRef, RequirementIntegration } from "./types"
import { EMPTY_INTEGRATION } from "./types"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

export function DialogIntegrationConfig(props: { projectId: string }) {
  const language = useLanguage()
  const dialog = useDialog()
  const requirements = useRequirements()
  const platform = usePlatform()
  const serverSDK = useServerSDK()

  const project = createMemo(() => requirements.projects().find((item) => item.id === props.projectId))
  const integration = createMemo(() => project()?.integration ?? EMPTY_INTEGRATION)

  const [draftMethod, setDraftMethod] = createSignal<string>("POST")
  const [draftPath, setDraftPath] = createSignal("")
  const [draftName, setDraftName] = createSignal("")
  const [bulkOpen, setBulkOpen] = createSignal(false)
  const [bulkText, setBulkText] = createSignal("")
  const [mcpPreviewOpen, setMcpPreviewOpen] = createSignal(false)
  const [importing, setImporting] = createSignal(false)
  const [writingMcp, setWritingMcp] = createSignal(false)
  const [catalog, setCatalog] = createSignal<ApifoxOpenApiOperation[]>([])
  const [catalogOpen, setCatalogOpen] = createSignal(false)
  const [catalogQuery, setCatalogQuery] = createSignal("")
  const [pickedKeys, setPickedKeys] = createSignal<Set<string>>(new Set())
  const [selectedApiIds, setSelectedApiIds] = createSignal<Set<string>>(new Set())

  const patch = (next: Partial<RequirementIntegration>) => {
    requirements.setIntegration(props.projectId, next)
  }

  const resolvedProjectId = createMemo(
    () => integration().apifoxProjectId.trim() || extractApifoxProjectId(integration().apifoxUrl) || "",
  )

  const accessToken = createMemo(() => integration().apifoxAccessToken.trim())

  const canImport = createMemo(() =>
    canImportApifoxApis({ projectId: resolvedProjectId(), accessToken: accessToken() }),
  )

  const linkedDirectory = createMemo(() => project()?.systemDirectory?.trim() || "")

  const mcpServerName = createMemo(() =>
    resolveApifoxMcpServerName(project()?.systemName, project()?.title),
  )

  const mcpPreview = createMemo(() =>
    buildApifoxMcpConfig({
      projectId: resolvedProjectId() || "<project-id>",
      serverName: mcpServerName(),
      // Mask in preview; copy / write use the real token
      accessToken: accessToken() ? "••••••••" : undefined,
    }),
  )

  const filteredCatalog = createMemo(() => {
    const q = catalogQuery().trim().toLowerCase()
    const rows = catalog()
    if (!q) return rows
    return rows.filter(
      (api) =>
        api.path.toLowerCase().includes(q) ||
        api.method.toLowerCase().includes(q) ||
        api.name.toLowerCase().includes(q),
    )
  })

  const onApifoxBind = (value: string) => {
    const trimmed = value.trim()
    const extracted = extractApifoxProjectId(trimmed)
    const folderFromUrl = extractApifoxFolderId(trimmed)
    const looksLikeUrl = /apifox\.com|https?:\/\//i.test(trimmed)
    if (!trimmed) {
      patch({ apifoxUrl: "", apifoxProjectId: "" })
      return
    }
    if (looksLikeUrl) {
      patch({
        apifoxUrl: trimmed,
        apifoxProjectId: extracted ?? "",
        ...(folderFromUrl && !/^\d+$/.test(trimmed) ? { apifoxFolderId: folderFromUrl } : {}),
      })
      return
    }
    patch({ apifoxUrl: "", apifoxProjectId: extracted ?? trimmed })
  }

  const onFolderBind = (value: string) => {
    const extracted = extractApifoxFolderId(value)
    const looksLikeUrl = /apifox\.com|folder-/i.test(value)
    patch({ apifoxFolderId: looksLikeUrl && extracted ? extracted : value })
  }

  const addApi = () => {
    const path = draftPath().trim()
    const name = draftName().trim()
    if (!path && !name) {
      showToast({ title: language.t("requirements.integration.addApiNeedPath") })
      return
    }
    const next: RequirementApiRef = {
      id: uuid(),
      method: draftMethod(),
      path: path || name,
      name,
    }
    patch({ apis: [...integration().apis, next] })
    setDraftPath("")
    setDraftName("")
  }

  const importBulk = () => {
    const parsed = parseApiLines(bulkText())
    if (parsed.length === 0) return
    const { next, added, updated } = mergeApiRefs(integration().apis, parsed, uuid)
    patch({ apis: next })
    setBulkText("")
    setBulkOpen(false)
    showToast({
      title: toastForMerge(added, updated),
    })
  }

  const removeApi = (id: string) => {
    patch({ apis: integration().apis.filter((item) => item.id !== id) })
    setSelectedApiIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const toggleSelectApi = (id: string) => {
    setSelectedApiIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllApis = () => {
    setSelectedApiIds(new Set(integration().apis.map((api) => api.id)))
  }

  const clearSelectedApis = () => setSelectedApiIds(new Set())

  const removeSelectedApis = () => {
    const selected = selectedApiIds()
    if (selected.size === 0) {
      showToast({ title: language.t("requirements.integration.deleteNeedPick") })
      return
    }
    const count = selected.size
    patch({ apis: integration().apis.filter((api) => !selected.has(api.id)) })
    setSelectedApiIds(new Set())
    showToast({ title: language.t("requirements.integration.deletedCount", { count }) })
  }

  const clearAllApis = () => {
    const count = integration().apis.length
    if (count === 0) return
    patch({ apis: [] })
    setSelectedApiIds(new Set())
    showToast({ title: language.t("requirements.integration.deletedCount", { count }) })
  }

  const apiKey = (api: { method: string; path: string }) =>
    `${api.method.trim().toUpperCase()} ${api.path.trim()}`

  const togglePick = (api: ApifoxOpenApiOperation) => {
    const key = apiKey(api)
    setPickedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllFiltered = () => {
    setPickedKeys((prev) => {
      const next = new Set(prev)
      for (const api of filteredCatalog()) next.add(apiKey(api))
      return next
    })
  }

  const clearPicks = () => setPickedKeys(new Set())

  const toastForMerge = (added: number, updated: number) => {
    if (added > 0 && updated > 0) {
      return language.t("requirements.integration.bulkImportedAndUpdated", { added, updated })
    }
    if (updated > 0) return language.t("requirements.integration.bulkUpdated", { count: updated })
    return language.t("requirements.integration.bulkImported", { count: added })
  }

  const applyPickedApis = () => {
    const selected = catalog().filter((api) => pickedKeys().has(apiKey(api)))
    if (selected.length === 0) {
      showToast({ title: language.t("requirements.integration.importNeedPick") })
      return
    }
    const { next, added, updated } = mergeApiRefs(integration().apis, selected, uuid)
    patch({ apis: next })
    setCatalogOpen(false)
    setPickedKeys(new Set())
    showToast({
      title: toastForMerge(added, updated),
    })
  }

  const importFromApifox = async () => {
    if (!canImport()) {
      showToast({ title: language.t("requirements.integration.importNeed") })
      return
    }
    if (importing()) return
    setImporting(true)
    try {
      const folderIds = parseApifoxFolderIds(integration().apifoxFolderId)
      const { apis, error } = await fetchApifoxApiOperations({
        projectId: resolvedProjectId(),
        accessToken: accessToken(),
        folderIds: folderIds.length > 0 ? folderIds : undefined,
        fetch: platform.fetch ?? fetch,
      })
      if (error || apis.length === 0) {
        showToast({
          title: language.t("requirements.integration.importFailed"),
          description: error === "empty_openapi"
            ? folderIds.length > 0
              ? language.t("requirements.integration.importEmptyFolder")
              : language.t("requirements.integration.importEmpty")
            : error,
        })
        return
      }
      const existingByKey = new Map(
        integration().apis.map((api) => [apiKey(api), api] as const),
      )
      setCatalog(apis)
      setPickedKeys(
        new Set(
          apis
            .filter((api) => {
              const current = existingByKey.get(apiKey(api))
              if (!current) return true
              const incomingHas = !!(api.requestSummary?.trim() || api.responseSummary?.trim())
              const currentHas = !!(current.requestSummary?.trim() || current.responseSummary?.trim())
              return incomingHas && !currentHas
            })
            .map(apiKey),
        ),
      )
      setCatalogQuery("")
      setCatalogOpen(true)
      const schemaCount = apis.filter((api) => api.requestSummary?.trim() || api.responseSummary?.trim()).length
      showToast({
        title: language.t("requirements.integration.importLoaded", { count: apis.length }),
        description:
          schemaCount > 0
            ? language.t("requirements.integration.importLoadedSchema", { count: schemaCount })
            : language.t("requirements.integration.importLoadedNoSchema"),
      })
    } catch (err) {
      showToast({
        title: language.t("requirements.integration.importFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setImporting(false)
    }
  }

  const copyMcp = async () => {
    if (!resolvedProjectId()) {
      showToast({ title: language.t("requirements.integration.mcpNeedId") })
      return
    }
    try {
      const text = buildApifoxMcpConfig({
        projectId: resolvedProjectId(),
        serverName: mcpServerName(),
        accessToken: accessToken() || undefined,
      })
      await navigator.clipboard.writeText(text)
      showToast({
        title: language.t("requirements.integration.mcpCopied"),
        description: accessToken()
          ? language.t("requirements.integration.mcpCopiedWithToken")
          : language.t("requirements.integration.mcpCopiedHint"),
      })
    } catch {
      showToast({ title: language.t("requirements.integration.mcpCopyFailed") })
    }
  }

  const writeMcpToProject = async () => {
    const directory = linkedDirectory()
    if (!directory) {
      showToast({ title: language.t("requirements.integration.mcpNeedProject") })
      return
    }
    if (!resolvedProjectId()) {
      showToast({ title: language.t("requirements.integration.mcpNeedId") })
      return
    }
    if (!accessToken()) {
      showToast({ title: language.t("requirements.integration.mcpNeedToken") })
      return
    }
    if (writingMcp()) return
    setWritingMcp(true)
    try {
      const { name, config } = buildApifoxMcpEntry({
        projectId: resolvedProjectId(),
        serverName: mcpServerName(),
        accessToken: accessToken(),
      })
      const client = serverSDK.createClient({ directory })
      const updated = await client.config.update({
        config: {
          mcp: { [name]: config },
        },
      })
      if (updated.error) {
        throw new Error(
          typeof updated.error === "object" && updated.error && "message" in updated.error
            ? String((updated.error as { message?: unknown }).message)
            : String(updated.error),
        )
      }
      const added = await client.mcp.add({
        name,
        config,
      })
      if (added.error) {
        // Persist succeeded; runtime add is best-effort
        showToast({
          title: language.t("requirements.integration.mcpWritten"),
          description: language.t("requirements.integration.mcpWrittenRuntimeHint"),
        })
        return
      }
      showToast({
        title: language.t("requirements.integration.mcpWritten"),
        description: language.t("requirements.integration.mcpWrittenHint", { name }),
      })
    } catch (err) {
      showToast({
        title: language.t("requirements.integration.mcpWriteFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setWritingMcp(false)
    }
  }

  const openApifox = () => {
    const url = integration().apifoxUrl.trim()
    if (url) {
      platform.openLink(url)
      return
    }
    const id = resolvedProjectId()
    if (id) platform.openLink(`https://app.apifox.com/project/${id}`)
  }

  return (
    <DialogV2 size="x-large" containerClass="requirements-integration-dialog-container">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("requirements.integration.title")}
          description={language.t("requirements.integration.dialogHint")}
        />
      </DialogHeader>
      <DialogBody class="requirements-integration-dialog-body">
        <section data-component="requirements-integ-section">
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.integration.step1")}</h3>
            <div data-component="requirements-integ-actions">
              <button type="button" data-component="requirements-integ-link" onClick={() => platform.openLink(APIFOX_MCP_DOCS)}>
                {language.t("requirements.integration.apifoxGuide")}
              </button>
              <ButtonV2
                size="small"
                variant="ghost"
                disabled={!integration().apifoxUrl.trim() && !resolvedProjectId()}
                onClick={openApifox}
              >
                {language.t("requirements.integration.openApifox")}
              </ButtonV2>
            </div>
          </div>
          <TextInputV2
            value={integration().apifoxUrl || integration().apifoxProjectId}
            placeholder={language.t("requirements.integration.bindPlaceholder")}
            onInput={(event) => onApifoxBind(event.currentTarget.value)}
          />
          <Show when={resolvedProjectId()}>
            <p data-component="requirements-integ-meta">
              {language.t("requirements.integration.resolvedId", { id: resolvedProjectId() })}
            </p>
          </Show>
          <label data-component="requirements-integ-field">
            <span>{language.t("requirements.integration.folderId")}</span>
            <TextInputV2
              value={integration().apifoxFolderId}
              placeholder={language.t("requirements.integration.folderIdPlaceholder")}
              onInput={(event) => onFolderBind(event.currentTarget.value)}
              showClearButton={!!integration().apifoxFolderId.trim()}
              clearLabel={language.t("common.clear")}
              onClearClick={() => patch({ apifoxFolderId: "" })}
            />
          </label>
          <p data-component="requirements-integ-meta">{language.t("requirements.integration.folderIdHint")}</p>
        </section>

        <section data-component="requirements-integ-section">
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.integration.token")}</h3>
            <div data-component="requirements-integ-actions">
              <button
                type="button"
                data-component="requirements-integ-link"
                onClick={() => platform.openLink(APIFOX_TOKEN_DOCS)}
              >
                {language.t("requirements.integration.tokenDocs")}
              </button>
            </div>
          </div>
          <TextInputV2
            type="password"
            autocomplete="off"
            value={integration().apifoxAccessToken}
            placeholder={language.t("requirements.integration.tokenPlaceholder")}
            onInput={(event) => patch({ apifoxAccessToken: event.currentTarget.value })}
            showClearButton={!!integration().apifoxAccessToken}
            clearLabel={language.t("common.clear")}
            onClearClick={() => patch({ apifoxAccessToken: "" })}
          />
          <p data-component="requirements-integ-meta">{language.t("requirements.integration.tokenHint")}</p>
          <Show when={isApifoxReady(integration())}>
            <p data-component="requirements-integ-meta">{language.t("requirements.integration.readyHint")}</p>
          </Show>
        </section>

        <section data-component="requirements-integ-section">
          <div data-component="requirements-integ-section-head">
            <h3>
              {language.t("requirements.integration.stepApis")}
              <Show when={integration().apis.length > 0}>
                <span data-component="requirements-integ-count">
                  {language.t("requirements.integration.apiCount", { count: integration().apis.length })}
                </span>
              </Show>
            </h3>
            <div data-component="requirements-integ-actions">
              <ButtonV2
                size="small"
                variant="outline"
                disabled={!canImport() || importing()}
                onClick={() => void importFromApifox()}
              >
                {importing()
                  ? language.t("requirements.integration.importing")
                  : language.t("requirements.integration.importFromApifox")}
              </ButtonV2>
              <Show when={integration().apis.length > 0}>
                <button type="button" data-component="requirements-integ-link" onClick={clearAllApis}>
                  {language.t("requirements.integration.clearApis")}
                </button>
              </Show>
              <button
                type="button"
                data-component="requirements-integ-link"
                onClick={() => setBulkOpen((open) => !open)}
              >
                {bulkOpen()
                  ? language.t("requirements.integration.bulkCancel")
                  : language.t("requirements.integration.bulkPaste")}
              </button>
            </div>
          </div>

          <Show when={catalogOpen()}>
            <div data-component="requirements-integ-catalog">
              <div data-component="requirements-integ-catalog-toolbar">
                <TextInputV2
                  value={catalogQuery()}
                  placeholder={language.t("requirements.integration.importSearch")}
                  onInput={(event) => setCatalogQuery(event.currentTarget.value)}
                />
                <button type="button" data-component="requirements-integ-link" onClick={selectAllFiltered}>
                  {language.t("requirements.integration.importSelectAll")}
                </button>
                <button type="button" data-component="requirements-integ-link" onClick={clearPicks}>
                  {language.t("requirements.integration.importClear")}
                </button>
                <ButtonV2 size="small" variant="contrast" onClick={applyPickedApis}>
                  {language.t("requirements.integration.importApply", { count: pickedKeys().size })}
                </ButtonV2>
              </div>
              <ul data-component="requirements-integ-catalog-list">
                <For each={filteredCatalog()}>
                  {(api) => {
                    const key = () => apiKey(api)
                    const checked = () => pickedKeys().has(key())
                    return (
                      <li>
                        <label data-component="requirements-integ-catalog-row">
                          <input type="checkbox" checked={checked()} onChange={() => togglePick(api)} />
                          <span data-slot="method">{api.method}</span>
                          <span data-slot="path">{api.path}</span>
                          <Show when={api.name.trim()}>
                            <span data-slot="name">{api.name}</span>
                          </Show>
                        </label>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </div>
          </Show>

          <Show when={bulkOpen()}>
            <div data-component="requirements-integ-bulk">
              <textarea
                value={bulkText()}
                placeholder={language.t("requirements.integration.bulkPlaceholder")}
                onInput={(event) => setBulkText(event.currentTarget.value)}
              />
              <div data-component="requirements-integ-bulk-actions">
                <ButtonV2 size="small" variant="outline" onClick={importBulk}>
                  {language.t("requirements.integration.bulkImport")}
                </ButtonV2>
              </div>
            </div>
          </Show>

          <Show when={integration().apis.length > 0}>
            <div data-component="requirements-integ-api-toolbar">
              <button type="button" data-component="requirements-integ-link" onClick={selectAllApis}>
                {language.t("requirements.integration.selectAllApis")}
              </button>
              <button type="button" data-component="requirements-integ-link" onClick={clearSelectedApis}>
                {language.t("requirements.integration.clearApiSelection")}
              </button>
              <ButtonV2
                size="small"
                variant="outline"
                disabled={selectedApiIds().size === 0}
                onClick={removeSelectedApis}
              >
                {language.t("requirements.integration.deleteSelectedApis", {
                  count: selectedApiIds().size,
                })}
              </ButtonV2>
            </div>
            <ul data-component="requirements-integ-api-list">
              <For each={integration().apis}>
                {(api) => {
                  const checked = () => selectedApiIds().has(api.id)
                  return (
                    <li>
                      <label data-component="requirements-integ-api-row">
                        <input
                          type="checkbox"
                          checked={checked()}
                          onChange={() => toggleSelectApi(api.id)}
                        />
                        <span data-slot="method">{api.method || "API"}</span>
                        <div data-slot="copy">
                          <span data-slot="name">{api.name.trim() || api.path}</span>
                          <Show when={api.name.trim() && api.path.trim()}>
                            <span data-slot="path">{api.path}</span>
                          </Show>
                        </div>
                      </label>
                      <button type="button" data-slot="remove" onClick={() => removeApi(api.id)}>
                        {language.t("common.delete")}
                      </button>
                    </li>
                  )
                }}
              </For>
            </ul>
          </Show>

          <div data-component="requirements-integ-api-form">
            <select value={draftMethod()} onChange={(event) => setDraftMethod(event.currentTarget.value)}>
              <For each={[...METHODS]}>{(method) => <option value={method}>{method}</option>}</For>
            </select>
            <TextInputV2
              class="min-w-0 flex-1"
              value={draftPath()}
              placeholder={language.t("requirements.integration.apiPathPlaceholder")}
              onInput={(event) => setDraftPath(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addApi()
                }
              }}
            />
            <TextInputV2
              class="min-w-0 flex-1"
              value={draftName()}
              placeholder={language.t("requirements.integration.apiNamePlaceholder")}
              onInput={(event) => setDraftName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addApi()
                }
              }}
            />
            <ButtonV2 type="button" size="small" variant="outline" icon="plus" onClick={() => addApi()}>
              {language.t("requirements.integration.addApi")}
            </ButtonV2>
          </div>
        </section>

        <section data-component="requirements-integ-section">
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.integration.stepEnv")}</h3>
          </div>
          <div data-component="requirements-integ-env-grid">
            <label>
              <span>{language.t("requirements.integration.env")}</span>
              <TextInputV2
                value={integration().envName}
                placeholder={language.t("requirements.integration.envPlaceholder")}
                onInput={(event) => patch({ envName: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>{language.t("requirements.integration.baseUrl")}</span>
              <TextInputV2
                value={integration().baseUrl}
                placeholder={language.t("requirements.integration.baseUrlPlaceholder")}
                onInput={(event) => patch({ baseUrl: event.currentTarget.value })}
              />
            </label>
          </div>
        </section>

        <section data-component="requirements-integ-section" data-compact>
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.integration.stepMcp")}</h3>
            <div data-component="requirements-integ-actions">
              <button
                type="button"
                data-component="requirements-integ-link"
                onClick={() => setMcpPreviewOpen((open) => !open)}
              >
                {mcpPreviewOpen()
                  ? language.t("requirements.integration.mcpHide")
                  : language.t("requirements.integration.mcpShow")}
              </button>
              <ButtonV2 size="small" variant="outline" disabled={!resolvedProjectId()} onClick={() => void copyMcp()}>
                {language.t("requirements.integration.copyMcp")}
              </ButtonV2>
              <ButtonV2
                size="small"
                variant="contrast"
                disabled={!linkedDirectory() || !resolvedProjectId() || !accessToken() || writingMcp()}
                onClick={() => void writeMcpToProject()}
              >
                {writingMcp()
                  ? language.t("requirements.integration.mcpWriting")
                  : language.t("requirements.integration.writeMcp")}
              </ButtonV2>
            </div>
          </div>
          <Show when={!linkedDirectory()}>
            <p data-component="requirements-integ-meta">{language.t("requirements.integration.mcpNeedProjectHint")}</p>
          </Show>
          <Show when={mcpPreviewOpen()}>
            <pre data-component="requirements-integ-mcp-preview">{mcpPreview()}</pre>
          </Show>
        </section>

        <section data-component="requirements-integ-section" data-compact>
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.integration.notes")}</h3>
          </div>
          <textarea
            data-component="requirements-integ-notes"
            value={integration().notes}
            placeholder={language.t("requirements.integration.notesPlaceholder")}
            onInput={(event) => patch({ notes: event.currentTarget.value })}
          />
        </section>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="contrast" onClick={() => dialog.close()}>
          {language.t("requirements.integration.done")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}
