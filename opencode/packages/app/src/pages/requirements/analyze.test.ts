import {
  buildSectionsFromHandoffMessages,
  formatConnectorContext,
  isRequirementSections,
  mergeRequirementSections,
  parseRequirementSectionsFromText,
  shouldAttachAnalysisAssets,
  summarizeAnalysis,
  toFileParts,
} from "./analyze"
import { EMPTY_SECTIONS } from "./document-template"
import { EMPTY_INTEGRATION } from "./types"

describe("requirement analysis helpers", () => {
  test("detects structured sections", () => {
    expect(
      isRequirementSections({
        goal: "a",
        pages: "b",
        interactions: "c",
        copy: "d",
        constraints: "e",
        acceptance: "f",
        notes: "g",
      }),
    ).toBe(true)
    expect(isRequirementSections({ goal: "a" })).toBe(false)
  })

  test("merges sections with replace mode", () => {
    const merged = mergeRequirementSections(
      { ...EMPTY_SECTIONS, goal: "old", pages: "keep-if-empty" },
      { ...EMPTY_SECTIONS, goal: "new", pages: "" },
      "replace",
    )
    expect(merged.goal).toBe("new")
    expect(merged.pages).toBe("keep-if-empty")
  })

  test("summarizes analysis", () => {
    const text = summarizeAnalysis({ ...EMPTY_SECTIONS, goal: "Login with SSO" }, "Check mobile")
    expect(text).toContain("Login with SSO")
    expect(text).toContain("Check mobile")
    expect(text).toContain("勾选")
  })

  test("builds Spec only from checked messages", () => {
    const empty = buildSectionsFromHandoffMessages([])
    expect(empty).toEqual(EMPTY_SECTIONS)

    const filled = buildSectionsFromHandoffMessages([
      {
        id: "1",
        role: "assistant",
        content: "summary",
        at: 1,
        sections: { ...EMPTY_SECTIONS, goal: "SSO", acceptance: "Redirect home" },
      },
    ])
    expect(filled.goal).toBe("SSO")
    expect(filled.acceptance).toBe("Redirect home")
  })

  test("parses analysis summary bullets into Spec sections", () => {
    const text = [
      "已根据素材生成结构化需求（勾选右侧方框后写入 Spec）：",
      "- 目标：分析 ERP 库存数据",
      "- 页面：库存数据表 Sheet",
      "- 交互：静态数据导出，无交互",
      "- 文案：日期、SKU、仓库名称",
      "- 约束：数据区域为 MX",
      "- 验收：识别全部字段",
    ].join("\n")
    const parsed = parseRequirementSectionsFromText(text)
    expect(parsed?.goal).toContain("分析 ERP")
    expect(parsed?.pages).toContain("库存数据表")
    expect(parsed?.interactions).toContain("静态数据")
    expect(parsed?.copy).toContain("SKU")
    expect(parsed?.constraints).toContain("MX")
    expect(parsed?.acceptance).toContain("识别全部字段")

    const built = buildSectionsFromHandoffMessages([
      { id: "1", role: "assistant", content: text, at: 1 },
    ])
    expect(built.pages).toContain("库存数据表")
    expect(built.goal).toContain("分析 ERP")
  })

  test("parses sections from fenced JSON text", () => {
    const text = `\`\`\`json
{
  "goal": "跨境ERP",
  "pages": "首页",
  "interactions": "登录",
  "copy": "跨境AI专家",
  "constraints": "多仓",
  "acceptance": "可登录",
  "notes": "ok"
}
\`\`\``
    const parsed = parseRequirementSectionsFromText(text)
    expect(parsed?.goal).toBe("跨境ERP")
    expect(parsed?.notes).toBe("ok")
  })

  test("formats connector context without secrets", () => {
    expect(formatConnectorContext(EMPTY_INTEGRATION)).toBeUndefined()
    const text = formatConnectorContext({
      ...EMPTY_INTEGRATION,
      apifoxProjectId: "1",
      apifoxFolderId: "20406855",
      apifoxAccessToken: "apifox-should-not-leak",
      tapdWorkspaceId: "64516772",
      tapdAccessToken: "should-not-leak",
      apis: [{ id: "a1", method: "GET", path: "/goods", name: "列表" }],
    })
    expect(text).toContain("Apifox: connected")
    expect(text).toContain("Project ID: 1")
    expect(text).toContain("Directory ID: 20406855")
    expect(text).toContain("TAPD: connected")
    expect(text).toContain("64516772")
    expect(text).toContain("Required APIs in this workbench: 1 total")
    expect(text).toContain("GET /goods")
    expect(text).toContain("download immediately")
    expect(text).toContain("saved in the workbench form")
    expect(text).not.toContain("should-not-leak")
    expect(text).not.toContain("apifox-should-not-leak")
  })

  test("formats connector context with sampled APIs for large imports", () => {
    const apis = Array.from({ length: 25 }, (_, index) => ({
      id: `a${index}`,
      method: "GET",
      path: `/api/${index}`,
      name: `API ${index}`,
      requestSummary: index < 2 ? `query: id${index}` : undefined,
      responseSummary: index < 2 ? `200 {ok${index}}` : undefined,
    }))
    const text = formatConnectorContext({
      ...EMPTY_INTEGRATION,
      apifoxProjectId: "1",
      apis,
    })
    expect(text).toContain("Required APIs in this workbench: 25 total")
    expect(text).toContain("OpenAPI schema summaries imported for 2/25 APIs")
    expect(text).toContain("/api/0")
    expect(text).toContain("req: query: id0")
    expect(text).toContain("/api/19")
    expect(text).not.toContain("/api/20")
    expect(text).toContain("… and 5 more omitted from this prompt")
  })

  test("shouldAttachAnalysisAssets skips casual follow-ups", () => {
    expect(shouldAttachAnalysisAssets("", 0)).toBe(true)
    expect(shouldAttachAnalysisAssets("分析这些截图", 0)).toBe(true)
    expect(shouldAttachAnalysisAssets("随便问问", 1)).toBe(true)
    expect(shouldAttachAnalysisAssets("检查一下现在 apifox 导入多少个接口了", 0)).toBe(false)
  })

  test("toFileParts only includes vision-capable files", () => {
    // PNG magic bytes as base64
    const png =
      "data:application/octet-stream;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const xlsx = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDBBQAAAAI"
    const parts = toFileParts([
      {
        id: "1",
        filename: "tapd_base64_1",
        mime: "application/octet-stream",
        dataUrl: png,
        note: "",
        createdAt: 0,
      },
      {
        id: "2",
        filename: "库存.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dataUrl: xlsx,
        note: "",
        createdAt: 0,
      },
    ])
    expect(parts).toHaveLength(1)
    expect(parts[0]?.mime.startsWith("image/")).toBe(true)
    expect(parts[0]?.filename).toBe("tapd_base64_1")
  })

  test("toFileParts expands bare image mime for openai-compatible providers", () => {
    const png =
      "data:image;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const parts = toFileParts([
      {
        id: "1",
        filename: "shot.png",
        mime: "image",
        dataUrl: png,
        note: "",
        createdAt: 0,
      },
    ])
    expect(parts).toHaveLength(1)
    expect(parts[0]?.mime).toBe("image/png")
    expect(parts[0]?.url.startsWith("data:image/png")).toBe(true)
  })
})
