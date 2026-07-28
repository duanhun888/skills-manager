export type TapdFetch = typeof fetch

export type TapdImportedAsset = {
  filename: string
  mime: string
  dataUrl: string
  note: string
  /** Dedup key: attachment id or image path */
  sourceKey: string
}

/** @deprecated use TapdImportedAsset */
export type TapdImportedImage = TapdImportedAsset

export type TapdImportOptions = {
  workspaceId: string
  storyId: string
  accessToken: string
  fetch?: TapdFetch
  apiBase?: string
  /** Max attachment bytes (default 8MB) — keeps local persist sane */
  maxBytes?: number
}

const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp)$/i
const EXPIRE_BODY = /token\s*expire/i
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024
const SKIP_ATTACHMENT = /\.(mp4|mov|avi|mkv|webm|zip|rar|7z|exe|dmg)$/i

export type AssetPreviewKind = "image" | "pdf" | "spreadsheet" | "doc" | "file"

export function assetPreviewKind(asset: { mime?: string; filename?: string }): AssetPreviewKind {
  const mime = (asset.mime ?? "").toLowerCase()
  const name = asset.filename ?? ""
  if (mime.startsWith("image/") || IMAGE_EXT.test(name)) return "image"
  if (mime.includes("pdf") || /\.pdf$/i.test(name)) return "pdf"
  if (mime.includes("sheet") || mime.includes("excel") || /\.(xlsx|xls|csv)$/i.test(name)) return "spreadsheet"
  if (mime.includes("word") || mime.includes("document") || /\.(docx|doc|txt|md)$/i.test(name)) return "doc"
  return "file"
}

export function isImageAsset(asset: { mime?: string; filename?: string }): boolean {
  return assetPreviewKind(asset) === "image"
}

export function assetExtBadge(filename: string): string {
  const ext = filename.split(".").pop()?.trim().toUpperCase()
  if (!ext || ext.length > 5) return "FILE"
  return ext
}

/** Extract TAPD story / bug / task id from URL or raw digits. */
export function extractTapdStoryId(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return
  if (/^\d+$/.test(trimmed)) return trimmed
  const match =
    trimmed.match(/\/(?:stories|bugs|tasks)\/view\/(\d+)/i) ??
    trimmed.match(/[?&](?:story_id|bug_id|task_id|id)=(\d+)/i) ??
    trimmed.match(/\/(\d{10,})\b/)
  return match?.[1]
}

/**
 * TAPD story long id = `11` + workspaceId + shortId padded to 9 digits.
 * Example: workspace 64516772 + short 1031026 → 1164516772001031026
 */
export function toTapdStoryLongId(workspaceId: string, storyId: string): string {
  const workspace = workspaceId.trim()
  const id = storyId.trim()
  if (!workspace || !id) return id
  if (id.length >= 14) return id
  return `11${workspace}${id.padStart(9, "0")}`
}

/** Resolve story field (URL or short/long id) to API long id. */
export function resolveTapdStoryId(workspaceId: string, storyUrlOrId: string): string | undefined {
  const extracted = extractTapdStoryId(storyUrlOrId)
  if (!extracted) return
  return toTapdStoryLongId(workspaceId, extracted)
}

