import type { RequirementAsset, RequirementIntegration, RequirementProject } from "./types"
import { EMPTY_INTEGRATION } from "./types"
import { parseDocumentSections, REQUIREMENT_SECTION_KEYS, type RequirementSectionKey } from "./document-template"
import { formatApiRef, isIntegrationEmpty } from "./apifox"

export { isIntegrationEmpty } from "./apifox"

export type RequirementHandoffOptions = {
  sections: Partial<Record<RequirementSectionKey, boolean>>
  includeIntegration: boolean
  includeAssets: boolean
  assetIds: string[]
  includeAnalystNotes: boolean
  /** Checked analysis-chat messages to append as excerpts (empty = Spec only) */
  messageIds: string[]
}

export function defaultHandoffOptions(project: RequirementProject): RequirementHandoffOptions {
  const sections = parseDocumentSections(project.document)
  const sectionFlags = Object.fromEntries(
    REQUIREMENT_SECTION_KEYS.map((key) => [key, sections[key].trim().length > 0]),
  ) as Record<RequirementSectionKey, boolean>
  const validMessageIds = new Set(project.messages.map((message) => message.id))
  return {
    sections: sectionFlags,
    includeIntegration: !isIntegrationEmpty({ ...EMPTY_INTEGRATION, ...(project.integration ?? {}) }),
    includeAssets: project.assets.length > 0,
    assetIds: project.assets.map((asset) => asset.id),
    // Off by default — often filled with chat noise when analysis replies are unstructured.
    includeAnalystNotes: false,
    messageIds: (project.handoffMessageIds ?? []).filter((id) => validMessageIds.has(id)),
  }
}

