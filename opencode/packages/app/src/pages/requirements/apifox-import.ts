import type { RequirementApiRef } from "./types"

export const APIFOX_API_BASE = "https://api.apifox.com"
export const APIFOX_API_VERSION = "2024-03-28"

export type ApifoxOpenApiOperation = Omit<RequirementApiRef, "id">

export type ApifoxModule = {
  id: number
  name: string
}

export type FetchApifoxOpenApiInput = {
  projectId: string
  accessToken: string
  /** Optional: only export these module IDs. When omitted, all modules are tried. */
  moduleIds?: number[]
  fetch?: typeof fetch
  signal?: AbortSignal
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"])

function apifoxHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "X-Apifox-Api-Version": APIFOX_API_VERSION,
    "Content-Type": "application/json",
  }
}

function unwrapData(doc: unknown): unknown {
  if (doc && typeof doc === "object" && "data" in doc) return (doc as { data: unknown }).data
  return doc
}

function apiKey(api: { method: string; path: string }) {
  return `${api.method.trim().toUpperCase()} ${api.path.trim()}`
}

function dedupeAndSort(apis: ApifoxOpenApiOperation[]): ApifoxOpenApiOperation[] {
  const seen = new Set<string>()
  const out: ApifoxOpenApiOperation[] = []
  for (const api of apis) {
    const key = apiKey(api)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(api)
  }
  out.sort((a, b) => {
    const byPath = a.path.localeCompare(b.path)
    if (byPath !== 0) return byPath
    return a.method.localeCompare(b.method)
  })
  return out
}

const SUMMARY_LIMIT = 420

function clipSummary(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (trimmed.length <= SUMMARY_LIMIT) return trimmed
  return `${trimmed.slice(0, SUMMARY_LIMIT - 1)}…`
}

function schemaPropertyNames(schema: unknown, depth = 0): string[] {
  if (!schema || typeof schema !== "object" || depth > 2) return []
  const record = schema as Record<string, unknown>
  if (record.$ref && typeof record.$ref === "string") {
    const name = record.$ref.split("/").pop()
    return name ? [`$ref:${name}`] : []
  }
  if (record.items) return schemaPropertyNames(record.items, depth + 1).map((name) => `${name}[]`)
  const props = record.properties
  if (!props || typeof props !== "object") {
    const type = typeof record.type === "string" ? record.type : ""
    return type ? [type] : []
  }
  return Object.keys(props as Record<string, unknown>).slice(0, 24)
}

function summarizeParameters(parameters: unknown): string | undefined {
  if (!Array.isArray(parameters) || parameters.length === 0) return
  const groups = new Map<string, string[]>()
  for (const item of parameters) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === "string" ? record.name.trim() : ""
    if (!name) continue
    const where = typeof record.in === "string" ? record.in : "param"
    const bucket = groups.get(where) ?? []
    bucket.push(name)
    groups.set(where, bucket)
  }
  if (groups.size === 0) return
  return [...groups.entries()]
    .map(([where, names]) => `${where}: ${names.slice(0, 16).join(", ")}`)
    .join("; ")
}

function summarizeRequestBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return
  const content = (body as { content?: unknown }).content
  if (!content || typeof content !== "object") return
  const entries = Object.entries(content as Record<string, unknown>)
  if (entries.length === 0) return
  const [mime, media] = entries[0]!
  const schema =
    media && typeof media === "object" ? (media as { schema?: unknown }).schema : undefined
  const fields = schemaPropertyNames(schema)
  if (fields.length === 0) return mime
  return `${mime} {${fields.join(", ")}}`
}

function summarizeResponses(responses: unknown): string | undefined {
  if (!responses || typeof responses !== "object") return
  const parts: string[] = []
  for (const [status, response] of Object.entries(responses as Record<string, unknown>)) {
    if (!/^[123]\d\d$/.test(status) && status !== "default") continue
    if (!response || typeof response !== "object") {
      parts.push(status)
      continue
    }
    const content = (response as { content?: unknown }).content
    if (!content || typeof content !== "object") {
      parts.push(status)
      continue
    }
    const media = Object.values(content as Record<string, unknown>)[0]
    const schema =
      media && typeof media === "object" ? (media as { schema?: unknown }).schema : undefined
    const fields = schemaPropertyNames(schema)
    parts.push(fields.length > 0 ? `${status} {${fields.join(", ")}}` : status)
    if (parts.length >= 3) break
  }
  if (parts.length === 0) return
  return parts.join("; ")
}

export function summarizeOpenApiOperation(operation: Record<string, unknown>): {
  requestSummary?: string
  responseSummary?: string
} {
  const requestParts = [
    summarizeParameters(operation.parameters),
    summarizeRequestBody(operation.requestBody),
  ].filter(Boolean) as string[]
  const responseSummary = summarizeResponses(operation.responses)
  return {
    requestSummary: requestParts.length > 0 ? clipSummary(requestParts.join(" | ")) : undefined,
    responseSummary: responseSummary ? clipSummary(responseSummary) : undefined,
  }
}

