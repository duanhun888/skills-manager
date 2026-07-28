import { Show, createMemo, createSignal } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogBody, DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { showToast } from "@/utils/toast"
import { useRequirements } from "./context"
import { TAPD_OPEN_DOCS, buildTapdMcpConfig, extractTapdWorkspaceId } from "./tapd"
import { canImportTapdImages, extractTapdStoryId, importTapdStoryImages } from "./tapd-import"
import { TapdFieldHelpButton } from "./tapd-field-help"
import type { RequirementIntegration } from "./types"
import { EMPTY_INTEGRATION } from "./types"

export function DialogTapdConfig(props: {
  projectId: string
  onImported?: (assetIds: string[]) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const requirements = useRequirements()
  const platform = usePlatform()
  const [mcpOpen, setMcpOpen] = createSignal(false)
  const [importing, setImporting] = createSignal(false)

  const project = createMemo(() => requirements.projects().find((item) => item.id === props.projectId))
  const integration = createMemo(() => project()?.integration ?? EMPTY_INTEGRATION)

  const patch = (next: Partial<RequirementIntegration>) => {
    requirements.setIntegration(props.projectId, next)
  }

  const resolvedWorkspaceId = createMemo(
    () =>
      integration().tapdWorkspaceId.trim() ||
      extractTapdWorkspaceId(integration().tapdUrl) ||
      extractTapdWorkspaceId(integration().tapdStoryUrl) ||
      "",
  )

  const resolvedStoryId = createMemo(() => extractTapdStoryId(integration().tapdStoryUrl) || "")

  const canImport = createMemo(() =>
    canImportTapdImages({
      tapdWorkspaceId: resolvedWorkspaceId(),
      tapdStoryUrl: integration().tapdStoryUrl,
      tapdAccessToken: integration().tapdAccessToken,
    }),
  )

  const accessToken = createMemo(() => integration().tapdAccessToken.trim())

  const mcpPreview = createMemo(() =>
    buildTapdMcpConfig({
      workspaceId: resolvedWorkspaceId() || "<workspace-id>",
      // Mask in preview; copy uses the real token below
      accessToken: accessToken() ? "••••••••" : undefined,
    }),
  )

  const onBind = (value: string) => {
    const trimmed = value.trim()
    const extracted = extractTapdWorkspaceId(trimmed)
    const looksLikeUrl = /tapd\.cn|https?:\/\//i.test(trimmed)
    if (!trimmed) {
      patch({ tapdUrl: "", tapdWorkspaceId: "" })
      return
    }
    if (looksLikeUrl) {
      patch({ tapdUrl: trimmed, tapdWorkspaceId: extracted ?? "" })
      return
    }
    patch({ tapdUrl: "", tapdWorkspaceId: extracted ?? trimmed })
  }

  const copyMcp = async () => {
    if (!resolvedWorkspaceId()) {
      showToast({ title: language.t("requirements.tapd.mcpNeedId") })
      return
    }
    try {
      const text = buildTapdMcpConfig({
        workspaceId: resolvedWorkspaceId(),
        accessToken: accessToken() || undefined,
      })
      await navigator.clipboard.writeText(text)
      showToast({
        title: language.t("requirements.tapd.mcpCopied"),
        description: accessToken()
          ? language.t("requirements.tapd.mcpCopiedWithToken")
          : language.t("requirements.tapd.mcpCopiedHint"),
      })
    } catch {
      showToast({ title: language.t("requirements.tapd.mcpCopyFailed") })
    }
  }

  const openTapd = () => {
    const story = integration().tapdStoryUrl.trim()
    if (story) {
      platform.openLink(story)
      return
    }
    const url = integration().tapdUrl.trim()
    if (url) {
      platform.openLink(url)
      return
    }
    const id = resolvedWorkspaceId()
    if (id) platform.openLink(`https://www.tapd.cn/${id}`)
  }

  const importImages = async () => {
    if (!canImport()) {
      showToast({ title: language.t("requirements.tapd.importNeed") })
      return
    }
    if (importing()) return
    setImporting(true)
    try {
      const existing = new Set(
        (project()?.assets ?? []).map((asset) => `${asset.note}::${asset.filename}`),
      )
      const { images, errors } = await importTapdStoryImages({
        workspaceId: resolvedWorkspaceId(),
        storyId: resolvedStoryId(),
        accessToken: accessToken(),
        fetch: platform.fetch ?? fetch,
      })
      const addedIds: string[] = []
      for (const image of images) {
        const key = `${image.note}::${image.filename}`
        if (existing.has(key)) continue
        existing.add(key)
        const asset = requirements.addAsset(props.projectId, {
          filename: image.filename,
          mime: image.mime,
          dataUrl: image.dataUrl,
          note: image.note,
        })
        if (asset) addedIds.push(asset.id)
      }
      props.onImported?.(addedIds)
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
      setImporting(false)
    }
  }

  return (
    <DialogV2 size="large" containerClass="requirements-integration-dialog-container">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("requirements.tapd.title")}
          description={language.t("requirements.tapd.dialogHint")}
        />
      </DialogHeader>
      <DialogBody class="requirements-integration-dialog-body">
        <section data-component="requirements-integ-section">
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.tapd.workspace")}</h3>
            <div data-component="requirements-integ-actions">
              <TapdFieldHelpButton field="workspace" />
              <button type="button" data-component="requirements-integ-link" onClick={() => platform.openLink(TAPD_OPEN_DOCS)}>
                {language.t("requirements.tapd.docs")}
              </button>
              <ButtonV2
                size="small"
                variant="ghost"
                disabled={!integration().tapdUrl.trim() && !resolvedWorkspaceId() && !integration().tapdStoryUrl.trim()}
                onClick={openTapd}
              >
                {language.t("requirements.tapd.open")}
              </ButtonV2>
            </div>
          </div>
          <div data-component="requirements-integ-field-row">
            <TextInputV2
              value={integration().tapdUrl || integration().tapdWorkspaceId}
              placeholder={language.t("requirements.tapd.bindPlaceholder")}
              onInput={(event) => onBind(event.currentTarget.value)}
            />
          </div>
          <Show when={resolvedWorkspaceId()}>
            <p data-component="requirements-integ-meta">
              {language.t("requirements.tapd.resolvedId", { id: resolvedWorkspaceId() })}
            </p>
          </Show>
        </section>

        <section data-component="requirements-integ-section">
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.tapd.story")}</h3>
            <div data-component="requirements-integ-actions">
              <TapdFieldHelpButton field="story" />
            </div>
          </div>
          <div data-component="requirements-integ-field-row">
            <TextInputV2
              value={integration().tapdStoryUrl}
              placeholder={language.t("requirements.tapd.storyPlaceholder")}
              onInput={(event) => {
                const value = event.currentTarget.value
                const extracted = extractTapdWorkspaceId(value)
                patch({
                  tapdStoryUrl: value,
                  ...(extracted && !integration().tapdWorkspaceId.trim() ? { tapdWorkspaceId: extracted } : {}),
                })
              }}
            />
          </div>
        </section>

        <section data-component="requirements-integ-section">
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.tapd.token")}</h3>
            <div data-component="requirements-integ-actions">
              <TapdFieldHelpButton field="token" />
              <button type="button" data-component="requirements-integ-link" onClick={() => platform.openLink(TAPD_OPEN_DOCS)}>
                {language.t("requirements.tapd.tokenDocs")}
              </button>
            </div>
          </div>
          <div data-component="requirements-integ-field-row">
            <TextInputV2
              type="password"
              autocomplete="off"
              value={integration().tapdAccessToken}
              placeholder={language.t("requirements.tapd.tokenPlaceholder")}
              onInput={(event) => patch({ tapdAccessToken: event.currentTarget.value })}
              showClearButton={!!integration().tapdAccessToken}
              clearLabel={language.t("common.clear")}
              onClearClick={() => patch({ tapdAccessToken: "" })}
            />
          </div>
          <p data-component="requirements-integ-meta">{language.t("requirements.tapd.tokenHint")}</p>
        </section>

        <section data-component="requirements-integ-section" data-compact>
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.tapd.mcp")}</h3>
            <div data-component="requirements-integ-actions">
              <button type="button" data-component="requirements-integ-link" onClick={() => setMcpOpen((open) => !open)}>
                {mcpOpen() ? language.t("requirements.integration.mcpHide") : language.t("requirements.integration.mcpShow")}
              </button>
              <ButtonV2 size="small" variant="outline" disabled={!resolvedWorkspaceId()} onClick={() => void copyMcp()}>
                {language.t("requirements.tapd.copyMcp")}
              </ButtonV2>
            </div>
          </div>
          <Show when={mcpOpen()}>
            <pre data-component="requirements-integ-mcp-preview">{mcpPreview()}</pre>
          </Show>
        </section>

        <section data-component="requirements-integ-section" data-compact>
          <div data-component="requirements-integ-section-head">
            <h3>{language.t("requirements.tapd.importSection")}</h3>
            <ButtonV2
              size="small"
              variant="outline"
              disabled={!canImport() || importing()}
              onClick={() => void importImages()}
            >
              {importing() ? language.t("requirements.tapd.importing") : language.t("requirements.tapd.importAction")}
            </ButtonV2>
          </div>
          <p data-component="requirements-integ-meta">{language.t("requirements.tapd.importNeed")}</p>
          <p data-component="requirements-integ-meta">{language.t("requirements.tapd.importHint")}</p>
        </section>

        <div data-component="requirements-tapd-permissions">
          <p data-component="requirements-integ-meta">{language.t("requirements.tapd.permissionsIntro")}</p>
          <ul>
            <li>{language.t("requirements.tapd.perm.story")}</li>
            <li>{language.t("requirements.tapd.perm.task")}</li>
            <li>{language.t("requirements.tapd.perm.bug")}</li>
            <li>{language.t("requirements.tapd.perm.iteration")}</li>
          </ul>
        </div>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="contrast" onClick={() => dialog.close()}>
          {language.t("requirements.integration.done")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}