/** Pull /tfl/... or img src paths from TAPD rich-text description. */
export function extractImagePathsFromDescription(html: string): string[] {
  const found = new Set<string>()
  // src / data-src / data-mce-src (TinyMCE / TAPD editors)
  const imgAttr = /<img\b[^>]*(?:src|data-src|data-mce-src)=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = imgAttr.exec(html))) {
    const src = match[1]?.trim()
    if (src && !src.startsWith("data:")) found.add(normalizeImagePath(src))
  }
  const tfl = /(?:https?:\/\/[^/\s"']+)?(\/tfl\/[^\s"'<>]+)/gi
  while ((match = tfl.exec(html))) {
    const path = match[1]?.trim()
    if (path) found.add(normalizeImagePath(path))
  }
  return [...found].filter((path) => IMAGE_EXT.test(path.split("?")[0] ?? path) || path.includes("/tfl/"))
}

function normalizeImagePath(src: string): string {
  try {
    if (src.startsWith("http://") || src.startsWith("https://")) {
      const url = new URL(src)
      return url.pathname + url.search
    }
  } catch {
    // keep as-is
  }
  return src
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!res.ok) throw new Error(`TAPD HTTP ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`TAPD invalid JSON: ${text.slice(0, 200)}`)
  }
}

function wrapFetchError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error(
      "无法访问 TAPD API（网络或 CORS）。请使用 OpenCode 桌面端并重启后再试；本需求单建议填完整链接。",
    )
  }
  return err instanceof Error ? err : new Error(message)
}

function mimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".bmp")) return "image/bmp"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel"
  if (lower.endsWith(".csv")) return "text/csv"
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (lower.endsWith(".doc")) return "application/msword"
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain"
  if (lower.endsWith(".json")) return "application/json"
  return "application/octet-stream"
}

export { mimeFromFilename as assetMimeFromFilename }

/** Detect real mime from magic bytes — TAPD downloads often lie with octet-stream. */
export function sniffMimeFromBytes(bytes: Uint8Array, filename = ""): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp"
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf"
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const fromName = mimeFromFilename(filename)
    if (fromName !== "application/octet-stream") return fromName
    return "application/zip"
  }
  const fromName = mimeFromFilename(filename)
  if (fromName !== "application/octet-stream") return fromName
  return "application/octet-stream"
}

function isGenericMime(mime: string): boolean {
  const value = mime.trim().toLowerCase()
  return (
    !value ||
    value === "application/octet-stream" ||
    value === "binary/octet-stream" ||
    value === "text/plain" ||
    value === "application/force-download" ||
    value.startsWith("text/html") ||
    // Incomplete top-level types (e.g. TAPD "image") break AI SDK image_url conversion.
    value === "image" ||
    value === "audio" ||
    value === "video" ||
    value === "application"
  )
}

/** Fix data URLs that were saved with wrong Content-Type (broken thumbnails). */
export function normalizeAssetDataUrl(asset: {
  mime: string
  dataUrl: string
  filename: string
}): { mime: string; dataUrl: string; kind: AssetPreviewKind } {
  const match = asset.dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) {
    return { mime: asset.mime, dataUrl: asset.dataUrl, kind: assetPreviewKind(asset) }
  }
  const declared = (match[1] || asset.mime || "").trim()
  const isBase64 = !!match[2]
  const payload = match[3] ?? ""
  let sniffed = declared
  if (isBase64 && payload) {
    try {
      const binary = atob(payload.slice(0, 96))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      sniffed = sniffMimeFromBytes(bytes, asset.filename)
    } catch {
      sniffed = mimeFromFilename(asset.filename) || declared
    }
  } else if (isGenericMime(declared)) {
    sniffed = mimeFromFilename(asset.filename) || declared
  }
  const mime = isGenericMime(declared) || (IMAGE_EXT.test(asset.filename) && !declared.startsWith("image/"))
    ? sniffed
    : declared
  const dataUrl = mime === declared ? asset.dataUrl : `data:${mime}${isBase64 ? ";base64" : ""},${payload}`
  return { mime, dataUrl, kind: assetPreviewKind({ mime, filename: asset.filename }) }
}

function filenameFromPath(path: string): string {
  const clean = path.split("?")[0] ?? path
  const base = clean.split("/").pop()
  return base && base.trim() ? base.trim() : "tapd-image.png"
}

async function blobToDataUrl(blob: Blob, mimeOverride?: string): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const base64 = btoa(binary)
  const mime = mimeOverride || blob.type || "application/octet-stream"
  return `data:${mime};base64,${base64}`
}

async function downloadUrlToDataUrl(
  downloadUrl: string,
  fetchImpl: TapdFetch,
  mimeHint?: string,
  maxBytes = DEFAULT_MAX_BYTES,
  filename = "",
): Promise<{ dataUrl: string; mime: string; expired: boolean; tooLarge?: boolean; size?: number }> {
  const res = await fetchImpl(downloadUrl)
  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes.length <= 64) {
    const text = new TextDecoder().decode(bytes)
    if (EXPIRE_BODY.test(text)) {
      return { dataUrl: "", mime: "", expired: true }
    }
  }
  if (!res.ok) throw new Error(`TAPD download failed: HTTP ${res.status}`)
  if (bytes.length > maxBytes) {
    return { dataUrl: "", mime: "", expired: false, tooLarge: true, size: bytes.length }
  }
  const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim() || ""
  const sniffed = sniffMimeFromBytes(bytes, filename)
  const mime =
    sniffed !== "application/octet-stream"
      ? sniffed
      : !isGenericMime(headerMime)
        ? headerMime
        : mimeHint && !isGenericMime(mimeHint)
          ? mimeHint
          : sniffed
  const blob = new Blob([bytes], { type: mime })
  const dataUrl = await blobToDataUrl(blob, mime)
  return { dataUrl, mime, expired: false, size: bytes.length }
}

type AssetRef =
  | { kind: "path"; path: string; filename: string }
  | { kind: "attachment"; id: string; filename: string; mime?: string }

async function resolveDownloadUrl(input: {
  workspaceId: string
  accessToken: string
  apiBase: string
  fetch: TapdFetch
  ref: AssetRef
}): Promise<string> {
  const { workspaceId, accessToken, apiBase, fetch: fetchImpl, ref } = input
  if (ref.kind === "path") {
    const url = new URL(`${apiBase}/files/get_image`)
    url.searchParams.set("workspace_id", workspaceId)
    url.searchParams.set("image_path", ref.path)
    const json = await readJson(await fetchImpl(url.toString(), { headers: authHeaders(accessToken) }))
    const download = pickDownloadUrl(json)
    if (!download) throw new Error(`TAPD get_image missing download_url for ${ref.path}`)
    return download
  }

  const url = new URL(`${apiBase}/attachments/down`)
  url.searchParams.set("workspace_id", workspaceId)
  url.searchParams.set("id", ref.id)
  const json = await readJson(await fetchImpl(url.toString(), { headers: authHeaders(accessToken) }))
  const download = pickDownloadUrl(json)
  if (!download) throw new Error(`TAPD attachments/down missing download_url for ${ref.id}`)
  return download
}

function pickDownloadUrl(json: unknown): string | undefined {
  if (!isRecord(json)) return
  const data = json.data
  if (isRecord(data)) {
    const attachment = data.Attachment
    if (isRecord(attachment) && typeof attachment.download_url === "string") {
      return attachment.download_url
    }
    if (typeof data.download_url === "string") return data.download_url
  }
  if (Array.isArray(data) && data[0] && isRecord(data[0])) {
    const attachment = data[0].Attachment
    if (isRecord(attachment) && typeof attachment.download_url === "string") {
      return attachment.download_url
    }
  }
}

/** Get download_url then immediately download; on token expire retry once. */
export async function downloadTapdImage(input: {
  workspaceId: string
  accessToken: string
  storyId: string
  ref: AssetRef
  fetch?: TapdFetch
  apiBase?: string
  maxBytes?: number
}): Promise<TapdImportedAsset> {
  const fetchImpl = input.fetch ?? fetch
  const apiBase = (input.apiBase ?? "https://api.tapd.cn").replace(/\/$/, "")
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
  const mimeHint = input.ref.kind === "attachment" ? input.ref.mime : mimeFromFilename(input.ref.filename)

  const attempt = async () => {
    const downloadUrl = await resolveDownloadUrl({
      workspaceId: input.workspaceId,
      accessToken: input.accessToken,
      apiBase,
      fetch: fetchImpl,
      ref: input.ref,
    })
    return downloadUrlToDataUrl(downloadUrl, fetchImpl, mimeHint, maxBytes, input.ref.filename)
  }

  let result = await attempt()
  if (result.expired) result = await attempt()
  if (result.tooLarge) {
    const mb = ((result.size ?? 0) / (1024 * 1024)).toFixed(1)
    throw new Error(`${input.ref.filename}: 超过 ${Math.round(maxBytes / (1024 * 1024))}MB 限制（${mb}MB），已跳过`)
  }
  if (result.expired || !result.dataUrl) throw new Error(`TAPD download expired for ${input.ref.filename}`)

  return {
    filename: input.ref.filename,
    mime: result.mime || mimeHint || "application/octet-stream",
    dataUrl: result.dataUrl,
    note: `TAPD story ${input.storyId}`,
    sourceKey: input.ref.kind === "path" ? `path:${input.ref.path}` : `att:${input.ref.id}`,
  }
}

async function listDescriptionPaths(input: TapdImportOptions & { apiBase: string; fetch: TapdFetch }): Promise<AssetRef[]> {
  const url = new URL(`${input.apiBase}/stories`)
  url.searchParams.set("workspace_id", input.workspaceId)
  url.searchParams.set("id", input.storyId)
  const json = await readJson(await input.fetch(url.toString(), { headers: authHeaders(input.accessToken) }))
  const descriptions: string[] = []
  const data = isRecord(json) ? json.data : undefined
  const rows = Array.isArray(data) ? data : data ? [data] : []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const story = isRecord(row.Story) ? row.Story : row
    if (typeof story.description === "string") descriptions.push(story.description)
  }
  const refs: AssetRef[] = []
  for (const html of descriptions) {
    for (const path of extractImagePathsFromDescription(html)) {
      refs.push({ kind: "path", path, filename: filenameFromPath(path) })
    }
  }
  return refs
}

/** Story attachments: images + office docs (skip archives / video). */
async function listStoryAttachments(input: TapdImportOptions & { apiBase: string; fetch: TapdFetch }): Promise<AssetRef[]> {
  const url = new URL(`${input.apiBase}/attachments`)
  url.searchParams.set("workspace_id", input.workspaceId)
  url.searchParams.set("entry_id", input.storyId)
  url.searchParams.set("limit", "200")
  const json = await readJson(await input.fetch(url.toString(), { headers: authHeaders(input.accessToken) }))
  const data = isRecord(json) ? json.data : undefined
  const rows = Array.isArray(data) ? data : []
  const refs: AssetRef[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const att = isRecord(row.Attachment) ? row.Attachment : row
    const id = typeof att.id === "string" || typeof att.id === "number" ? String(att.id) : ""
    const filename = typeof att.filename === "string" ? att.filename : ""
    const contentType = typeof att.content_type === "string" ? att.content_type : ""
    if (!id || !filename) continue
    if (SKIP_ATTACHMENT.test(filename)) continue
    if (contentType.startsWith("video/") || contentType.startsWith("audio/")) continue
    refs.push({
      kind: "attachment",
      id,
      filename,
      mime: contentType || mimeFromFilename(filename),
    })
  }
  return refs
}

/** Import description images + story attachments (xlsx/pdf/docs/…) into local data URLs. */
export async function importTapdStoryImages(options: TapdImportOptions): Promise<{
  images: TapdImportedAsset[]
  errors: string[]
}> {
  return importTapdStoryAssets(options)
}

export async function importTapdStoryAssets(options: TapdImportOptions): Promise<{
  images: TapdImportedAsset[]
  errors: string[]
}> {
  const workspaceId = options.workspaceId.trim()
  const accessToken = options.accessToken.trim()
  if (!workspaceId) throw new Error("Missing TAPD workspace id")
  if (!accessToken) throw new Error("Missing TAPD access token")

  const storyId =
    resolveTapdStoryId(workspaceId, options.storyId) || toTapdStoryLongId(workspaceId, options.storyId.trim())
  if (!storyId) throw new Error("Missing TAPD story id")

  const fetchImpl: TapdFetch = async (input, init) => {
    try {
      return await (options.fetch ?? fetch)(input, init)
    } catch (err) {
      throw wrapFetchError(err)
    }
  }
  const apiBase = (options.apiBase ?? "https://api.tapd.cn").replace(/\/$/, "")
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const ctx = { ...options, workspaceId, storyId, accessToken, fetch: fetchImpl, apiBase }

  const refs: AssetRef[] = []
  const seen = new Set<string>()
  const errors: string[] = []

  try {
    for (const ref of await listDescriptionPaths(ctx)) {
      const key = `path:${ref.path}`
      if (seen.has(key)) continue
      seen.add(key)
      refs.push(ref)
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  try {
    for (const ref of await listStoryAttachments(ctx)) {
      const key = `att:${ref.id}`
      if (seen.has(key)) continue
      seen.add(key)
      refs.push(ref)
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  const images: TapdImportedAsset[] = []
  for (const ref of refs) {
    try {
      images.push(
        await downloadTapdImage({
          workspaceId,
          accessToken,
          storyId,
          ref,
          fetch: fetchImpl,
          apiBase,
          maxBytes,
        }),
      )
    } catch (err) {
      errors.push(`${ref.filename}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { images, errors }
}

export function canImportTapdImages(input: {
  tapdWorkspaceId?: string
  tapdStoryUrl?: string
  tapdAccessToken?: string
}): boolean {
  const workspace = input.tapdWorkspaceId?.trim()
  const token = input.tapdAccessToken?.trim()
  const story = resolveTapdStoryId(workspace ?? "", input.tapdStoryUrl ?? "")
  return !!(workspace && token && story)
}