/** Parse OpenAPI 3.x / Swagger paths into method+path+name (+ schema summary) rows. */
export function parseOpenApiOperations(doc: unknown): ApifoxOpenApiOperation[] {
  if (!doc || typeof doc !== "object") return []
  const paths = (doc as { paths?: unknown }).paths
  if (!paths || typeof paths !== "object") return []

  const out: ApifoxOpenApiOperation[] = []
  for (const [rawPath, pathItem] of Object.entries(paths as Record<string, unknown>)) {
    if (!pathItem || typeof pathItem !== "object") continue
    const sharedParams = (pathItem as { parameters?: unknown }).parameters
    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue
      if (!operation || typeof operation !== "object") continue
      const record = operation as Record<string, unknown>
      const summary = typeof record.summary === "string" ? record.summary.trim() : ""
      const operationId = typeof record.operationId === "string" ? record.operationId.trim() : ""
      const name = summary || operationId
      const mergedParams = [
        ...(Array.isArray(sharedParams) ? sharedParams : []),
        ...(Array.isArray(record.parameters) ? record.parameters : []),
      ]
      const schema = summarizeOpenApiOperation({
        ...record,
        parameters: mergedParams.length > 0 ? mergedParams : record.parameters,
      })
      out.push({
        method: method.toUpperCase(),
        path: rawPath,
        name,
        requestSummary: schema.requestSummary,
        responseSummary: schema.responseSummary,
      })
    }
  }

  return dedupeAndSort(out)
}

/** Parse Apifox http-apis list payloads into method+path+name rows. */
export function parseHttpApiOperations(doc: unknown): ApifoxOpenApiOperation[] {
  const data = unwrapData(doc)
  const list = Array.isArray(data) ? data : Array.isArray(doc) ? doc : null
  if (!list) return []

  const out: ApifoxOpenApiOperation[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const method = typeof record.method === "string" ? record.method.trim().toUpperCase() : ""
    const path = typeof record.path === "string" ? record.path.trim() : ""
    if (!method || !path) continue
    if (!HTTP_METHODS.has(method.toLowerCase())) continue
    const name = typeof record.name === "string" ? record.name.trim() : ""
    out.push({ method, path, name })
  }
  return dedupeAndSort(out)
}

/** Parse Apifox modules list payloads. */
export function parseApifoxModules(doc: unknown): ApifoxModule[] {
  const data = unwrapData(doc)
  const list = Array.isArray(data) ? data : Array.isArray(doc) ? doc : null
  if (!list) return []

  const out: ApifoxModule[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === "number" ? record.id : Number(record.id)
    if (!Number.isFinite(id)) continue
    const name = typeof record.name === "string" ? record.name.trim() : ""
    out.push({ id, name: name || String(id) })
  }
  return out
}

export function canImportApifoxApis(input: { projectId?: string; accessToken?: string }): boolean {
  return !!(input.projectId?.trim() && input.accessToken?.trim())
}

export class ApifoxImportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "ApifoxImportError"
  }
}

type RequestResult =
  | { ok: true; doc: unknown }
  | { ok: false; error: string; status?: number }

