export const VISION_DESCRIBE_SYSTEM = [
  "You are a vision assistant preparing image context for a coding agent in the same chat.",
  "Read the conversation history and the user's latest request first, then inspect the screenshot(s).",
  "Prioritize what matters for the current task: bugs, errors, mismatched UI vs prior discussion, labels/copy to implement, layout/state the user asked about.",
  "Skip generic full-page narration unless needed; call out concrete visible text, controls, and anomalies tied to the ask.",
  "If the user message is empty, infer intent from recent turns and describe what a coder would need next.",
  "Reply in the same language as the user / recent chat when clear; otherwise use Chinese.",
  "Be concise and factual. Do not write application code or pretend to finish the coding task.",
].join(" ")

export function collectAssistantText(parts: unknown): string {
  if (!Array.isArray(parts)) return ""
  return parts
    .flatMap((part) => {
      if (!part || typeof part !== "object") return []
      const item = part as { type?: string; text?: unknown; ignored?: boolean }
      if (item.type === "text" && typeof item.text === "string" && !item.ignored) {
        const text = item.text.trim()
        return text ? [text] : []
      }
      return []
    })
    .join("\n\n")
    .trim()
}

function isZh(locale: string) {
  return locale === "zh" || locale === "zht"
}

/** User-facing text for the vision prep turn (Pass1). */
export function buildVisionDescribeUserText(userText: string, locale: string): string {
  const trimmed = userText.trim()
  if (!trimmed) {
    return isZh(locale)
      ? "请结合本会话上文，识别附图中与当前任务相关的界面、文案、状态与问题，供后续编码使用；无关细节可省略。不要写业务代码。"
      : "Using this chat's context, describe what in the screenshot matters for the current coding task; omit unrelated detail. Do not write application code."
  }
  if (isZh(locale)) {
    return [
      "[识图准备]",
      "请结合本会话上文与附图，针对下面的用户请求，输出面向后续编码的识图结果（具体可见文案、报错、控件与任务相关的 UI/状态）。不要写业务代码或完整实现方案。",
      "",
      "用户请求：",
      trimmed,
    ].join("\n")
  }
  return [
    "[Vision prep]",
    "Using this chat and the screenshot(s), produce a coding-oriented description for the user request below (visible text, errors, controls, task-relevant UI/state). Do not write application code or a full solution.",
    "",
    "User request:",
    trimmed,
  ].join("\n")
}

/** Follow-up user text for the coding model (Pass2), after images were described. */
export function buildCodingFollowupText(userText: string, description: string, locale: string): string {
  const trimmed = userText.trim()
  const desc = description.trim()
  if (isZh(locale)) {
    const header = [
      "[截图识别]",
      "以下由视觉模型根据附图与会话上下文生成；编码模型看不到原图。请结合会话历史与用户意图继续处理，识图如有遗漏以用户请求为准。",
      "",
      desc,
    ].join("\n")
    if (!trimmed) {
      return `${header}\n\n请结合会话上文与上述识图结果继续处理。`
    }
    return `${trimmed}\n\n${header}`
  }
  const header = [
    "[Screenshot describe]",
    "Produced by a vision model from the attached image(s) and chat context; the coding model cannot see the original image. Continue from chat history and the user intent; if the describe misses details, prefer the user request.",
    "",
    desc,
  ].join("\n")
  if (!trimmed) {
    return `${header}\n\nContinue using the chat context and the description above.`
  }
  return `${trimmed}\n\n${header}`
}
