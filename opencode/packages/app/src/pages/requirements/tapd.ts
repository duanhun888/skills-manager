import type { RequirementIntegration } from "./types"
import { EMPTY_INTEGRATION } from "./types"

/** Extract TAPD workspace id from common project / story URLs or raw id. */
export function extractTapdWorkspaceId(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return
  if (/^\d+$/.test(trimmed)) return trimmed
  const match =
    trimmed.match(/tapd\.cn\/(?:tapd_fe\/)?(\d+)/i) ??
    trimmed.match(/[?&](?:workspace_id|project_id)=(\d+)/i) ??
    trimmed.match(/\/(\d{6,})\//)
  return match?.[1]
}

export function isTapdConnected(integration?: RequirementIntegration): boolean {
  const value = integration ?? EMPTY_INTEGRATION
  return !!(
    value.tapdWorkspaceId.trim() ||
    value.tapdUrl.trim() ||
    value.tapdStoryUrl.trim() ||
    extractTapdWorkspaceId(value.tapdUrl) ||
    extractTapdWorkspaceId(value.tapdStoryUrl)
  )
}

export type TapdMcpOptions = {
  workspaceId: string
  /** Personal access token; omitted → placeholder for manual fill */
  accessToken?: string
  windows?: boolean
}

/** Build OpenCode `opencode.json` MCP snippet for TAPD (not Cursor `mcpServers`). */
export function buildTapdMcpConfig(input: string | TapdMcpOptions): string {
  const options: TapdMcpOptions = typeof input === "string" ? { workspaceId: input } : input
  const id = options.workspaceId.trim() || "<workspace-id>"
  const token = options.accessToken?.trim() || "<TAPD_ACCESS_TOKEN>"
  const windows =
    options.windows ?? (typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent))

  const command = windows
    ? ["cmd", "/c", "npx", "-y", "@xihe-lab/tapd-mcp-server@latest"]
    : ["npx", "-y", "@xihe-lab/tapd-mcp-server@latest"]

  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        TAPD: {
          type: "local",
          command,
          enabled: true,
          environment: {
            TAPD_ACCESS_TOKEN: token,
            TAPD_DEFAULT_WORKSPACE_ID: id,
          },
        },
      },
    },
    null,
    2,
  )
}

export const TAPD_OPEN_DOCS = "https://open.tapd.cn/"