export function serializeRequirementBrief(
  project: RequirementProject,
  options?: Partial<RequirementHandoffOptions>,
): string {
  const defaults = defaultHandoffOptions(project)
  const opts: RequirementHandoffOptions = {
    ...defaults,
    ...options,
    sections: { ...defaults.sections, ...options?.sections },
    assetIds: options?.assetIds ?? defaults.assetIds,
    messageIds: options?.messageIds ?? defaults.messageIds,
  }

  const sections = parseDocumentSections(project.document)
  const selectedAssets = opts.includeAssets
    ? project.assets.filter((asset) => opts.assetIds.includes(asset.id))
    : []
  const assetLines =
    selectedAssets.length === 0
      ? opts.includeAssets
        ? ["(none)"]
        : []
      : selectedAssets.map((asset, index) => formatAssetLine(asset, index + 1))

  const integration = { ...EMPTY_INTEGRATION, ...(project.integration ?? {}) }
  const apiLines =
    integration.apis.length > 0
      ? integration.apis.map((api, index) => `${index + 1}. ${formatApiRef(api)}`)
      : undefined

  const integrationBlock =
    opts.includeIntegration && !isIntegrationEmpty(integration)
      ? [
          `### Integration / 联调环境`,
          integration.envName.trim() ? `- Environment: ${integration.envName.trim()}` : undefined,
          integration.baseUrl.trim() ? `- API Base URL: ${integration.baseUrl.trim()}` : undefined,
          integration.apifoxUrl.trim() ? `- Apifox URL: ${integration.apifoxUrl.trim()}` : undefined,
          integration.apifoxProjectId.trim()
            ? `- Apifox Project ID (MCP): ${integration.apifoxProjectId.trim()}`
            : undefined,
          // Never include apifoxAccessToken in coding brief
          integration.tapdUrl.trim() ? `- TAPD URL: ${integration.tapdUrl.trim()}` : undefined,
          integration.tapdWorkspaceId.trim()
            ? `- TAPD Workspace ID: ${integration.tapdWorkspaceId.trim()}`
            : undefined,
          integration.tapdStoryUrl.trim() ? `- TAPD Story: ${integration.tapdStoryUrl.trim()}` : undefined,
          integration.notes.trim() ? `- Notes: ${integration.notes.trim()}` : undefined,
          apiLines
            ? [
                `- Required APIs (implement / wire against these; req/res summaries are from OpenAPI import when present):`,
                ...apiLines.map((line) => `  ${line}`),
              ].join("\n")
            : undefined,
          integration.apis.some((api) => api.requestSummary?.trim() || api.responseSummary?.trim())
            ? `- Prefer the req/res summaries on Required APIs above. Use Apifox MCP only when a path lacks a summary or you need deeper schema detail.`
            : integration.apifoxProjectId.trim()
              ? `- Use Apifox MCP (\`${(project.systemName?.trim() || project.title.trim() || "API").replace(/`/g, "")} API 文档\`) with project-id=${integration.apifoxProjectId.trim()} to fetch exact request/response schemas for the Required APIs above. Prefer MCP over inventing fields. Token is configured in project MCP/config — do not ask the user to paste it.`
              : integration.apifoxUrl.trim()
                ? `- Open Apifox docs and match request/response schemas precisely; do not invent fields.`
                : undefined,
          integration.tapdWorkspaceId.trim() || integration.tapdStoryUrl.trim()
            ? `- Use TAPD MCP with workspace-id=${integration.tapdWorkspaceId.trim() || "(from story URL)"} to read stories/tasks/bugs. Prefer TAPD over inventing requirements status. TAPD download_url expires in ~300s — download bytes immediately after getting the URL (no size checks first); on token expire2 retry once only.`
            : undefined,
          `Do not invent secrets. Read local .env / project config for tokens.`,
          ``,
        ].filter((line): line is string => line !== undefined)
      : []

  const sectionBlocks: string[] = []
  const pushSection = (key: RequirementSectionKey, title: string) => {
    if (!opts.sections[key]) return
    sectionBlocks.push(`### ${title}`, sections[key].trim() || "(not specified)", ``)
  }
  pushSection("goal", "Goal")
  pushSection("pages", "Pages / Screens")
  pushSection("interactions", "Interactions")
  pushSection("copy", "Copy")
  pushSection("constraints", "Constraints")
  pushSection("acceptance", "Acceptance")

  const selectedMessages = opts.messageIds.length
    ? project.messages.filter((message) => opts.messageIds.includes(message.id) && message.content.trim())
    : []
  const messageBlock =
    selectedMessages.length > 0
      ? [
          `### Selected analysis excerpts`,
          `Only the messages checked in the requirements chat are included below — not the full conversation.`,
          ``,
          ...selectedMessages.flatMap((message) => [
            `#### ${message.role === "user" ? "User" : "Assistant"}`,
            message.content.trim(),
            ``,
          ]),
        ]
      : []

  return [
    `Please confirm this product requirement brief before writing code.`,
    `Reply with a short plan (files to touch, UI steps, risks). Wait for my confirmation before implementing.`,
    ``,
    `## Requirement: ${project.title.trim() || "Untitled"}`,
    project.systemName?.trim() || project.systemDirectory?.trim()
      ? `System: ${project.systemName?.trim() || project.systemDirectory}`
      : undefined,
    ``,
    ...sectionBlocks,
    ...integrationBlock,
    opts.includeAssets ? [`### Reference assets`, ...assetLines, ``].join("\n") : "",
    opts.includeAnalystNotes && project.assistantNotes.trim()
      ? [`### Analyst notes`, project.assistantNotes.trim(), ``].join("\n")
      : "",
    ...messageBlock,
  ]
    .filter((line) => line !== undefined && line !== "")
    .join("\n")
    .trim()
}

function formatAssetLine(asset: RequirementAsset, index: number): string {
  const note = asset.note.trim()
  const kind = asset.mime?.startsWith("image/")
    ? "image"
    : asset.mime?.includes("sheet") || /\.xlsx?$/i.test(asset.filename)
      ? "spreadsheet"
      : asset.mime?.includes("pdf") || /\.pdf$/i.test(asset.filename)
        ? "pdf"
        : "file"
  const base = `${index}. [${kind}] ${asset.filename}`
  return note ? `${base} — ${note}` : base
}
