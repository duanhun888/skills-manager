import type { RequirementApiRef, RequirementIntegration, RequirementProject } from "./types"
import { EMPTY_INTEGRATION } from "./types"

/** Shared system defaults (env / Apifox / TAPD / notes) — excludes per-requirement APIs. */
export function isSharedIntegrationEmpty(integration?: RequirementIntegration): boolean {
  const value = integration ?? EMPTY_INTEGRATION
  return (
    !value.envName.trim() &&
    !value.baseUrl.trim() &&
    !value.apifoxUrl.trim() &&
    !value.apifoxProjectId.trim() &&
    !value.apifoxAccessToken.trim() &&
    !value.tapdUrl.trim() &&
    !value.tapdWorkspaceId.trim() &&
    !value.tapdStoryUrl.trim() &&
    !value.tapdAccessToken.trim() &&
    !value.notes.trim()
  )
}

/** Copy Apifox/env/TAPD defaults from the latest sibling on the same system; APIs stay empty. */
export function inheritSystemIntegration(
  projects: readonly RequirementProject[],
  systemDirectory: string | undefined,
  excludeId?: string,
): RequirementIntegration | undefined {
  const directory = systemDirectory?.trim()
  if (!directory) return

  const peers = projects
    .filter((item) => item.id !== excludeId && item.systemDirectory === directory)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  for (const peer of peers) {
    const source = peer.integration ?? EMPTY_INTEGRATION
    if (isSharedIntegrationEmpty(source)) continue
    return {
      envName: source.envName,
      baseUrl: source.baseUrl,
      apifoxUrl: source.apifoxUrl,
      apifoxProjectId: source.apifoxProjectId,
      apifoxAccessToken: source.apifoxAccessToken,
      tapdUrl: source.tapdUrl,
      tapdWorkspaceId: source.tapdWorkspaceId,
      tapdStoryUrl: "",
      tapdAccessToken: source.tapdAccessToken,
      notes: source.notes,
      apis: [],
    }
  }
}

/** Extract Apifox numeric project id from common app URLs or raw id. */
export function extractApifoxProjectId(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return
  if (/^\d+$/.test(trimmed)) return trimmed
  const match =
    trimmed.match(/apifox\.com\/project\/(\d+)/i) ??
    trimmed.match(/[?&]projectId=(\d+)/i) ??
    trimmed.match(/\/project\/(\d+)/i)
  return match?.[1]
}

export function isIntegrationEmpty(integration?: RequirementIntegration): boolean {
  const value = integration ?? EMPTY_INTEGRATION
  return (
    !value.envName.trim() &&
    !value.baseUrl.trim() &&
    !value.apifoxUrl.trim() &&
    !value.apifoxProjectId.trim() &&
    !value.apifoxAccessToken.trim() &&
    !value.tapdUrl.trim() &&
    !value.tapdWorkspaceId.trim() &&
    !value.tapdStoryUrl.trim() &&
    !value.tapdAccessToken.trim() &&
    !value.notes.trim() &&
    value.apis.length === 0
  )
}

export function isApifoxConnected(integration?: RequirementIntegration): boolean {
  const value = integration ?? EMPTY_INTEGRATION
  return !!(value.apifoxProjectId.trim() || value.apifoxUrl.trim() || extractApifoxProjectId(value.apifoxUrl))
}

/** Project ID + access token — ready to import APIs / write MCP. */
export function isApifoxReady(integration?: RequirementIntegration): boolean {
  const value = integration ?? EMPTY_INTEGRATION
  const projectId = value.apifoxProjectId.trim() || extractApifoxProjectId(value.apifoxUrl) || ""
  return !!(projectId && value.apifoxAccessToken.trim())
}

export type ApifoxMcpOptions = {
  projectId: string
  /** MCP server display name — Apifox recommends including「API 文档」 */
  serverName?: string
  /** Personal access token; omitted → placeholder for manual fill */
  accessToken?: string
  /** Windows needs `cmd /c` wrapper for npx */
  windows?: boolean
}

export type ApifoxMcpLocalConfig = {
  type: "local"
  command: string[]
  enabled: true
  environment: {
    APIFOX_ACCESS_TOKEN: string
  }
}

