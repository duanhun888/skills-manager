import { Match, Show, Switch, createMemo } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import type { SnapshotFileDiff, VcsFileDiff } from "@opencode-ai/sdk/v2"

import FileTree from "@/components/file-tree"
import { normalizeFileTreeV2Path } from "@/components/file-tree-v2-model"
import { insertFileMention } from "@/components/prompt-input/insert-file-mention"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePrompt } from "@/context/prompt"
import { useSettings } from "@/context/settings"
import {
  createOpenSessionFileTab,
  shouldShowFileTree,
  type Sizing,
} from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"

type RenderDiff = (SnapshotFileDiff & { file: string }) | VcsFileDiff

function renderDiff(value: SnapshotFileDiff | VcsFileDiff): value is RenderDiff {
  return typeof value.file === "string"
}

export function SessionFileTreePanel(props: {
  diffs: () => (SnapshotFileDiff | VcsFileDiff)[]
  diffsReady: () => boolean
  hasReview: () => boolean
  reviewCount: () => number
  reviewOpen: () => boolean
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  size: Sizing
  class?: string
}) {
  const layout = useLayout()
  const settings = useSettings()
  const file = useFile()
  const language = useLanguage()
  const prompt = usePrompt()
  const { tabs, view, params } = useSessionLayout()
  const isDesktop = createMediaQuery("(min-width: 768px)")

  const addToChat = (node: { path: string }) => {
    const next = insertFileMention(prompt.current(), node.path, prompt.cursor())
    prompt.set(next.prompt, next.cursor)
  }

  const open = createMemo(
    () =>
      isDesktop() &&
      shouldShowFileTree({
        visible: settings.visibility.fileTree(),
        opened: layout.fileTree.opened(),
      }),
  )
  const position = createMemo(() => layout.fileTree.position())
  const treeWidth = createMemo(() => (open() ? `${layout.fileTree.width()}px` : "0px"))

  const diffs = createMemo(() => props.diffs().filter(renderDiff))
  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const path = normalizeFileTreeV2Path(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(path, kind)

      const parts = path.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const empty = (msg: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
      </div>
    </div>
  )

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const openReviewPanel = () => {
    if (!settings.general.showReviewPanel()) settings.general.setShowReviewPanel(true)
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const openTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive,
  })

  const fileTreeTab = () => layout.fileTree.tab()

  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  return (
    <Show when={isDesktop() && !(settings.general.newLayoutDesigns() && !params.id)}>
      <Show when={open()}>
        <div
          id="file-tree-panel"
          class={`relative min-w-0 h-full shrink-0 overflow-hidden ${props.class ?? ""}`}
          classList={{
            "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
            "bg-background-base": !settings.general.newLayoutDesigns(),
            "rounded-[10px] shadow-[var(--v2-elevation-raised)]": settings.general.newLayoutDesigns(),
            "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
              !props.size.active(),
          }}
          style={{ width: treeWidth() }}
        >
          <div
            class="h-full flex flex-col overflow-hidden group/filetree"
            classList={{
              "border-r border-border-weaker-base":
                position() === "left" && !settings.general.newLayoutDesigns(),
              "border-l border-border-weaker-base":
                position() === "right" &&
                (!settings.general.newLayoutDesigns() || props.reviewOpen()),
            }}
          >
            <Tabs
              variant="pill"
              value={fileTreeTab()}
              onChange={setFileTreeTabValue}
              class="h-full"
              data-scope="filetree"
            >
              <Tabs.List>
                <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
                  <Show
                    when={settings.general.newLayoutDesigns()}
                    fallback={
                      <>
                        {props.reviewCount()}{" "}
                        {language.t(
                          props.reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other",
                        )}
                      </>
                    }
                  >
                    {language.t("session.review.filesChanged", { count: props.reviewCount() })}
                  </Show>
                </Tabs.Trigger>
                <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                  {language.t("session.files.all")}
                </Tabs.Trigger>
              </Tabs.List>
              <Show when={fileTreeTab() === "changes"}>
                <Tabs.Content value="changes" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={props.hasReview() || !props.diffsReady()}>
                      <Show
                        when={props.diffsReady()}
                        fallback={
                          <div class="px-2 py-2 text-12-regular text-text-weak">
                            {language.t("common.loading")}
                            {language.t("common.loading.ellipsis")}
                          </div>
                        }
                      >
                        <FileTree
                          path=""
                          class="pt-3"
                          allowed={diffFiles()}
                          kinds={kinds()}
                          draggable={false}
                          active={props.activeDiff}
                          onFileClick={(node) => props.focusReviewDiff(node.path)}
                          onAddToChat={addToChat}
                        />
                      </Show>
                    </Match>
                  </Switch>
                </Tabs.Content>
              </Show>
              <Show when={fileTreeTab() === "all"}>
                <Tabs.Content value="all" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={nofiles()}>{empty(language.t("session.files.empty"))}</Match>
                    <Match when={true}>
                      <FileTree
                        path=""
                        class="pt-3"
                        modified={diffFiles()}
                        kinds={kinds()}
                        onFileClick={(node) => openTab(file.tab(node.path))}
                        onAddToChat={addToChat}
                      />
                    </Match>
                  </Switch>
                </Tabs.Content>
              </Show>
            </Tabs>
          </div>
          <div onPointerDown={() => props.size.start()}>
            <ResizeHandle
              direction="horizontal"
              edge={position() === "left" ? "end" : "start"}
              size={layout.fileTree.width()}
              min={200}
              max={480}
              onResize={(width) => {
                props.size.touch()
                layout.fileTree.resize(width)
              }}
            />
          </div>
        </div>
      </Show>
    </Show>
  )
}
