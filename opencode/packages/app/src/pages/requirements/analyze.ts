import type { RequirementAsset, RequirementChatMessage, RequirementIntegration, RequirementSections } from "./types"
import { EMPTY_INTEGRATION } from "./types"
import { formatApiRef, isApifoxConnected, isIntegrationEmpty } from "./apifox"
import { EMPTY_SECTIONS, REQUIREMENT_SECTION_KEYS } from "./document-template"
import { isTapdConnected } from "./tapd"
import { toVisionFileParts } from "./asset-text"

export const REQUIREMENT_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    goal: { type: "string", description: "Product goal and problem statement" },
    pages: { type: "string", description: "Screens / pages and layout structure" },
    interactions: { type: "string", description: "User flows and interactions" },
    copy: { type: "string", description: "Visible copy / labels / microcopy" },
    constraints: { type: "string", description: "Technical or product constraints" },
    acceptance: { type: "string", description: "Acceptance criteria" },
    notes: { type: "string", description: "Open questions or assumptions" },
  },
  required: ["goal", "pages", "interactions", "copy", "constraints", "acceptance"],
} as const

/** Max API rows inlined into analysis chat context (full list stays in the workbench form). */
export const CONNECTOR_API_SAMPLE_LIMIT = 20

export const REQUIREMENT_ANALYSIS_SYSTEM = `You are a product analyst helping designers and PMs.
Analyze UI screenshots / prototypes and extract structured product requirements.
Do NOT write application code.
Write concrete, implementation-ready details in Chinese when the user writes in Chinese.
Preserve visible UI copy accurately.

When the user message includes a "Connected connectors" block, those Apifox / TAPD bindings are already configured in this workbench. Do NOT claim they are missing or ask the user to re-bind them. Reference the listed project/workspace IDs and URLs. Live MCP fetches only work if the linked coding project has the matching MCP server; if tools are unavailable, acknowledge the binding still exists and explain that live TAPD/Apifox fetch needs MCP on the linked project — do not say the form was never configured.
If the connectors block reports a Required APIs total count, that number is the authoritative workbench import count — answer count questions from it immediately. Do not say you cannot check the count, and do not re-fetch Apifox just to count.
When sample APIs include req:/res: summaries, treat those as the workbench-known request/response shapes from OpenAPI import. If a listed API has no req/res summary, say schema was not imported for that path and suggest re-import from Apifox (OpenAPI) or MCP for full detail — do not invent fields.

TAPD image / attachment rules (critical — temp download URLs expire in ~300s):
- If file parts or workbench material images/documents are already attached to the message, analyze them directly. Do NOT re-fetch the same files via TAPD MCP.
- Spreadsheets, PDFs, and docs may arrive as file parts — read and use their content when available.
- When you must use TAPD MCP get_image / attachment download: as soon as you receive download_url, download the bytes immediately (bash/webfetch/write file). Do NOT check file size first, list directories, chat, or take any other step before downloading.
- If the download body is "token expire2" (or similar expiry), call get_image / attachment URL once more and download immediately. At most one retry.

When the user asks you to analyze assets or fill requirement sections, respond with a single JSON object only
(no markdown fences unless necessary). Required keys (string values):
goal, pages, interactions, copy, constraints, acceptance.
Optional key: notes.
For casual chat that does not ask for analysis, reply in plain Chinese text.`

export function defaultAnalyzePrompt(assetCount: number): string {
  if (assetCount <= 0) {
    return "请根据当前需求文档，帮我补全并细化结构化需求章节。请只返回 JSON 对象，字段：goal、pages、interactions、copy、constraints、acceptance、notes。"
  }
  return `请分析本轮附带的 ${assetCount} 个素材（截图/原型/文档），提取产品需求。请只返回 JSON 对象，字段：goal、pages、interactions、copy、constraints、acceptance、notes（均为字符串）。`
}

/**
 * Checked materials should ride along for blank/analyze prompts, but not for every casual
 * follow-up (e.g. "how many Apifox APIs?") — re-parsing Excel/images makes those turns slow.
 */
export function shouldAttachAnalysisAssets(userText: string, chatAssetCount: number): boolean {
  if (chatAssetCount > 0) return true
  const text = userText.trim()
  if (!text) return true
  return /分析|提取|补全|细化|截图|原型|素材|文档|表格|excel|xlsx|页面|交互|需求|spec/i.test(text)
}

