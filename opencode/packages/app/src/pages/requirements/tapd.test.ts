import { describe, expect, test } from "bun:test"
import { buildTapdMcpConfig, extractTapdWorkspaceId, isTapdConnected } from "./tapd"
import { EMPTY_INTEGRATION } from "./types"

describe("tapd helpers", () => {
  test("extracts workspace id", () => {
    expect(extractTapdWorkspaceId("https://www.tapd.cn/51234567/prong/stories/view/112")).toBe("51234567")
    expect(extractTapdWorkspaceId("51234567")).toBe("51234567")
    expect(extractTapdWorkspaceId("")).toBeUndefined()
  })

  test("builds mcp config", () => {
    const json = buildTapdMcpConfig({ workspaceId: "99", windows: false })
    expect(json).toContain("@xihe-lab/tapd-mcp-server@latest")
    expect(json).toContain("99")
    expect(json).toContain("<TAPD_ACCESS_TOKEN>")
    expect(json).toContain('"mcp"')
    expect(json).not.toContain("mcpServers")
    const parsed = JSON.parse(json) as { mcp: { TAPD: { type: string; command: string[] } } }
    expect(parsed.mcp.TAPD.type).toBe("local")
    expect(parsed.mcp.TAPD.command[0]).toBe("npx")
  })

  test("builds mcp config with token from form", () => {
    const json = buildTapdMcpConfig({ workspaceId: "99", accessToken: "secret-token", windows: false })
    expect(json).toContain('"TAPD_ACCESS_TOKEN": "secret-token"')
    expect(json).not.toContain("<TAPD_ACCESS_TOKEN>")
  })

  test("detects connected", () => {
    expect(isTapdConnected(EMPTY_INTEGRATION)).toBe(false)
    expect(isTapdConnected({ ...EMPTY_INTEGRATION, tapdWorkspaceId: "1" })).toBe(true)
  })
})
