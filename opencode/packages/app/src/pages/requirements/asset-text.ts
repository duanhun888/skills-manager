import type { RequirementAsset } from "./types"
import { normalizeAssetDataUrl, assetPreviewKind } from "./tapd-import"

const TEXT_LIMIT = 24_000

function decodeDataUrlPayload(dataUrl: string): { mime: string; bytes: Uint8Array } | undefined {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) return
  const mime = (match[1] || "application/octet-stream").trim()
  const payload = match[3] ?? ""
  if (match[2]) {
    try {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return { mime, bytes }
    } catch {
      return
    }
  }
  try {
    const text = decodeURIComponent(payload)
    return { mime, bytes: new TextEncoder().encode(text) }
  } catch {
    return { mime, bytes: new TextEncoder().encode(payload) }
  }
}

function bytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  } catch {
    return ""
  }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return data
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

type ZipEntry = { name: string; data: Uint8Array }

/** Minimal ZIP reader (store + deflate) for Office Open XML previews. */
async function readZipEntries(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: ZipEntry[] = []
  let offset = 0
  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const method = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    const dataStart = nameEnd + extraLen
    const dataEnd = dataStart + compSize
    if (dataEnd > bytes.length) break
    const name = bytesToText(bytes.subarray(nameStart, nameEnd))
    const raw = bytes.subarray(dataStart, dataEnd)
    let data = raw
    if (method === 8) data = await inflateRaw(raw)
    else if (method !== 0) {
      offset = dataEnd
      continue
    }
    entries.push({ name, data })
    offset = dataEnd
  }
  return entries
}

function stripXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim()
}

async function extractXlsxTable(bytes: Uint8Array): Promise<{ rows: string[][]; text: string } | undefined> {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return
  const entries = await readZipEntries(bytes)
  const shared = entries.find((entry) => entry.name === "xl/sharedStrings.xml")
  const sheet =
    entries.find((entry) => entry.name === "xl/worksheets/sheet1.xml") ??
    entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name))
  if (!sheet) return

  const sharedStrings: string[] = []
  if (shared) {
    const xml = bytesToText(shared.data)
    for (const match of xml.matchAll(/<si\b[\s\S]*?<\/si>/g)) {
      const texts = [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => stripXml(m[1] ?? ""))
      sharedStrings.push(texts.join(""))
    }
  }

  const sheetXml = bytesToText(sheet.data)
  const grid = new Map<string, string>()
  let maxRow = 0
  let maxCol = 0
  for (const match of sheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = match[1] ?? ""
    const body = match[2] ?? ""
    const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1]
    if (!ref) continue
    const parsed = parseCellRef(ref)
    if (!parsed) continue
    const type = attrs.match(/\bt="([^"]+)"/)?.[1]
    const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? ""
    const value = type === "s" ? (sharedStrings[Number(raw)] ?? raw) : stripXml(raw)
    grid.set(`${parsed.row}:${parsed.col}`, value)
    maxRow = Math.max(maxRow, parsed.row)
    maxCol = Math.max(maxCol, parsed.col)
  }

  if (grid.size === 0) {
    // Fallback: shared strings only
    if (sharedStrings.length === 0) return
    const rows = chunk(sharedStrings.slice(0, 200), Math.min(8, Math.max(2, Math.ceil(Math.sqrt(sharedStrings.length)))))
    return { rows, text: sharedStrings.slice(0, 400).join(" | ") }
  }

  const rowLimit = Math.min(maxRow + 1, 40)
  const colLimit = Math.min(maxCol + 1, 16)
  const rows: string[][] = []
  for (let r = 0; r < rowLimit; r++) {
    const row: string[] = []
    for (let c = 0; c < colLimit; c++) row.push(grid.get(`${r}:${c}`) ?? "")
    if (row.some((cell) => cell.trim())) rows.push(row)
  }
  if (rows.length === 0) return
  const text = rows.map((row) => row.join("\t")).join("\n")
  return { rows, text }
}

async function extractXlsxPreview(bytes: Uint8Array): Promise<string | undefined> {
  const table = await extractXlsxTable(bytes)
  return table?.text
}

async function extractDocxText(bytes: Uint8Array): Promise<string | undefined> {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return
  const entries = await readZipEntries(bytes)
  const doc = entries.find((entry) => entry.name === "word/document.xml")
  if (!doc) return
  const xml = bytesToText(doc.data)
  const paras = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => stripXml(m[1] ?? "")).filter(Boolean)
  if (paras.length === 0) return
  return paras.join(" ").replace(/\s+/g, " ").trim()
}

