import type * as Monaco from "monaco-editor"
import { ensureMonacoEnvironment } from "./environment"

type MonacoModule = typeof Monaco

let pending: Promise<MonacoModule> | undefined

export function loadMonaco() {
  if (!pending) {
    pending = (async () => {
      ensureMonacoEnvironment()
      await import("monaco-editor/min/vs/editor/editor.main.css")
      return import("monaco-editor")
    })()
  }
  return pending
}
