import { describe, expect, test } from "bun:test"
import {
  canImportTapdImages,
  downloadTapdImage,
  extractImagePathsFromDescription,
  extractTapdStoryId,
  importTapdStoryImages,
  normalizeAssetDataUrl,
  resolveTapdStoryId,
  sniffMimeFromBytes,
  toTapdStoryLongId,
} from "./tapd-import"

describe("tapd-import helpers", () => {
  test("extracts story id from url", () => {
    expect(
      extractTapdStoryId("https://www.tapd.cn/64516772/prong/stories/view/11645167720001031026"),
    ).toBe("11645167720001031026")
    expect(extractTapdStoryId("1031026")).toBe("1031026")
    expect(extractTapdStoryId("")).toBeUndefined()
  })

  test("expands short story id to long id", () => {
    expect(toTapdStoryLongId("64516772", "1031026")).toBe("1164516772001031026")
    expect(toTapdStoryLongId("64516772", "1000831")).toBe("1164516772001000831")
    expect(toTapdStoryLongId("64516772", "1164516772001031026")).toBe("1164516772001031026")
    expect(resolveTapdStoryId("64516772", "1031026")).toBe("1164516772001031026")
  })

  test("extracts image paths from tox-clear-float pasted img", () => {
    const html = `<p></p><p class="tox-clear-float"><img src="/tfl/captures/2026-06/tapd_64516772_base64_1781066996_104.png"  /></p>`
    expect(extractImagePathsFromDescription(html)).toEqual([
      "/tfl/captures/2026-06/tapd_64516772_base64_1781066996_104.png",
    ])
  })

  test("canImportTapdImages requires workspace story token", () => {
    expect(canImportTapdImages({})).toBe(false)
    expect(
      canImportTapdImages({
        tapdWorkspaceId: "1",
        tapdStoryUrl: "https://www.tapd.cn/1/prong/stories/view/99",
        tapdAccessToken: "tok",
      }),
    ).toBe(true)
    expect(
      canImportTapdImages({
        tapdWorkspaceId: "64516772",
        tapdStoryUrl: "1031026",
        tapdAccessToken: "tok",
      }),
    ).toBe(true)
  })

  test("downloadTapdImage retries once on token expire", async () => {
    let getImageCalls = 0
    let downloadCalls = 0
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes("/files/get_image")) {
        getImageCalls += 1
        return new Response(
          JSON.stringify({
            status: 1,
            data: { Attachment: { download_url: `https://file.tapd.cn/tmp/${getImageCalls}` } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }
      downloadCalls += 1
      if (downloadCalls === 1) {
        return new Response("token expire2", { status: 200 })
      }
      return new Response(pngBytes, { status: 200, headers: { "content-type": "image/png" } })
    }

    const image = await downloadTapdImage({
      workspaceId: "1",
      accessToken: "tok",
      storyId: "99",
      ref: { kind: "path", path: "/tfl/a.png", filename: "a.png" },
      fetch: fetchImpl,
    })

    expect(getImageCalls).toBe(2)
    expect(downloadCalls).toBe(2)
    expect(image.dataUrl.startsWith("data:image/png;base64,")).toBe(true)
    expect(image.note).toBe("TAPD story 99")
  })

  test("importTapdStoryImages expands short id and downloads images", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const seenIds: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes("/stories?")) {
        const id = new URL(url).searchParams.get("id")
        if (id) seenIds.push(id)
        return new Response(
          JSON.stringify({
            status: 1,
            data: [{ Story: { description: `<img src="/tfl/desc.png" />` } }],
          }),
          { status: 200 },
        )
      }
      if (url.includes("/attachments?") && !url.includes("/attachments/down")) {
        return new Response(
          JSON.stringify({
            status: 1,
            data: [
              {
                Attachment: {
                  id: "att-1",
                  filename: "shot.jpg",
                  content_type: "image/jpeg",
                },
              },
              {
                Attachment: {
                  id: "att-2",
                  filename: "库存数据.xlsx",
                  content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                },
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.includes("/files/get_image") || url.includes("/attachments/down")) {
        return new Response(
          JSON.stringify({
            status: 1,
            data: { Attachment: { download_url: "https://file.tapd.cn/tmp/ok" } },
          }),
          { status: 200 },
        )
      }
      if (url.includes("file.tapd.cn")) {
        return new Response(pngBytes, { status: 200, headers: { "content-type": "image/png" } })
      }
      return new Response("not found", { status: 404 })
    }

    const { images, errors } = await importTapdStoryImages({
      workspaceId: "64516772",
      storyId: "1031026",
      accessToken: "tok",
      fetch: fetchImpl,
    })

    expect(seenIds).toContain("1164516772001031026")
    expect(errors).toEqual([])
    expect(images.length).toBe(3)
    expect(images.map((item) => item.filename).sort()).toEqual(["desc.png", "shot.jpg", "库存数据.xlsx"])
  })

  test("sniffs png mime and normalizes wrong data url", () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(sniffMimeFromBytes(pngHeader, "a.bin")).toBe("image/png")
    const base64 = btoa(String.fromCharCode(...pngHeader))
    const fixed = normalizeAssetDataUrl({
      filename: "a.png",
      mime: "application/octet-stream",
      dataUrl: `data:application/octet-stream;base64,${base64}`,
    })
    expect(fixed.mime).toBe("image/png")
    expect(fixed.dataUrl.startsWith("data:image/png;base64,")).toBe(true)
    expect(fixed.kind).toBe("image")
  })
})
