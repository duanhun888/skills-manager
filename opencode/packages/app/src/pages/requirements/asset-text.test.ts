import { describe, expect, test } from "bun:test"
import { formatDocumentContext, loadAssetPreviewContent, toVisionFileParts } from "./asset-text"

describe("asset text helpers", () => {
  test("inlines csv/text documents for the model", async () => {
    const csv = "project,stock\nA,10\nB,20"
    const dataUrl = `data:text/csv;base64,${Buffer.from(csv, "utf8").toString("base64")}`
    const text = await formatDocumentContext([
      {
        id: "1",
        filename: "stock.csv",
        mime: "text/csv",
        dataUrl,
        note: "",
        createdAt: 0,
      },
    ])
    expect(text).toContain("stock.csv")
    expect(text).toContain("project,stock")
    expect(
      toVisionFileParts([
        {
          id: "1",
          filename: "stock.csv",
          mime: "text/csv",
          dataUrl,
          note: "",
          createdAt: 0,
        },
      ]),
    ).toHaveLength(0)
  })

  test("loadAssetPreviewContent builds a csv table preview", async () => {
    const csv = "name,qty\nfoo,1\nbar,2"
    const preview = await loadAssetPreviewContent({
      id: "1",
      filename: "stock.csv",
      mime: "text/csv",
      dataUrl: `data:text/csv;base64,${Buffer.from(csv, "utf8").toString("base64")}`,
      note: "",
      createdAt: 0,
    })
    expect(preview.kind).toBe("table")
    if (preview.kind !== "table") return
    expect(preview.rows[0]).toEqual(["name", "qty"])
    expect(preview.rows[1]).toEqual(["foo", "1"])
  })

  test("loadAssetPreviewContent uses pdf data url", async () => {
    const preview = await loadAssetPreviewContent({
      id: "1",
      filename: "a.pdf",
      mime: "application/pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0=",
      note: "",
      createdAt: 0,
    })
    expect(preview).toEqual({ kind: "pdf", dataUrl: "data:application/pdf;base64,JVBERi0=" })
  })
})