/** Convert vision-capable materials into prompt file parts (images + PDF). */
export function toFileParts(assets: RequirementAsset[], limit = 8) {
  return toVisionFileParts(assets, limit)
}

/** Non-secret connector snapshot for the analysis chat prompt (never includes tokens). */
export function formatConnectorContext(integration?: RequirementIntegration): string | undefined {
  const value = { ...EMPTY_INTEGRATION, ...(integration ?? {}) }
  if (isIntegrationEmpty(value)) return

  const lines: string[] = [
    "### Connected connectors (already configured in this workbench)",
    "Treat the following as bound. Do not ask the user to re-configure them.",
  ]

  if (isApifoxConnected(value)) {
    lines.push("- Apifox: connected")
    if (value.apifoxProjectId.trim()) lines.push(`  - Project ID: ${value.apifoxProjectId.trim()}`)
    if (value.apifoxUrl.trim()) lines.push(`  - URL: ${value.apifoxUrl.trim()}`)
    if (value.envName.trim()) lines.push(`  - Environment: ${value.envName.trim()}`)
    if (value.baseUrl.trim()) lines.push(`  - API Base URL: ${value.baseUrl.trim()}`)
    if (value.apifoxAccessToken.trim()) {
      lines.push(
        "  - Access token: saved in the workbench form (not shown here). Live schema fetch requires Apifox MCP on the linked coding project.",
      )
    } else {
      lines.push(
        "  - Access token: not filled in the form. Live Apifox tools require Apifox MCP (token in mcp/config env) on the linked coding project.",
      )
    }
    if (value.apis.length > 0) {
      const withSchema = value.apis.filter((api) => api.requestSummary?.trim() || api.responseSummary?.trim())
      lines.push(`  - Required APIs in this workbench: ${value.apis.length} total`)
      lines.push(
        `  - OpenAPI schema summaries imported for ${withSchema.length}/${value.apis.length} APIs`,
      )
      lines.push(
        "  - Use totals/schema summaries below for questions about imports and shapes. Full list lives in the connector form.",
      )
      const sample = value.apis.slice(0, CONNECTOR_API_SAMPLE_LIMIT)
      lines.push(`  - Sample (first ${sample.length}):`)
      for (const api of sample) lines.push(`    - ${formatApiRef(api)}`)
      if (value.apis.length > sample.length) {
        lines.push(`  - … and ${value.apis.length - sample.length} more omitted from this prompt`)
      }
      if (withSchema.length === 0) {
        lines.push(
          "  - No request/response summaries stored yet. Ask the user to re-import from Apifox (OpenAPI export) to attach schemas; do not invent fields.",
        )
      }
    } else {
      lines.push("  - Required APIs in this workbench: 0 (none imported into the connector form yet)")
    }
  } else if (value.apifoxAccessToken.trim()) {
    lines.push("- Apifox: access token saved in form; bind a project ID to mark the connector connected.")
  }

  if (isTapdConnected(value)) {
    lines.push("- TAPD: connected")
    if (value.tapdWorkspaceId.trim()) lines.push(`  - Workspace ID: ${value.tapdWorkspaceId.trim()}`)
    if (value.tapdUrl.trim()) lines.push(`  - Project URL: ${value.tapdUrl.trim()}`)
    if (value.tapdStoryUrl.trim()) lines.push(`  - Story / bug / task: ${value.tapdStoryUrl.trim()}`)
    if (value.tapdAccessToken.trim()) {
      lines.push(
        "  - Access token: saved in the workbench form (not shown here). Live TAPD tools require TAPD MCP on the linked coding project.",
      )
    } else {
      lines.push(
        "  - Access token: not filled in the form. Live TAPD tools require TAPD MCP (token in mcp.json env) on the linked coding project.",
      )
    }
    lines.push(
      "  - TAPD images: prefer workbench materials if already imported. If using MCP download_url, download immediately (no size checks); temp links expire in ~300s; on token expire2 retry once only.",
    )
  } else if (value.tapdAccessToken.trim()) {
    lines.push("- TAPD: access token saved in form; bind a workspace ID to mark the connector connected.")
  }

  if (value.notes.trim()) lines.push(`- Integration notes: ${value.notes.trim()}`)

  return lines.join("\n")
}

