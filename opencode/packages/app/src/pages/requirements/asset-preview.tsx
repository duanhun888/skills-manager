import { For, Match, Show, Switch, createMemo, createResource } from "solid-js"
import { useLanguage } from "@/context/language"
import { loadAssetPreviewContent } from "./asset-text"
import { assetExtBadge, normalizeAssetDataUrl } from "./tapd-import"
import type { RequirementAsset } from "./types"

export function AssetPreviewPane(props: { assetId: string; asset: RequirementAsset }) {
  const language = useLanguage()
  const asset = createMemo(() => props.asset)
  const display = createMemo(() => normalizeAssetDataUrl(asset()))

  // Key only on assetId so switching materials always remounts/refetches (avoid stale table).
  const [content] = createResource(
    () => props.assetId,
    async () => {
      const current = asset()
      const normalized = normalizeAssetDataUrl(current)
      if (normalized.kind === "image") return { kind: "image" as const, dataUrl: normalized.dataUrl }
      return loadAssetPreviewContent(current)
    },
  )

  const ready = createMemo(() => !content.loading && content())

  return (
    <Show
      when={ready()}
      fallback={
        <div data-component="requirements-file-preview" data-state="loading">
          <span data-slot="badge">{assetExtBadge(asset().filename)}</span>
          <span data-slot="name">{asset().filename}</span>
          <span data-slot="hint">{language.t("requirements.assets.previewLoading")}</span>
        </div>
      }
    >
      {(value) => (
        <Switch>
          <Match when={value().kind === "image" ? value() : undefined}>
            {(item) => (
              <img
                src={(item() as { dataUrl: string }).dataUrl}
                alt={asset().filename}
                class="max-h-full max-w-full object-contain p-3 drop-shadow-sm"
              />
            )}
          </Match>
          <Match when={value().kind === "pdf" ? value() : undefined}>
            {(item) => {
              const pdf = item() as { dataUrl: string }
              return (
                <div data-component="requirements-file-preview" data-kind="pdf">
                  <div data-slot="toolbar">
                    <span data-slot="badge">PDF</span>
                    <span data-slot="name">{asset().filename}</span>
                    <a
                      data-slot="open"
                      href={pdf.dataUrl}
                      download={asset().filename}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {language.t("requirements.assets.openFile")}
                    </a>
                  </div>
                  <iframe data-slot="pdf" src={pdf.dataUrl} title={asset().filename} />
                </div>
              )
            }}
          </Match>
          <Match when={value().kind === "table" ? value() : undefined}>
            {(item) => {
              const table = item() as { rows: string[][]; filename: string }
              return (
                <div data-component="requirements-file-preview" data-kind="table">
                  <div data-slot="toolbar">
                    <span data-slot="badge">{assetExtBadge(asset().filename)}</span>
                    <span data-slot="name">{asset().filename}</span>
                    <a
                      data-slot="open"
                      href={display().dataUrl}
                      download={asset().filename}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {language.t("requirements.assets.openFile")}
                    </a>
                  </div>
                  <div data-slot="table-wrap">
                    <table data-slot="table">
                      <tbody>
                        <For each={table.rows}>
                          {(row, index) => (
                            <tr data-header={index() === 0 ? "true" : undefined}>
                              <For each={row}>{(cell) => <td title={cell}>{cell || "\u00a0"}</td>}</For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }}
          </Match>
          <Match when={value().kind === "text" ? value() : undefined}>
            {(item) => {
              const doc = item() as { text: string; filename: string }
              return (
                <div data-component="requirements-file-preview" data-kind="text">
                  <div data-slot="toolbar">
                    <span data-slot="badge">{assetExtBadge(asset().filename)}</span>
                    <span data-slot="name">{asset().filename}</span>
                    <a
                      data-slot="open"
                      href={display().dataUrl}
                      download={asset().filename}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {language.t("requirements.assets.openFile")}
                    </a>
                  </div>
                  <pre data-slot="text">{doc.text}</pre>
                </div>
              )
            }}
          </Match>
          <Match when={value().kind === "empty" ? value() : undefined}>
            {() => (
              <div data-component="requirements-file-preview" data-kind="empty">
                <span data-slot="badge">{assetExtBadge(asset().filename)}</span>
                <span data-slot="name">{asset().filename}</span>
                <span data-slot="hint">{language.t("requirements.assets.previewUnavailable")}</span>
                <a
                  data-slot="open"
                  href={display().dataUrl}
                  download={asset().filename}
                  onClick={(event) => event.stopPropagation()}
                >
                  {language.t("requirements.assets.openFile")}
                </a>
              </div>
            )}
          </Match>
        </Switch>
      )}
    </Show>
  )
}
