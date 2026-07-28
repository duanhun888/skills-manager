import { describe, expect, test } from "bun:test"
import {
  canImportApifoxApis,
  fetchApifoxApiOperations,
  parseApifoxModules,
  parseHttpApiOperations,
  parseOpenApiOperations,
} from "./apifox-import"

describe("apifox import", () => {
  test("parses openapi paths into operations with schema summaries", () => {
    const apis = parseOpenApiOperations({
      openapi: "3.1.0",
      paths: {
        "/users": {
          get: {
            summary: "List users",
            operationId: "listUsers",
            parameters: [
              { name: "page", in: "query" },
              { name: "size", in: "query" },
            ],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { list: { type: "array" }, total: { type: "integer" } },
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createUser",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { name: { type: "string" }, email: { type: "string" } },
                  },
                },
              },
            },
            responses: { "201": { description: "created" } },
          },
        },
        "/users/{id}": {
          parameters: [{ name: "id", in: "path" }],
          get: { summary: "Get user" },
        },
      },
    })
    expect(apis).toEqual([
      {
        method: "GET",
        path: "/users",
        name: "List users",
        requestSummary: "query: page, size",
        responseSummary: "200 {list, total}",
      },
      {
        method: "POST",
        path: "/users",
        name: "createUser",
        requestSummary: "application/json {name, email}",
        responseSummary: "201",
      },
      {
        method: "GET",
        path: "/users/{id}",
        name: "Get user",
        requestSummary: "path: id",
        responseSummary: undefined,
      },
    ])
  })

  test("parses http-apis list payloads", () => {
    const apis = parseHttpApiOperations({
      data: [
        { id: 1, method: "post", path: "/middle/pallet/list", name: "货盘列表" },
        { id: 2, method: "GET", path: "/health", name: "" },
        { id: 3, method: "TRACE", path: "", name: "bad" },
      ],
    })
    expect(apis).toEqual([
      { method: "GET", path: "/health", name: "" },
      { method: "POST", path: "/middle/pallet/list", name: "货盘列表" },
    ])
  })

  test("parses modules list", () => {
    expect(
      parseApifoxModules({
        data: [
          { id: 11, name: "商品服务 - vtproduct" },
          { id: "22", name: "财务服务" },
          { id: "x", name: "bad" },
        ],
      }),
    ).toEqual([
      { id: 11, name: "商品服务 - vtproduct" },
      { id: 22, name: "财务服务" },
    ])
  })

  test("canImport requires project and token", () => {
    expect(canImportApifoxApis({ projectId: "1", accessToken: "t" })).toBe(true)
    expect(canImportApifoxApis({ projectId: "1", accessToken: "" })).toBe(false)
  })

  test("fetchApifoxApiOperations prefers OpenAPI modules for schemas", async () => {
    const exportBodies: unknown[] = []
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.includes("/http-apis")) {
        return new Response(
          JSON.stringify({ data: [{ id: 1, method: "POST", path: "/a", name: "A" }] }),
          { status: 200 },
        )
      }
      if (url.includes("/modules")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 1, name: "商品服务" },
              { id: 2, name: "财务服务" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.includes("export-openapi")) {
        exportBodies.push(init?.body ? JSON.parse(String(init.body)) : null)
        const moduleId = (exportBodies.at(-1) as { moduleId?: number }).moduleId
        const path = moduleId === 1 ? "/product/list" : "/finance/balance"
        const summary = moduleId === 1 ? "商品列表" : "余额查询"
        return new Response(
          JSON.stringify({
            openapi: "3.1.0",
            paths: {
              [path]: {
                get: {
                  summary,
                  parameters: [{ name: "id", in: "query" }],
                  responses: {
                    "200": {
                      content: {
                        "application/json": {
                          schema: { type: "object", properties: { ok: { type: "boolean" } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response("nope", { status: 404 })
    }

    const result = await fetchApifoxApiOperations({
      projectId: "7148243",
      accessToken: "tok",
      fetch: fetchFn,
    })

    expect(exportBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ moduleId: 1 }),
        expect.objectContaining({ moduleId: 2 }),
      ]),
    )
    expect(result.error).toBeUndefined()
    expect(result.apis).toEqual([
      {
        method: "GET",
        path: "/finance/balance",
        name: "[财务服务] 余额查询",
        requestSummary: "query: id",
        responseSummary: "200 {ok}",
      },
      {
        method: "GET",
        path: "/product/list",
        name: "[商品服务] 商品列表",
        requestSummary: "query: id",
        responseSummary: "200 {ok}",
      },
    ])
  })

  test("fetchApifoxApiOperations falls back to default export then http-apis", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      if (String(input).includes("/modules") || String(input).includes("/http-apis")) {
        return new Response(JSON.stringify({ message: "missing" }), { status: 404 })
      }
      return new Response(
        JSON.stringify({
          openapi: "3.1.0",
          paths: {
            "/middle/pallet/config/list": {
              post: { summary: "获取货盘配置列表" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    const result = await fetchApifoxApiOperations({
      projectId: "8271745",
      accessToken: "tok",
      fetch: fetchFn,
    })

    expect(calls.some((call) => call.url.includes("/v1/projects/8271745/export-openapi"))).toBe(true)
    expect(calls.find((call) => call.url.includes("export-openapi"))?.init?.method).toBe("POST")
    const headers = calls.find((call) => call.url.includes("export-openapi"))?.init?.headers as Record<
      string,
      string
    >
    expect(headers.Authorization).toBe("Bearer tok")
    expect(headers["X-Apifox-Api-Version"]).toBe("2024-03-28")
    expect(result.error).toBeUndefined()
    expect(result.apis).toEqual([
      { method: "POST", path: "/middle/pallet/config/list", name: "获取货盘配置列表" },
    ])
  })

  test("fetchApifoxApiOperations surfaces unauthorized", async () => {
    const result = await fetchApifoxApiOperations({
      projectId: "1",
      accessToken: "bad",
      fetch: async () => new Response(JSON.stringify({ message: "nope" }), { status: 401 }),
    })
    expect(result.apis).toEqual([])
    expect(result.error).toContain("unauthorized")
  })

  test("fetchApifoxApiOperations returns empty_openapi when nothing found", async () => {
    const fetchFn: typeof fetch = async (input) => {
      if (String(input).includes("/http-apis") || String(input).includes("/modules")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      }
      return new Response(JSON.stringify({ openapi: "3.1.0", paths: {} }), { status: 200 })
    }
    const result = await fetchApifoxApiOperations({
      projectId: "1",
      accessToken: "tok",
      fetch: fetchFn,
    })
    expect(result.apis).toEqual([])
    expect(result.error).toBe("empty_openapi")
  })
})
