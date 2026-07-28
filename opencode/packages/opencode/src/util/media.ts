const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((value, index) => bytes[index] === value)

export function isPdfAttachment(mime: string) {
  return mime === "application/pdf"
}

export function isMedia(mime: string) {
  return mime.startsWith("image/") || mime.trim().toLowerCase() === "image" || isPdfAttachment(mime)
}

export function isImageAttachment(mime: string) {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet"
}

export function sniffAttachmentMime(bytes: Uint8Array, fallback: string) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"
  if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp"
  }

  return fallback
}

/** True for incomplete top-level types like TAPD's bare "image" that break openai-compatible image_url. */
export function isIncompleteAttachmentMime(mime: string) {
  const value = mime.trim().toLowerCase()
  if (!value) return true
  if (value === "image" || value === "audio" || value === "video" || value === "application") return true
  if (value === "image/*" || value === "application/octet-stream" || value === "binary/octet-stream") return true
  return false
}

function isCompleteMediaMime(mime: string) {
  const value = mime.trim().toLowerCase()
  return (value.startsWith("image/") && value !== "image/*") || value === "application/pdf"
}

function mimeFromFilename(filename?: string) {
  const ext = filename?.split(".").pop()?.toLowerCase()
  if (ext === "png") return "image/png"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "gif") return "image/gif"
  if (ext === "webp") return "image/webp"
  if (ext === "bmp") return "image/bmp"
  if (ext === "pdf") return "application/pdf"
  return ""
}

/**
 * OpenAI-compatible providers reject bare `mediaType: "image"`.
 * AI SDK also prefers the data-URL header over `part.mime`, so both must be concrete (`image/png`, …).
 *
 * For model conversion, prefer returning raw base64 in `url` (no `data:` prefix) so the AI SDK
 * cannot override `mediaType` with a broken header like `data:image;base64,…`.
 */
export function sanitizeAttachmentDataUrl(input: { mime: string; url: string; filename?: string }): {
  mime: string
  url: string
} {
  if (!input.url.startsWith("data:")) {
    const fromName = mimeFromFilename(input.filename)
    const mime = isCompleteMediaMime(input.mime)
      ? input.mime.trim().toLowerCase()
      : isCompleteMediaMime(fromName)
        ? fromName
        : input.mime.trim().toLowerCase() === "image"
          ? fromName || "image/png"
          : input.mime
    return { mime, url: input.url }
  }

  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(input.url)
  if (!match) return { mime: input.mime, url: input.url }

  const header = (match[1] ?? "").trim()
  const base64 = !!match[2]
  const payload = match[3] ?? ""

  let sniffed = ""
  if (base64 && payload) {
    try {
      const bytes = new Uint8Array(Buffer.from(payload.slice(0, 96), "base64"))
      sniffed = sniffAttachmentMime(bytes, "")
    } catch {
      // ignore decode errors; fall back to declared/header/filename
    }
  }

  const fromName = mimeFromFilename(input.filename)
  const declared = input.mime.trim()
  let mime = ""
  if (isCompleteMediaMime(sniffed)) mime = sniffed
  else if (isCompleteMediaMime(declared)) mime = declared.toLowerCase()
  else if (isCompleteMediaMime(header)) mime = header.toLowerCase()
  else if (isCompleteMediaMime(fromName)) mime = fromName
  else if ([declared, header, sniffed].some((value) => value.trim().toLowerCase().startsWith("image"))) {
    mime = "image/png"
  } else {
    mime = declared || header || "application/octet-stream"
  }

  if (!isCompleteMediaMime(mime) && mime.toLowerCase().startsWith("image")) {
    mime = "image/png"
  }

  // Always rewrite the header so persisted parts are also safe if re-read as data URLs.
  if (isCompleteMediaMime(mime) || mime.toLowerCase().startsWith("image")) {
    return {
      mime,
      url: `data:${mime}${base64 ? ";base64" : ""},${payload}`,
    }
  }

  return { mime, url: input.url }
}

/** UIMessage file part payload: raw base64 + concrete mediaType (avoids AI SDK data-URL MIME override). */
export function toModelFileData(input: { mime: string; url: string; filename?: string }): {
  mime: string
  url: string
} {
  const sanitized = sanitizeAttachmentDataUrl(input)
  let mime = sanitized.mime
  if (!isCompleteMediaMime(mime) && mime.toLowerCase().startsWith("image")) mime = "image/png"
  if (!isCompleteMediaMime(mime) && isIncompleteAttachmentMime(mime)) {
    mime = mimeFromFilename(input.filename) || "image/png"
  }

  if (sanitized.url.startsWith("data:")) {
    const idx = sanitized.url.indexOf(",")
    if (idx !== -1) {
      return { mime, url: sanitized.url.slice(idx + 1) }
    }
  }
  return { mime, url: sanitized.url }
}
