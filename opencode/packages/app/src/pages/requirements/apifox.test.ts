import { describe, expect, test } from "bun:test"
import {
  buildApifoxMcpConfig,
  extractApifoxProjectId,
  formatApiRef,
  inheritSystemIntegration,
  isApifoxReady,
  isIntegrationEmpty,
  isSharedIntegrationEmpty,
  mergeApiRefs,
  parseApiLines,
} from "./apifox"
import { EMPTY_INTEGRATION, type RequirementProject } from "./types"

describe("apifox helpers", () => {
  test("extracts project id from url", () => {
    expect(extractApifoxProjectId("https://app.apifox.com/project/6980123/apis")).toBe("6980123")
    expect(extractApifoxProjectId("6980123")).toBe("6980123")
    expect(extractApifoxProjectId("")).toBeUndefined()
  })

  test("builds OpenCode mcp config", () => {
    const json = buildApifoxMcpConfig({ projectId: "42", serverName: "志宏ERP API 文档", windows: false })
    const parsed = JSON.parse(json) as {
      mcp: Record<string, { type: string; command: string[]; environment: Record<string, string> }>
    }
    expect(parsed.mcp["志宏ERP API 文档"]?.type).toBe("local")
    expect(parsed.mcp["志宏ERP API 文档"]?.command).toEqual([
      "npx",
      "-y",
      "apifox-mcp-server@latest",
      "--project-id=42",
    ])
    expect(parsed.mcp["志宏ERP API 文档"]?.environment.APIFOX_ACCESS_TOKEN).toBe("<APIFOX_ACCESS_TOKEN>")
  })

  test("builds mcp config with real token", () => {
    const json = buildApifoxMcpConfig({
      projectId: "42",
      serverName: "API 文档",
      accessToken: "secret-token",
      windows: false,
    })
    expect(json).toContain("secret-token")
    expect(json).not.toContain("<APIFOX_ACCESS_TOKEN>")
  })

  test("builds windows OpenCode mcp config with cmd /c", () => {
    const json = buildApifoxMcpConfig({ projectId: "42", windows: true })
    expect(json).toContain('"cmd"')
    expect(json).toContain("/c")
    expect(json).toContain("--project-id=42")
    expect(json).toContain('"mcp"')
    expect(json).not.toContain("mcpServers")
  })

  test("parses bulk api lines", () => {
    const apis = parseApiLines(`
POST /middle/pallet/config/list 获取货盘配置列表
GET /a — detail
/orphan-path
`)
    expect(apis).toEqual([
      { method: "POST", path: "/middle/pallet/config/list", name: "获取货盘配置列表" },
      { method: "GET", path: "/a", name: "detail" },
      { method: "POST", path: "/orphan-path", name: "" },
    ])
  })

  test("formats api refs", () => {
    expect(formatApiRef({ id: "1", method: "post", path: "/a", name: "列表" })).toBe("POST /a — 列表")
    expect(
      formatApiRef({
        id: "1",
        method: "post",
        path: "/a",
        name: "列表",
        requestSummary: "application/json {id}",
        responseSummary: "200 {ok}",
      }),
    ).toBe("POST /a — 列表 (req: application/json {id}; res: 200 {ok})")
  })

  test("merges api refs without duplicates and enriches schemas", () => {
    const { next, added, updated } = mergeApiRefs(
      [{ id: "1", method: "GET", path: "/a", name: "old" }],
      [
        {
          method: "GET",
          path: "/a",
          name: "dup",
          requestSummary: "query: id",
          responseSummary: "200 {ok}",
        },
        { method: "POST", path: "/b", name: "new" },
      ],
      () => "new-id",
    )
    expect(added).toBe(1)
    expect(updated).toBe(1)
    expect(next).toHaveLength(2)
    expect(next[0]?.requestSummary).toBe("query: id")
    expect(next[0]?.name).toBe("dup")
    expect(next[1]?.path).toBe("/b")
  })

  test("detects empty integration and ready state", () => {
    expect(isIntegrationEmpty(EMPTY_INTEGRATION)).toBe(true)
    expect(isIntegrationEmpty({ ...EMPTY_INTEGRATION, apifoxProjectId: "1" })).toBe(false)
    expect(isApifoxReady({ ...EMPTY_INTEGRATION, apifoxProjectId: "1" })).toBe(false)
    expect(isApifoxReady({ ...EMPTY_INTEGRATION, apifoxProjectId: "1", apifoxAccessToken: "t" })).toBe(true)
  })

  test("inherits system defaults without apis", () => {
    const peers = [
      {
        id: "old",
        systemDirectory: "/sys-a",
        updatedAt: 1,
        integration: {
          ...EMPTY_INTEGRATION,
          envName: "test",
          apifoxProjectId: "99",
          apifoxAccessToken: "old-token",
          apis: [{ id: "a1", method: "GET", path: "/old", name: "" }],
        },
      },
      {
        id: "new",
        systemDirectory: "/sys-a",
        updatedAt: 2,
        integration: {
          ...EMPTY_INTEGRATION,
          envName: "staging",
          baseUrl: "https://api.example.com",
          apifoxProjectId: "42",
          apifoxAccessToken: "shared-token",
          notes: "Bearer via gateway",
          apis: [{ id: "a2", method: "POST", path: "/newer", name: "x" }],
        },
      },
      {
        id: "other",
        systemDirectory: "/sys-b",
        updatedAt: 9,
        integration: { ...EMPTY_INTEGRATION, apifoxProjectId: "1" },
      },
    ] as RequirementProject[]

    expect(inheritSystemIntegration(peers, "/sys-a")).toEqual({
      envName: "staging",
      baseUrl: "https://api.example.com",
      apifoxUrl: "",
      apifoxProjectId: "42",
      apifoxAccessToken: "shared-token",
      tapdUrl: "",
      tapdWorkspaceId: "",
      tapdStoryUrl: "",
      tapdAccessToken: "",
      notes: "Bearer via gateway",
      apis: [],
    })
    expect(inheritSystemIntegration(peers, "/sys-a", "new")?.apifoxProjectId).toBe("99")
    expect(inheritSystemIntegration(peers, "/missing")).toBeUndefined()
    expect(isSharedIntegrationEmpty({ ...EMPTY_INTEGRATION, apis: [{ id: "1", method: "GET", path: "/x", name: "" }] })).toBe(
      true,
    )
  })
})