export function resolveApifoxMcpServerName(systemName?: string, title?: string): string {
  const system = systemName?.trim() || title?.trim() || ""
  return (system ? `${system} API 文档` : "API 文档").replace(/"/g, "")
}

/** Structured MCP entry for config.update / mcp.add. */
export function buildApifoxMcpEntry(input: string | ApifoxMcpOptions): {
  name: string
  config: ApifoxMcpLocalConfig
} {
  const options: ApifoxMcpOptions = typeof input === "string" ? { projectId: input } : input
  const id = options.projectId.trim() || "<project-id>"
  const name = (options.serverName?.trim() || "API 文档").replace(/"/g, "")
  const token = options.accessToken?.trim() || "<APIFOX_ACCESS_TOKEN>"
  const windows = options.windows ?? (typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent))

  const command = windows
    ? ["cmd", "/c", "npx", "-y", "apifox-mcp-server@latest", `--project-id=${id}`]
    : ["npx", "-y", "apifox-mcp-server@latest", `--project-id=${id}`]

  return {
    name,
    config: {
      type: "local",
      command,
      enabled: true,
      environment: {
        APIFOX_ACCESS_TOKEN: token,
      },
    },
  }
}

/** Build OpenCode `opencode.json` MCP snippet for Apifox (not Cursor `mcpServers`). */
export function buildApifoxMcpConfig(input: string | ApifoxMcpOptions): string {
  const { name, config } = buildApifoxMcpEntry(input)
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        [name]: config,
      },
    },
    null,
    2,
  )
}

export function formatApiRef(api: RequirementApiRef): string {
  const method = api.method.trim().toUpperCase() || "API"
  const path = api.path.trim() || api.name.trim() || "(unnamed)"
  const name = api.name.trim()
  const head = name && name !== path ? `${method} ${path} — ${name}` : `${method} ${path}`
  const details: string[] = []
  if (api.requestSummary?.trim()) details.push(`req: ${api.requestSummary.trim()}`)
  if (api.responseSummary?.trim()) details.push(`res: ${api.responseSummary.trim()}`)
  if (details.length === 0) return head
  return `${head} (${details.join("; ")})`
}

/** Parse lines like `POST /path 名称` or `GET /path — 名称`. */
export function parseApiLines(text: string): Omit<RequirementApiRef, "id">[] {
  const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const cleaned = line.replace(/^[•\-\d.、]+\s*/, "")
      const parts = cleaned.split(/\s+/)
      if (parts.length === 0) return []
      let method = "POST"
      let rest = parts
      if (methods.has(parts[0]!.toUpperCase())) {
        method = parts[0]!.toUpperCase()
        rest = parts.slice(1)
      }
      if (rest.length === 0) return []
      const path = rest[0] ?? ""
      const name = rest.slice(1).join(" ").replace(/^[—\-–]+\s*/, "").trim()
      if (!path.trim() && !name) return []
      return [{ method, path: path.trim() || name, name }]
    })
}

/** Merge imported APIs into existing list (dedupe by method+path; enrich schemas on re-import). */
export function mergeApiRefs(
  existing: RequirementApiRef[],
  incoming: Omit<RequirementApiRef, "id">[],
  idFactory: () => string,
): { next: RequirementApiRef[]; added: number; updated: number } {
  const indexByKey = new Map(
    existing.map((api, index) => [`${api.method.trim().toUpperCase()} ${api.path.trim()}`, index] as const),
  )
  const next = [...existing]
  let added = 0
  let updated = 0
  for (const item of incoming) {
    const method = item.method.trim().toUpperCase() || "POST"
    const path = item.path.trim()
    if (!path) continue
    const key = `${method} ${path}`
    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      const current = next[existingIndex]!
      const requestSummary = item.requestSummary?.trim() || current.requestSummary
      const responseSummary = item.responseSummary?.trim() || current.responseSummary
      const name = item.name.trim() || current.name
      if (
        requestSummary !== current.requestSummary ||
        responseSummary !== current.responseSummary ||
        name !== current.name
      ) {
        next[existingIndex] = { ...current, name, requestSummary, responseSummary }
        updated += 1
      }
      continue
    }
    indexByKey.set(key, next.length)
    next.push({
      id: idFactory(),
      method,
      path,
      name: item.name.trim(),
      requestSummary: item.requestSummary?.trim() || undefined,
      responseSummary: item.responseSummary?.trim() || undefined,
    })
    added += 1
  }
  return { next, added, updated }
}

export const APIFOX_MCP_DOCS = "https://docs.apifox.com/6327888m0"
export const APIFOX_TOKEN_DOCS = "https://docs.apifox.com/api-access-token"
