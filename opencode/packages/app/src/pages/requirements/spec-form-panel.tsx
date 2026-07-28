import { For, Show, createMemo } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { isApifoxConnected, isIntegrationEmpty } from "./apifox"
import { DialogConnectors } from "./dialog-connectors"
import {
  REQUIREMENT_SECTION_KEYS,
  parseDocumentSections,
  type RequirementSectionKey,
} from "./document-template"
import { isTapdConnected } from "./tapd"
import type { RequirementIntegration } from "./types"
import { EMPTY_INTEGRATION } from "./types"

const SECTION_I18N: Record<RequirementSectionKey, string> = {
  goal: "requirements.spec.goal",
  pages: "requirements.spec.pages",
  interactions: "requirements.spec.interactions",
  copy: "requirements.spec.copy",
  constraints: "requirements.spec.constraints",
  acceptance: "requirements.spec.acceptance",
}

const SECTION_HEADING: Record<RequirementSectionKey, string> = {
  goal: "# Goal / 目标",
  pages: "# Pages / Screens / 页面",
  interactions: "# Interactions / 交互",
  copy: "# Copy / 文案",
  constraints: "# Constraints / 约束",
  acceptance: "# Acceptance / 验收",
}

export function SpecFormPanel(props: {
  projectId: string
  document: string
  onChange: (document: string) => void
  integration?: RequirementIntegration
  /** Checked analysis messages drive Spec content */
  handoffCount?: number
  canSend?: boolean
  sending?: boolean
  sendError?: string
  onSend?: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  let editor: HTMLTextAreaElement | undefined

  const sections = createMemo(() => parseDocumentSections(props.document))
  const filledCount = createMemo(
    () => REQUIREMENT_SECTION_KEYS.filter((key) => sections()[key].trim().length > 0).length,
  )
  const emptyFromSelection = createMemo(() => (props.handoffCount ?? 0) === 0)
  const integration = createMemo(() => props.integration ?? EMPTY_INTEGRATION)
  const integrationFilled = createMemo(() => !isIntegrationEmpty(integration()))
  const integrationSummary = createMemo(() => {
    const item = integration()
    const parts: string[] = []
    if (isApifoxConnected(item)) parts.push(language.t("requirements.integration.apifoxBound"))
    if (isTapdConnected(item)) parts.push(language.t("requirements.connector.tapdBound"))
    if (item.envName.trim()) parts.push(item.envName.trim())
    if (item.apis.length > 0) parts.push(language.t("requirements.integration.apiCount", { count: item.apis.length }))
    return parts.join(" · ") || language.t("requirements.connector.emptySummary")
  })

  const jumpToSection = (key: RequirementSectionKey) => {
    const el = editor
    if (!el) return
    const heading = SECTION_HEADING[key]
    const index = props.document.indexOf(heading)
    if (index < 0) return
    const bodyStart = index + heading.length + 1
    el.focus()
    el.setSelectionRange(bodyStart, bodyStart)
    const ratio = bodyStart / Math.max(props.document.length, 1)
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
  }

  const openIntegration = () => {
    void dialog.show(() => <DialogConnectors projectId={props.projectId} />)
  }

  return (
    <section data-component="requirements-panel">
      <div data-component="requirements-panel-header">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h2 data-component="requirements-panel-title">{language.t("requirements.panel.spec")}</h2>
            <Show when={filledCount() > 0}>
              <span data-component="requirements-spec-badge">
                {language.t("requirements.spec.filled", { count: filledCount() })}
              </span>
            </Show>
          </div>
        </div>
      </div>

      <div class="shrink-0 flex flex-wrap gap-1.5 px-3 pt-3">
        <For each={[...REQUIREMENT_SECTION_KEYS]}>
          {(key) => (
            <button
              type="button"
              class="rounded-md px-2 py-1 text-12-regular transition-colors"
              classList={{
                "bg-v2-background-bg-layer-03 text-v2-text-text-base": !!sections()[key].trim(),
                "bg-v2-background-bg-deep text-v2-text-text-weak hover:text-v2-text-text-base": !sections()[key].trim(),
              }}
              onClick={() => jumpToSection(key)}
            >
              {language.t(SECTION_I18N[key])}
            </button>
          )}
        </For>
      </div>

      <div class="flex-1 min-h-0 p-3 pt-2 pb-2">
        <Show
          when={!emptyFromSelection()}
          fallback={
            <div
              data-component="requirements-spec-editor"
              data-empty="true"
              class="size-full min-h-0 flex items-center justify-center rounded-[10px] border border-dashed border-v2-border-border-muted bg-v2-background-bg-deep px-6 text-center text-13-regular leading-6 text-v2-text-text-weak"
            >
              {language.t("requirements.spec.emptyUntilChecked")}
            </div>
          }
        >
          <textarea
            ref={editor}
            data-component="requirements-spec-editor"
            class="size-full min-h-0 resize-none rounded-[10px] border border-v2-border-border-weak bg-v2-background-bg-deep px-3 py-3 text-13-regular leading-6 text-v2-text-text-base outline-none focus:border-v2-border-border-muted"
            value={props.document}
            spellcheck={false}
            placeholder={language.t("requirements.spec.placeholder")}
            onInput={(event) => props.onChange(event.currentTarget.value)}
          />
        </Show>
      </div>

      <div data-component="requirements-integration-bar">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-12-medium text-v2-text-text-base">{language.t("requirements.connector.title")}</span>
            <Show when={integrationFilled()}>
              <span data-component="requirements-spec-badge">{language.t("requirements.connector.connected")}</span>
            </Show>
          </div>
          <p class="text-12-regular text-v2-text-text-weak truncate mt-0.5">{integrationSummary()}</p>
        </div>
        <ButtonV2 size="small" variant="outline" onClick={openIntegration}>
          {language.t("requirements.connector.manage")}
        </ButtonV2>
      </div>

      <Show when={props.onSend}>
        <div data-component="requirements-spec-footer">
          <Show when={props.sendError}>
            {(message) => <p class="text-12-regular text-text-danger-base mb-2">{message()}</p>}
          </Show>
          <div class="flex items-center justify-between gap-3">
            <p class="min-w-0 text-12-regular text-v2-text-text-weak">
              {language.t("requirements.handoff.footerHint")}
            </p>
            <ButtonV2
              size="normal"
              variant="contrast"
              class="shrink-0"
              disabled={!props.canSend || props.sending}
              onClick={() => props.onSend?.()}
            >
              {language.t("requirements.action.sendToCoding")}
            </ButtonV2>
          </div>
        </div>
      </Show>
    </section>
  )
}

export function isRequirementDocumentEmpty(document: string): boolean {
  const sections = parseDocumentSections(document)
  return REQUIREMENT_SECTION_KEYS.every((key) => !sections[key].trim())
}
