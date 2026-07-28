export const REQUIREMENT_SECTION_KEYS = [
  "goal",
  "pages",
  "interactions",
  "copy",
  "constraints",
  "acceptance",
] as const

export type RequirementSectionKey = (typeof REQUIREMENT_SECTION_KEYS)[number]

export type RequirementSections = Record<RequirementSectionKey, string>

export const EMPTY_SECTIONS: RequirementSections = {
  goal: "",
  pages: "",
  interactions: "",
  copy: "",
  constraints: "",
  acceptance: "",
}

export function defaultDocumentMarkdown(sections: RequirementSections = EMPTY_SECTIONS): string {
  return [
    `# Goal / 目标`,
    sections.goal.trim() || "",
    ``,
    `# Pages / Screens / 页面`,
    sections.pages.trim() || "",
    ``,
    `# Interactions / 交互`,
    sections.interactions.trim() || "",
    ``,
    `# Copy / 文案`,
    sections.copy.trim() || "",
    ``,
    `# Constraints / 约束`,
    sections.constraints.trim() || "",
    ``,
    `# Acceptance / 验收`,
    sections.acceptance.trim() || "",
    ``,
  ].join("\n")
}

export function parseDocumentSections(markdown: string): RequirementSections {
  const next = { ...EMPTY_SECTIONS }
  const parts = markdown.split(/^#\s+/m).filter(Boolean)
  for (const part of parts) {
    const newline = part.indexOf("\n")
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim().toLowerCase()
    const body = (newline === -1 ? "" : part.slice(newline + 1)).trim()
    if (heading.startsWith("goal")) next.goal = body
    else if (heading.startsWith("pages") || heading.startsWith("screen")) next.pages = body
    else if (heading.startsWith("interaction")) next.interactions = body
    else if (heading.startsWith("copy") || heading.includes("文案")) next.copy = body
    else if (heading.startsWith("constraint") || heading.includes("约束")) next.constraints = body
    else if (heading.startsWith("acceptance") || heading.includes("验收")) next.acceptance = body
  }
  return next
}
