export const VISION_DESCRIBE_SYSTEM_CONTEXT = [
  "You are a vision assistant preparing image context for a coding agent in the same chat.",
  "The user ask needs chat context: read recent turns and the latest request, then inspect the screenshot(s).",
  "Prioritize what matters for the current task: bugs, errors, mismatched UI vs prior discussion, labels/copy to implement, layout/state the user asked about.",
  "Skip generic full-page narration unless needed; call out concrete visible text, controls, and anomalies tied to the ask.",
  "Reply in the same language as the user / recent chat when clear; otherwise use Chinese.",
  "Be concise and factual. Do not write application code or pretend to finish the coding task.",
].join(" ")

export const VISION_DESCRIBE_SYSTEM_IMAGE_ONLY = [
  "You are a vision assistant preparing image context for a coding agent.",
  "Describe ONLY what is visible in the attached screenshot(s). Do not use earlier chat turns to reinterpret or invent task intent.",
  "Cover concrete visible text/labels, layout, controls, UI state, and errors shown in the image.",
  "Reply in the same language as the user message when present; otherwise use Chinese.",
  "Be concise and factual. Do not write application code or pretend to finish the coding task.",
].join(" ")

/** Prefer image-only when the ask is just “look at this picture”, or user opts out of context. */
export function visionDescribeMode(userText: string): "image_only" | "task_context" {
  const trimmed = userText.trim()
  if (!trimmed) return "image_only"

  const lower = trimmed.toLowerCase()
  if (
    /忽略上下文|不要结合上下文|别结合上下文|只看图|仅看图|独立识图|不要参考上文|ignore\s*context|no\s*context|image\s*only|screenshot\s*only/.test(
      lower,
    )
  ) {
    return "image_only"
  }

  if (
    /结合上下文|参考上文|按我们刚才|继续.*改|with\s*context|use\s*(the\s*)?chat/.test(lower)
  ) {
    return "task_context"
  }

  // Short “just describe the image” asks — do not drag prior coding discussion in.
  if (
    /^(分析图片|识别图片|识图|看图|看下图|看看这[张幅]?图|描述这[张幅]?图|这是什么|图片分析|截图分析|analyze(\s+this)?(\s+image|\s+screenshot)?|describe(\s+this)?(\s+image|\s+screenshot)?|what('s| is) (in )?this (image|screenshot)|what do you see)[.!！。…]*$/i.test(
      trimmed,
    )
  ) {
    return "image_only"
  }

  return "task_context"
}

export function visionDescribeSystem(mode: "image_only" | "task_context") {
  return mode === "image_only" ? VISION_DESCRIBE_SYSTEM_IMAGE_ONLY : VISION_DESCRIBE_SYSTEM_CONTEXT
}

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
  const mode = visionDescribeMode(trimmed)
  if (mode === "image_only") {
    if (!trimmed) {
      return isZh(locale)
        ? "请仅根据附图本身识别界面结构、文案、控件与状态，供后续编码参考；不要参考本会话上文。不要写业务代码。"
        : "Describe only what is visible in the screenshot(s) for follow-up coding; do not use earlier chat turns. Do not write application code."
    }
    if (isZh(locale)) {
      return [
        "[识图准备 · 仅看图]",
        "请仅根据附图输出识图结果（可见文案、报错、控件、布局与状态）。不要参考本会话上文，不要把历史讨论硬套到图上。不要写业务代码或完整实现方案。",
        "",
        "用户请求：",
        trimmed,
      ].join("\n")
    }
    return [
      "[Vision prep · image only]",
      "Describe only the screenshot(s) (visible text, errors, controls, layout/state). Do not use earlier chat turns or force prior discussion onto the image. Do not write application code or a full solution.",
      "",
      "User request:",
      trimmed,
    ].join("\n")
  }

  if (!trimmed) {
    return isZh(locale)
      ? "请结合本会话上文，识别附图中与当前任务相关的界面、文案、状态与问题，供后续编码使用；无关细节可省略。不要写业务代码。"
      : "Using this chat's context, describe what in the screenshot matters for the current coding task; omit unrelated detail. Do not write application code."
  }
  if (isZh(locale)) {
    return [
      "[识图准备 · 结合上下文]",
      "请结合本会话上文与附图，针对下面的用户请求，输出面向后续编码的识图结果（具体可见文案、报错、控件与任务相关的 UI/状态）。不要写业务代码或完整实现方案。",
      "",
      "用户请求：",
      trimmed,
    ].join("\n")
  }
  return [
    "[Vision prep · with context]",
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
  const mode = visionDescribeMode(trimmed)
  if (isZh(locale)) {
    const header =
      mode === "image_only"
        ? [
            "[截图识别]",
            "以下由视觉模型仅根据附图生成（未强制结合上文）；编码模型看不到原图。请按用户请求继续处理，识图如有遗漏以用户请求为准。",
            "",
            desc,
          ].join("\n")
        : [
            "[截图识别]",
            "以下由视觉模型根据附图与会话上下文生成；编码模型看不到原图。请结合会话历史与用户意图继续处理，识图如有遗漏以用户请求为准。",
            "",
            desc,
          ].join("\n")
    if (!trimmed) {
      return `${header}\n\n请结合上述识图结果继续处理。`
    }
    return `${trimmed}\n\n${header}`
  }
  const header =
    mode === "image_only"
      ? [
          "[Screenshot describe]",
          "Produced from the image(s) only (chat context was not forced); the coding model cannot see the original image. Continue from the user request; if the describe misses details, prefer the user request.",
          "",
          desc,
        ].join("\n")
      : [
          "[Screenshot describe]",
          "Produced by a vision model from the attached image(s) and chat context; the coding model cannot see the original image. Continue from chat history and the user intent; if the describe misses details, prefer the user request.",
          "",
          desc,
        ].join("\n")
  if (!trimmed) {
    return `${header}\n\nContinue using the description above.`
  }
  return `${trimmed}\n\n${header}`
}