function parseCsvRows(text: string, limit = 40): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, limit)
  return lines.map((line) => {
    if (line.includes("\t")) return line.split("\t").slice(0, 16)
    // Simple CSV split (good enough for preview)
    const cells: string[] = []
    let current = ""
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!
      if (ch === '"') {
        quoted = !quoted
        continue
      }
      if (ch === "," && !quoted) {
        cells.push(current.trim())
        current = ""
        continue
      }
      current += ch
    }
    cells.push(current.trim())
    return cells.slice(0, 16)
  })
}

function parseCellRef(ref: string): { row: number; col: number } | undefined {
  const match = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!match) return
  const letters = match[1]!
  const row = Number(match[2]) - 1
  let col = 0
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64)
  return { row, col: col - 1 }
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

export type AssetPreviewContent =
  | { kind: "pdf"; dataUrl: string }
  | { kind: "table"; rows: string[][]; filename: string }
  | { kind: "text"; text: string; filename: string }
  | { kind: "empty"; filename: string; reason: string }

/** Build a UI preview for materials canvas (Excel / PDF / text / Word). */
export async function loadAssetPreviewContent(asset: RequirementAsset): Promise<AssetPreviewContent> {
  const normalized = normalizeAssetDataUrl(asset)
  const kind = normalized.kind
  if (kind === "pdf" || normalized.mime === "application/pdf" || /\.pdf$/i.test(asset.filename)) {
    return { kind: "pdf", dataUrl: normalized.dataUrl }
  }

  const decoded = decodeDataUrlPayload(normalized.dataUrl)
  if (!decoded) return { kind: "empty", filename: asset.filename, reason: "decode" }

  if (kind === "spreadsheet" || /\.(xlsx|xls|csv)$/i.test(asset.filename)) {
    if (/\.csv$/i.test(asset.filename) || normalized.mime === "text/csv") {
      const text = bytesToText(decoded.bytes).trim()
      if (!text) return { kind: "empty", filename: asset.filename, reason: "empty" }
      return { kind: "table", rows: parseCsvRows(text), filename: asset.filename }
    }
    const table = await extractXlsxTable(decoded.bytes)
    if (table?.rows.length) return { kind: "table", rows: table.rows, filename: asset.filename }
    if (table?.text) return { kind: "text", text: table.text.slice(0, 8_000), filename: asset.filename }
    return { kind: "empty", filename: asset.filename, reason: "spreadsheet" }
  }

  if (
    normalized.mime.startsWith("text/") ||
    /\.(txt|md|json|tsv)$/i.test(asset.filename)
  ) {
    const text = bytesToText(decoded.bytes).trim()
    if (text) return { kind: "text", text: text.slice(0, 12_000), filename: asset.filename }
  }

  if (kind === "doc" || /\.docx?$/i.test(asset.filename)) {
    if (/\.docx$/i.test(asset.filename)) {
      const text = await extractDocxText(decoded.bytes)
      if (text) return { kind: "text", text: text.slice(0, 12_000), filename: asset.filename }
    }
    const text = bytesToText(decoded.bytes).trim()
    if (text && !text.includes("\0")) return { kind: "text", text: text.slice(0, 12_000), filename: asset.filename }
  }

  return { kind: "empty", filename: asset.filename, reason: "unsupported" }
}

function isVisionFilePart(kind: string, mime: string): boolean {
  if (kind === "image" || mime.startsWith("image/") || mime === "image") return true
  if (kind === "pdf" || mime === "application/pdf") return true
  return false
}

function resolveVisionMime(mime: string, dataUrl: string, filename: string): string {
  const value = mime.trim().toLowerCase()
  if (value.startsWith("image/") && value !== "image/*") return value
  if (value === "application/pdf") return value
  const fromUrl = dataUrl.match(/^data:(image\/[a-z0-9.+-]+|application\/pdf)/i)
  if (fromUrl?.[1]) return fromUrl[1].toLowerCase()
  const fromName = filename.match(/\.(png|jpe?g|gif|webp|bmp|pdf)$/i)?.[1]?.toLowerCase()
  if (fromName === "png") return "image/png"
  if (fromName === "jpg" || fromName === "jpeg") return "image/jpeg"
  if (fromName === "gif") return "image/gif"
  if (fromName === "webp") return "image/webp"
  if (fromName === "bmp") return "image/bmp"
  if (fromName === "pdf") return "application/pdf"
  if (value.startsWith("image")) return "image/png"
  return value || "image/png"
}