async function apifoxRequest(
  fetchFn: typeof fetch,
  input: {
    url: string
    token: string
    method?: string
    body?: unknown
    signal?: AbortSignal
  },
): Promise<RequestResult> {
  let response: Response
  try {
    response = await fetchFn(input.url, {
      method: input.method ?? "GET",
      signal: input.signal,
      headers: apifoxHeaders(input.token),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    })
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  if (!response.ok) {
    let detail = ""
    try {
      const body = (await response.json()) as { message?: string; error?: string; errorMessage?: string }
      detail = body.message || body.errorMessage || body.error || ""
    } catch {
      try {
        detail = (await response.text()).slice(0, 200)
      } catch {
        // ignore
      }
    }
    const message =
      response.status === 401 || response.status === 403
        ? `unauthorized (${response.status})${detail ? `: ${detail}` : ""}`
        : `HTTP ${response.status}${detail ? `: ${detail}` : ""}`
    return { ok: false, error: message, status: response.status }
  }

  try {
    return { ok: true, doc: await response.json() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "invalid_json",
      status: response.status,
    }
  }
}

/** Candidate paths: official Open API (`/v1`) and app API (`/api/v1`). */
function projectResourceUrls(projectId: string, resource: string): string[] {
  const id = encodeURIComponent(projectId)
  return [
    `${APIFOX_API_BASE}/v1/projects/${id}/${resource}`,
    `${APIFOX_API_BASE}/api/v1/projects/${id}/${resource}`,
  ]
}

async function fetchFirstOk(
  fetchFn: typeof fetch,
  urls: string[],
  input: { token: string; method?: string; body?: unknown; signal?: AbortSignal },
): Promise<RequestResult> {
  let last: RequestResult = { ok: false, error: "not_found" }
  for (const url of urls) {
    const result = await apifoxRequest(fetchFn, { ...input, url })
    if (result.ok) return result
    last = result
    // Auth failures are definitive — don't keep probing alternate paths.
    if (result.status === 401 || result.status === 403) return result
  }
  return last
}

export async function listApifoxModules(input: FetchApifoxOpenApiInput): Promise<{
  modules: ApifoxModule[]
  error?: string
}> {
  const projectId = input.projectId.trim()
  const token = input.accessToken.trim()
  if (!projectId || !token) return { modules: [], error: "missing_project_or_token" }

  const result = await fetchFirstOk(input.fetch ?? fetch, projectResourceUrls(projectId, "modules"), {
    token,
    signal: input.signal,
  })
  if (!result.ok) return { modules: [], error: result.error }
  return { modules: parseApifoxModules(result.doc) }
}

async function exportOpenApiDoc(
  input: FetchApifoxOpenApiInput,
  moduleId?: number,
): Promise<RequestResult> {
  const projectId = input.projectId.trim()
  const token = input.accessToken.trim()
  const body: Record<string, unknown> = {
    scope: { type: "ALL" },
    options: {
      includeApifoxExtensionProperties: false,
      addFoldersToTags: false,
    },
    oasVersion: "3.1",
    exportFormat: "JSON",
  }
  if (moduleId !== undefined) body.moduleId = moduleId

  return fetchFirstOk(input.fetch ?? fetch, projectResourceUrls(projectId, "export-openapi?locale=zh-CN"), {
    token,
    method: "POST",
    body,
    signal: input.signal,
  })
}

function withModulePrefix(apis: ApifoxOpenApiOperation[], moduleName?: string): ApifoxOpenApiOperation[] {
  const prefix = moduleName?.trim()
  if (!prefix) return apis
  return apis.map((api) => ({
    ...api,
    name: api.name ? `[${prefix}] ${api.name}` : `[${prefix}]`,
  }))
}

/**
 * Export OpenAPI endpoints from Apifox.
 *
 * Multi-module projects only include the default module when `moduleId` is omitted.
 * Prefer OpenAPI exports (include request/response summaries) over the flat http-apis index.
 */
export async function fetchApifoxApiOperations(
  input: FetchApifoxOpenApiInput,
): Promise<{ apis: ApifoxOpenApiOperation[]; error?: string }> {
  const projectId = input.projectId.trim()
  const token = input.accessToken.trim()
  if (!projectId || !token) {
    return { apis: [], error: "missing_project_or_token" }
  }

  // 1) Per-module OpenAPI export (schemas)
  const moduleIds = input.moduleIds?.filter((id) => Number.isFinite(id))
  let modules: ApifoxModule[] = []
  if (moduleIds && moduleIds.length > 0) {
    modules = moduleIds.map((id) => ({ id, name: String(id) }))
  } else {
    const listed = await listApifoxModules(input)
    if (listed.error && (listed.error.startsWith("unauthorized") || listed.error === "missing_project_or_token")) {
      return { apis: [], error: listed.error }
    }
    modules = listed.modules
  }

  if (modules.length > 0) {
    const merged: ApifoxOpenApiOperation[] = []
    let lastError: string | undefined
    const results = await Promise.all(
      modules.map(async (mod) => {
        const exported = await exportOpenApiDoc(input, mod.id)
        if (!exported.ok) return { apis: [] as ApifoxOpenApiOperation[], error: exported.error }
        const unwrapped = unwrapData(exported.doc)
        const apis = withModulePrefix(parseOpenApiOperations(unwrapped), mod.name)
        return { apis, error: undefined as string | undefined }
      }),
    )
    for (const result of results) {
      if (result.error) lastError = result.error
      merged.push(...result.apis)
    }
    const apis = dedupeAndSort(merged)
    if (apis.length > 0) return { apis }
    if (lastError?.startsWith("unauthorized")) return { apis: [], error: lastError }
  }

  // 2) Default-module OpenAPI export
  const fallback = await exportOpenApiDoc(input)
  if (fallback.ok) {
    const unwrapped = unwrapData(fallback.doc)
    const apis = parseOpenApiOperations(unwrapped)
    if (apis.length > 0) return { apis }
  } else if (fallback.status === 401 || fallback.status === 403) {
    return { apis: [], error: fallback.error }
  }

  // 3) Flat http-apis index (path/name only — last resort)
  const httpApis = await fetchFirstOk(input.fetch ?? fetch, projectResourceUrls(projectId, "http-apis"), {
    token,
    signal: input.signal,
  })
  if (httpApis.ok) {
    const apis = parseHttpApiOperations(httpApis.doc)
    if (apis.length > 0) return { apis }
  } else if (httpApis.status === 401 || httpApis.status === 403) {
    return { apis: [], error: httpApis.error }
  }

  if (!fallback.ok) return { apis: [], error: fallback.error }
  return { apis: [], error: "empty_openapi" }
}
