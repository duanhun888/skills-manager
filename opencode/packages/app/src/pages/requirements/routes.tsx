import type { ParentProps } from "solid-js"
import { RequirementsProvider } from "./context"
import { RequirementsEditorPage, RequirementsListPage } from "./index"

export function RequirementsLayout(props: ParentProps) {
  return <RequirementsProvider>{props.children}</RequirementsProvider>
}

export { RequirementsListPage, RequirementsEditorPage }