export function isRequirementSections(value: unknown): value is RequirementSections & { notes?: string } {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return REQUIREMENT_SECTION_KEYS.every((key) => typeof record[key] === "string")
}

/** Parse model text into requirement sections (JSON object or fenced JSON). */
export function parseRequirementSectionsFromText(text: string): (RequirementSections & { notes?: string }) | undefined {
  const trimmed = text.trim()
  if (!trimmed) return

  const candidates = [trimmed]
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) candidates.unshift(fence[1].trim())

  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (isRequirementSections(parsed)) return parsed
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>
        const normalized: Record<string, string> = {}
        let ok = true
        for (const key of REQUIREMENT_SECTION_KEYS) {
          const value = record[key]
          if (typeof value === "string") normalized[key] = value
          else if (value == null) normalized[key] = ""
          else if (typeof value === "number" || typeof value === "boolean") normalized[key] = String(value)
          else if (Array.isArray(value) || typeof value === "object") normalized[key] = JSON.stringify(value, null, 2)
          else {
            ok = false
            break
          }
        }
        if (ok) {
          const notes = typeof record.notes === "string" ? record.notes : undefined
          return { ...(normalized as RequirementSections), notes }
        }
      }
    } catch {
      // try next candidate
    }
  }

  return parseRequirementSectionsFromSummary(trimmed)
}

const SUMMARY_LABEL_TO_KEY: Record<string, RequirementSectionKey | "notes"> = {
  目标: "goal",
  goal: "goal",
  页面: "pages",
  屏幕: "pages",
  pages: "pages",
  screens: "pages",
  交互: "interactions",
  interactions: "interactions",
  文案: "copy",
  copy: "copy",
  约束: "constraints",
  constraints: "constraints",
  验收: "acceptance",
  acceptance: "acceptance",
  备注: "notes",
  notes: "notes",
}

/**
 * Parse analysis chat summaries like:
 * `- 目标：...`
 * `- 页面：...`
 * or markdown headings `# Goal / 目标`.
 */
export function parseRequirementSectionsFromSummary(
  text: string,
): (RequirementSections & { notes?: string }) | undefined {
  const trimmed = text.trim()
  if (!trimmed) return

  const result: RequirementSections & { notes?: string } = { ...EMPTY_SECTIONS }
  let hit = false

  // Bullet / labeled lines produced by summarizeAnalysis (and similar model replies)
  const labelLine =
    /(?:^|\n)\s*(?:[-*•]|\d+[.)])?\s*(目标|页面|屏幕|交互|文案|约束|验收|备注|goal|pages|screens|interactions|copy|constraints|acceptance|notes)\s*[/／]?\s*(?:目标|页面|屏幕|交互|文案|约束|验收|Goal|Pages|Screens|Interactions|Copy|Constraints|Acceptance)?\s*[：:]\s*([^\n]+)/gi

  for (const match of trimmed.matchAll(labelLine)) {
    const label = match[1]?.toLowerCase()
    const value = match[2]?.trim()
    if (!label || !value || value === "…") continue
    const key = SUMMARY_LABEL_TO_KEY[label] ?? SUMMARY_LABEL_TO_KEY[match[1]!]
    if (!key) continue
    if (key === "notes") result.notes = joinSection(result.notes, value)
    else result[key] = joinSection(result[key], value)
    hit = true
  }

  // Markdown headings: # Goal / 目标 \n body
  const headingBlocks = trimmed.split(/^#{1,3}\s+/m).filter(Boolean)
  if (headingBlocks.length > 1 || /^#{1,3}\s+/m.test(trimmed)) {
    for (const block of headingBlocks) {
      const newline = block.indexOf("\n")
      const heading = (newline === -1 ? block : block.slice(0, newline)).trim().toLowerCase()
      const body = (newline === -1 ? "" : block.slice(newline + 1)).trim()
      if (!body) continue
      const key = headingToSectionKey(heading)
      if (!key) continue
      if (key === "notes") result.notes = joinSection(result.notes, body)
      else result[key] = joinSection(result[key], body)
      hit = true
    }
  }

  if (!hit) return
  return result
}

