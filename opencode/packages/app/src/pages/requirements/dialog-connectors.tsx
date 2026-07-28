import { For, Show, createMemo, createSignal } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogBody, DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { isApifoxConnected } from "./apifox"
import { useRequirements } from "./context"
import { DialogIntegrationConfig } from "./dialog-integration"
import { DialogTapdConfig } from "./dialog-tapd"
import { isTapdConnected } from "./tapd"
import { EMPTY_INTEGRATION } from "./types"

type ConnectorId = "apifox" | "tapd"

type ConnectorCard = {
  id: ConnectorId
  nameKey: string
  descKey: string
  mark: string
  connected: boolean
}

export function DialogConnectors(props: { projectId: string }) {
  const language = useLanguage()
  const dialog = useDialog()
  const requirements = useRequirements()
  const [query, setQuery] = createSignal("")

  const project = createMemo(() => requirements.projects().find((item) => item.id === props.projectId))
  const integration = createMemo(() => project()?.integration ?? EMPTY_INTEGRATION)

  const cards = createMemo<ConnectorCard[]>(() => {
    const q = query().trim().toLowerCase()
    const list: ConnectorCard[] = [
      {
        id: "apifox",
        nameKey: "requirements.connector.apifox",
        descKey: "requirements.connector.apifoxDesc",
        mark: "A",
        connected: isApifoxConnected(integration()),
      },
      {
        id: "tapd",
        nameKey: "requirements.connector.tapd",
        descKey: "requirements.connector.tapdDesc",
        mark: "T",
        connected: isTapdConnected(integration()),
      },
    ]
    if (!q) return list
    return list.filter((item) => {
      const name = language.t(item.nameKey).toLowerCase()
      const desc = language.t(item.descKey).toLowerCase()
      return name.includes(q) || desc.includes(q) || item.id.includes(q)
    })
  })

  const openConnector = (id: ConnectorId) => {
    dialog.close()
    queueMicrotask(() => {
      if (id === "apifox") {
        void dialog.show(() => <DialogIntegrationConfig projectId={props.projectId} />)
        return
      }
      void dialog.show(() => <DialogTapdConfig projectId={props.projectId} />)
    })
  }

  return (
    <DialogV2 size="large" containerClass="requirements-connectors-dialog-container">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("requirements.connector.title")}
          description={language.t("requirements.connector.catalogHint")}
        />
      </DialogHeader>
      <DialogBody class="requirements-connectors-dialog-body">
        <div data-component="requirements-connectors-toolbar">
          <TextInputV2
            value={query()}
            placeholder={language.t("requirements.connector.search")}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <ul data-component="requirements-connectors-list">
          <For
            each={cards()}
            fallback={
              <li data-component="requirements-connectors-empty">{language.t("requirements.connector.noMatch")}</li>
            }
          >
            {(card) => (
              <li data-component="requirements-connector-card">
                <div data-slot="mark" data-id={card.id}>
                  {card.mark}
                </div>
                <div data-slot="body">
                  <div data-slot="title-row">
                    <span data-slot="name">{language.t(card.nameKey)}</span>
                    <Show when={card.connected}>
                      <span data-slot="badge">{language.t("requirements.connector.connected")}</span>
                    </Show>
                  </div>
                  <p data-slot="desc">{language.t(card.descKey)}</p>
                </div>
                <ButtonV2
                  size="small"
                  variant={card.connected ? "outline" : "contrast"}
                  icon={card.connected ? undefined : "plus"}
                  onClick={() => openConnector(card.id)}
                >
                  {card.connected
                    ? language.t("requirements.connector.manage")
                    : language.t("requirements.connector.add")}
                </ButtonV2>
              </li>
            )}
          </For>
        </ul>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
          {language.t("common.close")}
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}