/** Rebuild data URL so AI SDK cannot prefer a bare `data:image;…` header over part.mime. */
function rebuildVisionDataUrl(mime: string, dataUrl: string): string {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return dataUrl
  const payload = match[3] ?? ""
  const base64 = !!match[2]
  // Prefer magic-byte sniff when available so header and mime stay aligned.
  if (base64 && payload) {
    try {
      const binary = atob(payload.slice(0, 96))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return `data:image/png;base64,${payload}`
      }
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return `data:image/jpeg;base64,${payload}`
      }
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return `data:image/gif;base64,${payload}`
      }
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
        return `data:image/webp;base64,${payload}`
      }
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        return `data:application/pdf;base64,${payload}`
      }
    } catch {
      // fall through to declared mime
    }
  }
  return `data:${mime}${base64 ? ";base64" : ""},${payload}`
}

/** File parts providers can actually ingest (images + PDF). */
export function toVisionFileParts(assets: RequirementAsset[], limit = 8) {
  return assets
    .slice(0, limit)
    .map((asset) => {
      const normalized = normalizeAssetDataUrl(asset)
      if (!normalized.dataUrl.startsWith("data:")) return
      if (!isVisionFilePart(normalized.kind, normalized.mime)) return
      const mime = resolveVisionMime(normalized.mime, normalized.dataUrl, asset.filename)
      const dataUrl = rebuildVisionDataUrl(mime, normalized.dataUrl)
      const finalMime = dataUrl.match(/^data:([^;,]+)/i)?.[1]?.toLowerCase() || mime
      return {
        type: "file" as const,
        mime: finalMime,
        url: dataUrl,
        filename: asset.filename,
      }
    })
    .filter((part): part is NonNullable<typeof part> => !!part)
}

/** Inline text / spreadsheet previews for models that cannot read Office binaries. */
export async function formatDocumentContext(assets: RequirementAsset[]): Promise<string | undefined> {
  const blocks: string[] = []
  for (const asset of assets) {
    const normalized = normalizeAssetDataUrl(asset)
    if (isVisionFilePart(normalized.kind, normalized.mime)) continue
    const decoded = decodeDataUrlPayload(normalized.dataUrl)
    if (!decoded) {
      blocks.push(`### ${asset.filename}\n(Unable to decode attachment bytes.)`)
      continue
    }
    const kind = assetPreviewKind({ mime: normalized.mime, filename: asset.filename })
    if (
      normalized.mime.startsWith("text/") ||
      /\.(txt|md|csv|json|tsv)$/i.test(asset.filename)
    ) {
      const text = bytesToText(decoded.bytes).trim()
      if (text) {
        blocks.push(`### ${asset.filename}\n${text.slice(0, TEXT_LIMIT)}`)
        continue
      }
    }
    if (kind === "spreadsheet" || /\.(xlsx|xls)$/i.test(asset.filename)) {
      const preview = await extractXlsxPreview(decoded.bytes)
      if (preview) {
        blocks.push(`### ${asset.filename}\n${preview.slice(0, TEXT_LIMIT)}`)
      } else {
        blocks.push(
          `### ${asset.filename}\n(Spreadsheet binary attached in materials library; content could not be extracted. Infer from filename/user request, or ask for key columns.)`,
        )
      }
      continue
    }
    if (kind === "doc") {
      if (/\.docx$/i.test(asset.filename)) {
        const docx = await extractDocxText(decoded.bytes)
        if (docx) {
          blocks.push(`### ${asset.filename}\n${docx.slice(0, TEXT_LIMIT)}`)
          continue
        }
      }
      const text = bytesToText(decoded.bytes).trim()
      if (text && !text.includes("\0")) {
        blocks.push(`### ${asset.filename}\n${text.slice(0, TEXT_LIMIT)}`)
        continue
      }
    }
    blocks.push(
      `### ${asset.filename}\n(Document type ${normalized.mime || kind} — binary not inlined for the model. Use filename and user instructions.)`,
    )
  }
  if (blocks.length === 0) return
  return ["### Attached documents (text preview)", ...blocks].join("\n\n")
}
