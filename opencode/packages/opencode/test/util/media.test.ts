import { describe, expect, test } from "bun:test"
import { isIncompleteAttachmentMime, sanitizeAttachmentDataUrl, toModelFileData } from "../../src/util/media"

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

describe("sanitizeAttachmentDataUrl", () => {
  test("rewrites bare image mime and data-URL header for openai-compatible providers", () => {
    const result = sanitizeAttachmentDataUrl({
      mime: "image",
      url: `data:image;base64,${PNG_B64}`,
      filename: "shot.png",
    })
    expect(result.mime).toBe("image/png")
    expect(result.url.startsWith("data:image/png;base64,")).toBe(true)
  })

  test("prefers sniffed mime over declared image/png when bytes are jpeg", () => {
    // minimal JPEG SOI
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")
    const result = sanitizeAttachmentDataUrl({
      mime: "image",
      url: `data:image;base64,${jpeg}`,
      filename: "a.bin",
    })
    expect(result.mime).toBe("image/jpeg")
    expect(result.url.startsWith("data:image/jpeg;base64,")).toBe(true)
  })

  test("isIncompleteAttachmentMime detects bare image", () => {
    expect(isIncompleteAttachmentMime("image")).toBe(true)
    expect(isIncompleteAttachmentMime("image/png")).toBe(false)
  })

  test("toModelFileData strips data-URL header so AI SDK cannot revive bare image mime", () => {
    const result = toModelFileData({
      mime: "image",
      url: `data:image;base64,${PNG_B64}`,
      filename: "logo.png",
    })
    expect(result.mime).toBe("image/png")
    expect(result.url.startsWith("data:")).toBe(false)
    expect(result.url).toBe(PNG_B64)
  })
})