function headingToSectionKey(heading: string): RequirementSectionKey | "notes" | undefined {
  if (heading.startsWith("goal") || heading.includes("目标")) return "goal"
  if (heading.startsWith("pages") || heading.startsWith("screen") || heading.includes("页面")) return "pages"
  if (heading.startsWith("interaction") || heading.includes("交互")) return "interactions"
  if (heading.startsWith("copy") || heading.includes("文案")) return "copy"
  if (heading.startsWith("constraint") || heading.includes("约束")) return "constraints"
  if (heading.startsWith("acceptance") || heading.includes("验收")) return "acceptance"
  if (heading.startsWith("note") || heading.includes("备注")) return "notes"
}

function joinSection(current: string | undefined, next: string): string {
  const value = next.trim()
  if (!value) return current?.trim() || ""
  if (!current?.trim()) return value
  if (current.includes(value)) return current
  return `${current.trim()}\n\n${value}`
}

function sectionHasContent(sections: RequirementSections): boolean {
  return REQUIREMENT_SECTION_KEYS.some((key) => sections[key].trim().length > 0)
}

export function mergeRequirementSections(
  current: RequirementSections,
  next: RequirementSections,
  mode: "replace" | "fill-empty" = "replace",
): RequirementSections {
  if (mode === "replace") {
    return {
      goal: next.goal.trim() || current.goal,
      pages: next.pages.trim() || current.pages,
      interactions: next.interactions.trim() || current.interactions,
      copy: next.copy.trim() || current.copy,
      constraints: next.constraints.trim() || current.constraints,
      acceptance: next.acceptance.trim() || current.acceptance,
    }
  }
  return {
    goal: current.goal.trim() || next.goal,
    pages: current.pages.trim() || next.pages,
    interactions: current.interactions.trim() || next.interactions,
    copy: current.copy.trim() || next.copy,
    constraints: current.constraints.trim() || next.constraints,
    acceptance: current.acceptance.trim() || next.acceptance,
  }
}

/** Build Spec sections from checked analysis-chat messages only. */
export function buildSectionsFromHandoffMessages(messages: RequirementChatMessage[]): RequirementSections {
  let result = { ...EMPTY_SECTIONS }
  const leftovers: string[] = []

  for (const message of messages) {
    const stored = message.sections
    const fromStored = stored && sectionHasContent(stored) ? stored : undefined
    const parsed =
      fromStored ??
      (message.content.trim() ? parseRequirementSectionsFromText(message.content) : undefined)

    if (parsed && sectionHasContent(parsed)) {
      const { notes, ...sections } = parsed
      result = mergeRequirementSections(result, sections, "replace")
      if (typeof notes === "string" && notes.trim()) leftovers.push(notes.trim())
      continue
    }

    if (message.content.trim()) {
      leftovers.push(
        `${message.role === "user" ? "用户" : "助手"}：\n${message.content.trim()}`,
      )
    }
  }

  if (leftovers.length > 0) {
    const blob = leftovers.join("\n\n")
    const hasStructured = sectionHasContent(result)
    if (hasStructured) {
      result.acceptance = [result.acceptance, blob].filter((part) => part.trim()).join("\n\n")
    } else {
      result.goal = blob
    }
  }

  return result
}

export function summarizeAnalysis(sections: RequirementSections, notes?: string): string {
  const lines = [
    "已根据素材生成结构化需求（勾选右侧方框后写入 Spec）：",
    sections.goal.trim() ? `- 目标：${truncate(sections.goal)}` : undefined,
    sections.pages.trim() ? `- 页面：${truncate(sections.pages)}` : undefined,
    sections.interactions.trim() ? `- 交互：${truncate(sections.interactions)}` : undefined,
    sections.copy.trim() ? `- 文案：${truncate(sections.copy)}` : undefined,
    sections.constraints.trim() ? `- 约束：${truncate(sections.constraints)}` : undefined,
    sections.acceptance.trim() ? `- 验收：${truncate(sections.acceptance)}` : undefined,
    notes?.trim() ? `- 备注：${truncate(notes)}` : undefined,
  ].filter(Boolean)
  return lines.join("\n") || "分析完成。"
}

function truncate(value: string, max = 80) {
  const text = value.replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export { EMPTY_SECTIONS }
