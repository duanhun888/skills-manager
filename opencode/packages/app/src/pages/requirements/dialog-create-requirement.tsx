import { Show, createMemo, createSignal } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogBody, DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { useLayout, type LocalProject } from "@/context/layout"
import { useServer } from "@/context/server"
import { displayName } from "@/pages/layout/helpers"
import { inheritSystemIntegration } from "./apifox"
import { useRequirements } from "./context"

type SystemOption = {
  directory: string
  name: string
}

export function DialogCreateRequirement(props: { onCreated?: (id: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const requirements = useRequirements()
  const layout = useLayout()
  const server = useServer()

  const systems = createMemo<SystemOption[]>(() => {
    const seen = new Set<string>()
    const list: SystemOption[] = []
    for (const project of layout.projects.list() as LocalProject[]) {
      if (seen.has(project.worktree)) continue
      seen.add(project.worktree)
      list.push({ directory: project.worktree, name: displayName(project) })
    }
    const last = server.projects.last()
    if (last && !seen.has(last)) {
      list.unshift({ directory: last, name: last.split(/[/\\]/).filter(Boolean).at(-1) ?? last })
    }
    return list
  })

  const defaultSystem = () => systems()[0]
  const [title, setTitle] = createSignal(language.t("requirements.defaultTitle"))
  const [system, setSystem] = createSignal<SystemOption | undefined>(defaultSystem())
  const [error, setError] = createSignal<string>()

  const willInherit = createMemo(() => {
    const directory = system()?.directory
    return !!inheritSystemIntegration(requirements.projects(), directory)
  })

  const submit = () => {
    const name = title().trim() || language.t("requirements.defaultTitle")
    const selected = system()
    if (systems().length > 0 && !selected) {
      setError(language.t("requirements.create.systemRequired"))
      return
    }
    const project = requirements.create({
      title: name,
      systemDirectory: selected?.directory,
      systemName: selected?.name,
    })
    props.onCreated?.(project.id)
    dialog.close()
  }

  return (
    <DialogV2 size="normal">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("requirements.action.new")}
          description={language.t("requirements.create.description")}
        />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-4 px-5 py-4">
        <label class="flex flex-col gap-1.5">
          <span class="text-12-medium text-v2-text-text-base">{language.t("requirements.field.title")}</span>
          <TextInputV2
            value={title()}
            autofocus
            onInput={(event) => setTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submit()
              }
            }}
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-12-medium text-v2-text-text-base">{language.t("requirements.field.system")}</span>
          <Show
            when={systems().length > 0}
            fallback={
              <div class="rounded-[8px] border border-dashed border-v2-border-border-muted px-3 py-3 text-12-regular text-v2-text-text-weak">
                {language.t("requirements.create.noSystem")}
              </div>
            }
          >
            <SelectV2
              options={systems()}
              current={system()}
              value={(item) => item.directory}
              label={(item) => item.name}
              placeholder={language.t("requirements.field.systemPlaceholder")}
              onSelect={(item) => {
                setSystem(item ?? undefined)
                setError()
              }}
            />
            <Show when={system()?.directory}>
              <span class="text-12-regular text-v2-text-text-weak truncate">{system()!.directory}</span>
            </Show>
            <Show when={willInherit()}>
              <p class="text-12-regular text-v2-text-text-muted">{language.t("requirements.create.inheritIntegration")}</p>
            </Show>
          </Show>
        </label>
        <Show when={error()}>{(message) => <p class="text-12-regular text-text-danger-base">{message()}</p>}</Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 variant="contrast" onClick={submit}>
          {language.t("requirements.action.createConfirm")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}
