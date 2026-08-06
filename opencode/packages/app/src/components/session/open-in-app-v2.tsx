import { For, Show, createMemo } from "solid-js"
import { AppIcon } from "@opencode-ai/ui/app-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { SplitButtonV2, SplitButtonV2Action, SplitButtonV2MenuTrigger } from "@opencode-ai/ui/v2/split-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useLanguage } from "@/context/language"
import { type OpenApp, useOpenInApp } from "@/components/session/open-in-app"

export function OpenInAppV2(props: {
  directory: () => string
  /** Absolute path of the active preview file, when any. */
  file?: () => string | undefined
  /** 1-based line to jump to (vscode/cursor/zed). */
  line?: () => number | undefined
}) {
  const language = useLanguage()
  const state = useOpenInApp({ directory: props.directory })
  const activeFile = createMemo(() => props.file?.()?.trim() || undefined)
  const activeLine = createMemo(() => {
    const line = props.line?.()
    return line !== undefined && line > 0 ? Math.floor(line) : undefined
  })
  const openTarget = (app: OpenApp | "finder") => {
    const path = activeFile()
    if (path) {
      state.openFile(path, { app, line: activeLine() })
      return
    }
    state.openDir(app)
  }
  const ariaLabel = createMemo(() => {
    const app = state.current().label
    if (activeFile()) return language.t("session.header.open.file.ariaLabel", { app })
    return language.t("session.header.open.ariaLabel", { app })
  })

  return (
    <Show when={props.directory() && state.canOpen()}>
      <SplitButtonV2 class="session-review-v2-open-in-app" onPointerDown={(event) => event.stopPropagation()}>
        <TooltipV2 placement="bottom" value={ariaLabel()} class="flex items-center">
          <SplitButtonV2Action
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              if (state.opening()) return
              openTarget(state.current().id)
            }}
            disabled={state.opening()}
            aria-label={ariaLabel()}
          >
            <Show when={state.opening()} fallback={<AppIcon id={state.current().icon} class="size-[18px]" />}>
              <Spinner class="size-3.5" />
            </Show>
          </SplitButtonV2Action>
        </TooltipV2>
        <MenuV2
          gutter={4}
          modal={false}
          placement="bottom-end"
          open={state.menu.open}
          onOpenChange={(open) => state.setMenu("open", open)}
        >
          <MenuV2.Trigger
            as={SplitButtonV2MenuTrigger}
            disabled={state.opening()}
            aria-label={language.t("session.header.open.menu")}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconV2 name="chevron-down" size="small" />
          </MenuV2.Trigger>
          <MenuV2.Portal>
            <MenuV2.Content class="open-in-app-v2-menu">
              <MenuV2.Group>
                <MenuV2.GroupLabel>{language.t("session.header.openIn")}</MenuV2.GroupLabel>
                <MenuV2.RadioGroup
                  value={state.current().id}
                  onChange={(value) => {
                    state.selectApp(value as OpenApp)
                  }}
                >
                  <For each={state.options()}>
                    {(option) => (
                      <MenuV2.RadioItem
                        value={option.id}
                        disabled={state.opening()}
                        onSelect={() => {
                          state.selectApp(option.id)
                          state.setMenu("open", false)
                          openTarget(option.id)
                        }}
                      >
                        <AppIcon id={option.icon} />
                        {option.label}
                      </MenuV2.RadioItem>
                    )}
                  </For>
                </MenuV2.RadioGroup>
              </MenuV2.Group>
              <Show when={activeFile()}>
                <MenuV2.Separator />
                <MenuV2.Item
                  onSelect={() => {
                    state.setMenu("open", false)
                    state.openDir(state.current().id)
                  }}
                >
                  <Icon name="folder" size="small" class="text-icon-weak" />
                  {language.t("session.header.open.projectFolder")}
                </MenuV2.Item>
              </Show>
              <MenuV2.Separator />
              <MenuV2.Item
                onSelect={() => {
                  state.setMenu("open", false)
                  state.copyPath(activeFile() ?? props.directory())
                }}
              >
                <Icon name="copy" size="small" class="text-icon-weak" />
                {language.t("session.header.open.copyPath")}
              </MenuV2.Item>
            </MenuV2.Content>
          </MenuV2.Portal>
        </MenuV2>
      </SplitButtonV2>
    </Show>
  )
}
