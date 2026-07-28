import { createSignal, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogBody, DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { useLanguage } from "@/context/language"

export type TapdGuideField = "workspace" | "story" | "token"

const GUIDE_SRC: Record<TapdGuideField, string> = {
  workspace: "/requirements/tapd-guide/workspace.png",
  story: "/requirements/tapd-guide/story.png",
  token: "/requirements/tapd-guide/token.png",
}

function TapdGuideDialog(props: { field: TapdGuideField }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [missing, setMissing] = createSignal(false)
  const titleKey =
    props.field === "workspace"
      ? "requirements.tapd.guide.workspaceTitle"
      : props.field === "story"
        ? "requirements.tapd.guide.storyTitle"
        : "requirements.tapd.guide.tokenTitle"
  const hintKey =
    props.field === "workspace"
      ? "requirements.tapd.guide.workspaceHint"
      : props.field === "story"
        ? "requirements.tapd.guide.storyHint"
        : "requirements.tapd.guide.tokenHint"

  return (
    <DialogV2 size="large" containerClass="requirements-tapd-guide-dialog">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup title={language.t(titleKey)} description={language.t(hintKey)} />
      </DialogHeader>
      <DialogBody>
        <div data-component="requirements-tapd-guide">
          <Show
            when={!missing()}
            fallback={
              <div data-slot="placeholder">
                <p>{language.t("requirements.tapd.guide.pending")}</p>
                <p data-slot="path">{GUIDE_SRC[props.field]}</p>
              </div>
            }
          >
            <img
              data-slot="shot"
              src={GUIDE_SRC[props.field]}
              alt={language.t(titleKey)}
              onError={() => setMissing(true)}
            />
          </Show>
        </div>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="contrast" onClick={() => dialog.close()}>
          {language.t("common.close")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}

/** Opens a screenshot guide for where to find workspace / story / token in TAPD. */
export function TapdFieldHelpButton(props: { field: TapdGuideField }) {
  const language = useLanguage()
  const dialog = useDialog()
  return (
    <button
      type="button"
      data-component="requirements-integ-link"
      data-slot="tapd-guide"
      onClick={() => void dialog.show(() => <TapdGuideDialog field={props.field} />)}
    >
      {language.t("requirements.tapd.guide.open")}
    </button>
  )
}
