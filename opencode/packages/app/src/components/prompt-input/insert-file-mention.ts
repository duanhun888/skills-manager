import type { ContentPart, Prompt } from "@/context/prompt"
import { promptLength } from "@/components/prompt-input/history"

/** Insert a file @mention into the prompt the same way drag-drop / @ picker does. */
export function insertFileMention(
  prompt: Prompt,
  path: string,
  cursor?: number,
): { prompt: Prompt; cursor: number } {
  if (prompt.some((part) => part.type === "file" && part.path === path)) {
    return { prompt, cursor: cursor ?? promptLength(prompt) }
  }

  const mention: ContentPart = {
    type: "file",
    path,
    content: `@${path}`,
    start: 0,
    end: 0,
  }
  const text = prompt.map((part) => ("content" in part ? part.content : "")).join("")
  const end = cursor ?? text.length

  let position = 0
  let inserted = false
  const parts = prompt.flatMap<ContentPart>((part) => {
    if (part.type === "image") return [part]
    const partStart = position
    position += part.content.length
    if (part.type !== "text" || end < partStart || end > position) return [part]
    inserted = true
    const before = part.content.slice(0, end - partStart)
    const after = part.content.slice(end - partStart)
    return [
      ...(before ? [{ type: "text" as const, content: before, start: 0, end: 0 }] : []),
      mention,
      { type: "text" as const, content: ` ${after}`, start: 0, end: 0 },
    ]
  })
  if (!inserted) {
    parts.push(mention, { type: "text", content: " ", start: 0, end: 0 })
  }

  let offset = 0
  const next = parts.map((part) => {
    if (part.type === "image") return part
    const value = { ...part, start: offset, end: offset + part.content.length }
    offset = value.end
    return value
  })

  return {
    prompt: next,
    cursor: (end < 0 ? 0 : end) + mention.content.length + 1,
  }
}
