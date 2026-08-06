import { useTheme } from "@opencode-ai/ui/theme/context"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { createEffect, onCleanup, onMount, Show } from "solid-js"
import type * as Monaco from "monaco-editor"
import { languageFromPath } from "./language"
import { loadMonaco } from "./load"
import type { SessionReviewDiffStyle } from "../components/session-review"
import "./diff-preview.css"

export type MonacoDiffPreviewProps = {
  path: string
  original: string
  modified: string
  diffStyle: SessionReviewDiffStyle
  class?: string
}

export function MonacoDiffPreview(props: MonacoDiffPreviewProps) {
  const theme = useTheme()
  const i18n = useI18n()
  let host!: HTMLDivElement
  let editor: Monaco.editor.IStandaloneDiffEditor | undefined
  let originalModel: Monaco.editor.ITextModel | undefined
  let modifiedModel: Monaco.editor.ITextModel | undefined
  let monacoApi: typeof Monaco | undefined
  let ready = false
  let disposed = false

  const applyTheme = () => {
    if (!monacoApi || !ready) return
    monacoApi.editor.setTheme(theme.mode() === "dark" ? "vs-dark" : "vs")
  }

  const applyOptions = () => {
    editor?.updateOptions({
      renderSideBySide: props.diffStyle === "split",
      hideUnchangedRegions: { enabled: false },
    })
  }

  const applyModels = () => {
    if (!monacoApi || !editor || !ready) return
    const language = languageFromPath(props.path)
    const original = props.original
    const modified = props.modified

    if (!originalModel || !modifiedModel) {
      originalModel = monacoApi.editor.createModel(original, language)
      modifiedModel = monacoApi.editor.createModel(modified, language)
      editor.setModel({ original: originalModel, modified: modifiedModel })
      return
    }

    if (originalModel.getLanguageId() !== language) {
      monacoApi.editor.setModelLanguage(originalModel, language)
      monacoApi.editor.setModelLanguage(modifiedModel, language)
    }
    if (originalModel.getValue() !== original) originalModel.setValue(original)
    if (modifiedModel.getValue() !== modified) modifiedModel.setValue(modified)
  }

  onMount(() => {
    void loadMonaco().then((monaco) => {
      if (disposed || !host) return
      monacoApi = monaco
      editor = monaco.editor.createDiffEditor(host, {
        automaticLayout: true,
        readOnly: true,
        originalEditable: false,
        renderSideBySide: props.diffStyle === "split",
        enableSplitViewResizing: true,
        hideUnchangedRegions: { enabled: false },
        diffAlgorithm: "advanced",
        fontSize: 12,
        lineHeight: 18,
        fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderOverviewRuler: true,
        overviewRulerBorder: false,
        overviewRulerLanes: 2,
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
          useShadows: false,
        },
        padding: { top: 8, bottom: 8 },
        ignoreTrimWhitespace: false,
        renderIndicators: true,
        diffWordWrap: "off",
        wordWrap: "off",
        theme: theme.mode() === "dark" ? "vs-dark" : "vs",
      })
      ready = true
      applyModels()
      applyTheme()
    })
  })

  createEffect(() => {
    props.path
    props.original
    props.modified
    applyModels()
  })

  createEffect(() => {
    props.diffStyle
    applyOptions()
  })

  createEffect(() => {
    theme.mode()
    applyTheme()
  })

  onCleanup(() => {
    disposed = true
    ready = false
    editor?.dispose()
    editor = undefined
    originalModel?.dispose()
    modifiedModel?.dispose()
    originalModel = undefined
    modifiedModel = undefined
    monacoApi = undefined
  })

  return (
    <div data-component="monaco-diff-preview-root" class={props.class} data-style={props.diffStyle}>
      <Show
        when={props.diffStyle === "split"}
        fallback={
          <div data-slot="monaco-diff-pane-labels" data-style="unified">
            <span data-side="unified">{i18n.t("ui.sessionReview.diff.pane.unified")}</span>
          </div>
        }
      >
        <div data-slot="monaco-diff-pane-labels" data-style="split">
          <span data-side="before">{i18n.t("ui.sessionReview.diff.pane.before")}</span>
          <span data-side="after">{i18n.t("ui.sessionReview.diff.pane.after")}</span>
        </div>
      </Show>
      <div
        ref={host}
        data-component="monaco-diff-preview"
        role="region"
        aria-label="Diff preview"
      />
    </div>
  )
}
