import type { AssistantMessage, Message, SnapshotFileDiff, ToolPart } from "@opencode-ai/sdk/v2"
import { uniqueSummaryDiffs } from "@/pages/session/timeline/summary-diffs"
import type { SummaryDiff } from "@/pages/session/timeline/timeline-row"

type PartLookup = (messageID: string) => readonly unknown[] | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function asFileDiff(value: unknown): SnapshotFileDiff | undefined {
  if (!isRecord(value)) return
  if (typeof value.file !== "string" || !value.file) return
  if (typeof value.patch !== "string") return
  if (typeof value.additions !== "number" || typeof value.deletions !== "number") return
  const status = value.status
  if (status !== undefined && status !== "added" && status !== "deleted" && status !== "modified") return
  return {
    file: value.file,
    patch: value.patch,
    additions: value.additions,
    deletions: value.deletions,
    ...(status ? { status } : {}),
  }
}

function applyPatchFileDiff(value: unknown): SnapshotFileDiff | undefined {
  if (!isRecord(value)) return
  const file =
    typeof value.relativePath === "string"
      ? value.relativePath
      : typeof value.filePath === "string"
        ? value.filePath
        : undefined
  const patch = typeof value.patch === "string" ? value.patch : typeof value.diff === "string" ? value.diff : undefined
  if (!file || typeof patch !== "string") return
  const type = value.type
  const status = type === "add" ? "added" : type === "delete" ? "deleted" : "modified"
  return {
    file,
    patch,
    additions: typeof value.additions === "number" ? value.additions : 0,
    deletions: typeof value.deletions === "number" ? value.deletions : 0,
    status,
  }
}

function toolStateMetadata(part: ToolPart) {
  if (!("status" in part.state)) return
  if (part.state.status !== "completed" && part.state.status !== "error") return
  if (!("metadata" in part.state)) return
  return part.state.metadata
}

function turnAssistants(input: { userMessageID: string; messages: readonly Message[] }) {
  return input.messages.filter(
    (message): message is AssistantMessage =>
      message.role === "assistant" && message.parentID === input.userMessageID,
  )
}

/** Collect green/red file diffs from edit/write/apply_patch tool parts in a turn. */
export function collectTurnToolDiffs(input: {
  userMessageID: string | undefined
  messages: readonly Message[]
  parts: PartLookup
}): SummaryDiff[] {
  if (!input.userMessageID) return []

  const assistants = turnAssistants({ userMessageID: input.userMessageID, messages: input.messages })

  const collected: SnapshotFileDiff[] = []
  for (const message of assistants) {
    for (const part of input.parts(message.id) ?? []) {
      if (!isRecord(part) || part.type !== "tool") continue
      const tool = part as ToolPart
      const metadata = toolStateMetadata(tool)
      if (!metadata || !isRecord(metadata)) continue

      const filediff = asFileDiff(metadata.filediff)
      if (filediff) {
        collected.push(filediff)
        continue
      }

      if (!Array.isArray(metadata.files)) continue
      for (const file of metadata.files) {
        const next = applyPatchFileDiff(file)
        if (next) collected.push(next)
      }
    }
  }

  return uniqueSummaryDiffs(collected)
}

/**
 * Paths touched by write/edit/apply_patch even when colored filediff metadata is missing
 * (older write tool). Used to at least open the file preview tab.
 */
export function collectTurnEditedPaths(input: {
  userMessageID: string | undefined
  messages: readonly Message[]
  parts: PartLookup
}): string[] {
  if (!input.userMessageID) return []

  const seen = new Set<string>()
  const out: string[] = []
  const push = (value: string | undefined) => {
    const path = value?.trim()
    if (!path || seen.has(path)) return
    seen.add(path)
    out.push(path)
  }

  for (const message of turnAssistants({ userMessageID: input.userMessageID, messages: input.messages })) {
    for (const part of input.parts(message.id) ?? []) {
      if (!isRecord(part) || part.type !== "tool") continue
      const tool = part as ToolPart
      if (tool.tool !== "write" && tool.tool !== "edit" && tool.tool !== "apply_patch") continue
      const metadata = toolStateMetadata(tool)
      if (!metadata || !isRecord(metadata)) continue

      const filediff = asFileDiff(metadata.filediff)
      if (filediff?.file) push(filediff.file)

      if (typeof metadata.filepath === "string") push(metadata.filepath)

      if (Array.isArray(metadata.files)) {
        for (const file of metadata.files) {
          if (!isRecord(file)) continue
          push(typeof file.relativePath === "string" ? file.relativePath : undefined)
          push(typeof file.filePath === "string" ? file.filePath : undefined)
        }
      }

      if ("input" in tool.state && isRecord(tool.state.input)) {
        push(typeof tool.state.input.filePath === "string" ? tool.state.input.filePath : undefined)
        push(typeof tool.state.input.path === "string" ? tool.state.input.path : undefined)
      }

      if ("title" in tool.state && typeof tool.state.title === "string") push(tool.state.title)
    }
  }

  return out
}
