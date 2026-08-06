/** Client for PaddleX / PaddleOCR HTTP serving (`POST /ocr`). */

export type CodingOcrResult =
  | { ok: true; text: string; avgScore: number; lineCount: number }
  | { ok: false; reason: string }

function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf("base64,")
  if (i >= 0) return dataUrl.slice(i + "base64,".length)
  return dataUrl
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function collectTexts(payload: unknown): { texts: string[]; scores: number[] } {
  const texts: string[] = []
  const scores: number[] = []

  const pushTexts = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const item of value) {
      if (typeof item === "string" && item.trim()) texts.push(item.trim())
    }
  }
  const pushScores = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const item of value) {
      if (typeof item === "number" && Number.isFinite(item)) scores.push(item)
    }
  }

  const visit = (value: unknown, depth: number) => {
    if (depth > 6) return
    const node = asRecord(value)
    if (!node) {
      if (Array.isArray(value)) {
        for (const item of value) visit(item, depth + 1)
      }
      return
    }

    pushTexts(node.rec_texts)
    pushTexts(node.recTexts)
    pushScores(node.rec_scores)
    pushScores(node.recScores)

    // PaddleX serving nests under result / data / ocrResults / prunedResult.
    visit(node.result, depth + 1)
    visit(node.data, depth + 1)
    visit(node.ocrResults, depth + 1)
    visit(node.prunedResult, depth + 1)
    visit(node.pruned_result, depth + 1)
  }

  visit(payload, 0)
  return { texts, scores }
}

/** Whether OCR output is good enough to skip the VL pass. */
export function isOcrUseful(input: { texts: string[]; scores: number[] }): CodingOcrResult {
  const lines = input.texts.map((t) => t.trim()).filter(Boolean)
  const text = lines.join("\n").trim()
  const lineCount = lines.length
  const avgScore =
    input.scores.length > 0 ? input.scores.reduce((a, b) => a + b, 0) / input.scores.length : 1
  const compact = text.replace(/\s+/g, "")
  // CJK glyphs are denser than Latin; count each Han char twice so short logos
  // like "跨境AI专家" (6 code units) still pass the minimum useful-length gate.
  const han = [...compact].filter((ch) => /\p{Script=Han}/u.test(ch)).length
  const effectiveLen = compact.length + han

  if (!text) return { ok: false, reason: "empty" }
  if (effectiveLen < 8) return { ok: false, reason: "too_short" }
  if (lineCount === 0) return { ok: false, reason: "no_lines" }
  if (input.scores.length > 0 && avgScore < 0.45) return { ok: false, reason: "low_confidence" }
  // Many low-confidence fragments → likely UI/noise rather than readable error text.
  if (input.scores.length >= 3) {
    const weak = input.scores.filter((s) => s < 0.4).length
    if (weak / input.scores.length >= 0.6) return { ok: false, reason: "noisy" }
  }

  return { ok: true, text, avgScore, lineCount }
}

function ocrLog(level: "info" | "warn", message: string, detail?: Record<string, unknown>) {
  const payload = detail ? { ...detail } : undefined
  if (level === "warn") console.warn(`[coding-ocr] ${message}`, payload ?? "")
  else console.info(`[coding-ocr] ${message}`, payload ?? "")
}

export async function ocrImageBase64(input: {
  endpoint: string
  base64: string
  signal?: AbortSignal
}): Promise<CodingOcrResult> {
  const endpoint = input.endpoint.trim().replace(/\/+$/, "")
  if (!endpoint) {
    ocrLog("warn", "skip: no endpoint")
    return { ok: false, reason: "no_endpoint" }
  }

  const url = /\/ocr$/i.test(endpoint) ? endpoint : `${endpoint}/ocr`
  const bytes = stripDataUrl(input.base64).length
  ocrLog("info", "POST start", { url, base64Chars: bytes })

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: stripDataUrl(input.base64),
        fileType: 1,
        visualize: false,
      }),
      signal: input.signal,
    })
  } catch (error) {
    ocrLog("warn", "network error", {
      url,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, reason: "network" }
  }

  if (!res.ok) {
    ocrLog("warn", "http error", { url, status: res.status })
    return { ok: false, reason: `http_${res.status}` }
  }

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    ocrLog("warn", "bad json", { url })
    return { ok: false, reason: "bad_json" }
  }

  const root = asRecord(payload)
  const errorCode = root?.errorCode ?? root?.error_code
  if (typeof errorCode === "number" && errorCode !== 0) {
    ocrLog("warn", "api errorCode", { url, errorCode })
    return { ok: false, reason: `error_${errorCode}` }
  }
  const errMsg = root?.errMsg ?? root?.errorMsg ?? root?.message
  if (typeof errMsg === "string" && errMsg && !/success/i.test(errMsg)) {
    // Some gateways use errMsg without numeric code.
    if (/fail|error|invalid/i.test(errMsg)) {
      ocrLog("warn", "api errorMsg", { url, errMsg })
      return { ok: false, reason: "api_error" }
    }
  }

  const collected = collectTexts(payload)
  const useful = isOcrUseful(collected)
  ocrLog(useful.ok ? "info" : "warn", useful.ok ? "ok" : "rejected", {
    url,
    lineCount: collected.texts.length,
    preview: collected.texts.slice(0, 3),
    scores: collected.scores.slice(0, 5),
    reason: useful.ok ? undefined : useful.reason,
    textLen: useful.ok ? useful.text.replace(/\s+/g, "").length : 0,
  })
  return useful
}

export async function ocrImages(input: {
  endpoint: string
  dataUrls: string[]
  signal?: AbortSignal
}): Promise<CodingOcrResult> {
  if (input.dataUrls.length === 0) return { ok: false, reason: "no_images" }

  const parts: string[] = []
  let scoreSum = 0
  let lines = 0

  for (const dataUrl of input.dataUrls) {
    const one = await ocrImageBase64({
      endpoint: input.endpoint,
      base64: dataUrl,
      signal: input.signal,
    })
    if (!one.ok) return one
    parts.push(one.text)
    lines += one.lineCount
    scoreSum += one.avgScore
  }

  const text = parts.join("\n\n").trim()
  if (!text) return { ok: false, reason: "empty" }
  return {
    ok: true,
    text,
    avgScore: scoreSum / input.dataUrls.length,
    lineCount: lines,
  }
}
