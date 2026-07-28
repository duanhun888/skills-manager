import { describe, expect, test } from "bun:test"
import { insertFileMention } from "./insert-file-mention"

describe("insertFileMention", () => {
  test("appends a file mention into an empty prompt", () => {
    const result = insertFileMention([{ type: "text", content: "", start: 0, end: 0 }], "test.php")
    expect(result.prompt.map((part) => ("content" in part ? part.content : ""))).toEqual(["@test.php", " "])
    expect(result.prompt.some((part) => part.type === "file" && part.path === "test.php")).toBe(true)
  })

  test("inserts at the cursor and keeps trailing text", () => {
    const result = insertFileMention(
      [{ type: "text", content: "hello world", start: 0, end: 11 }],
      "src/app.ts",
      5,
    )
    expect(result.prompt.map((part) => ("content" in part ? part.content : ""))).toEqual([
      "hello",
      "@src/app.ts",
      "  world",
    ])
  })

  test("does not duplicate an existing file mention", () => {
    const prompt = [
      { type: "file" as const, path: "test.php", content: "@test.php", start: 0, end: 9 },
      { type: "text" as const, content: " ", start: 9, end: 10 },
    ]
    const result = insertFileMention(prompt, "test.php")
    expect(result.prompt).toEqual(prompt)
  })
})
