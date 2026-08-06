import { describe, expect, test } from "bun:test"
import { collectTexts, isOcrUseful } from "./coding-ocr"

describe("coding-ocr", () => {
  test("isOcrUseful accepts readable error text", () => {
    const result = isOcrUseful({
      texts: ["Error: Cannot find module 'foo'", "at Object.<anonymous> (index.js:1:1)"],
      scores: [0.92, 0.88],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain("Cannot find module")
      expect(result.lineCount).toBe(2)
    }
  })

  test("isOcrUseful rejects empty and short noise", () => {
    expect(isOcrUseful({ texts: [], scores: [] }).ok).toBe(false)
    expect(isOcrUseful({ texts: ["hi"], scores: [0.9] }).ok).toBe(false)
  })

  test("isOcrUseful accepts short CJK logo text", () => {
    const result = isOcrUseful({
      texts: ["跨境AI专家"],
      scores: [0.98],
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe("跨境AI专家")
  })

  test("isOcrUseful rejects low confidence", () => {
    const result = isOcrUseful({
      texts: ["something long enough", "another line here"],
      scores: [0.2, 0.3],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("low_confidence")
  })

  test("collectTexts reads PaddleX prunedResult nesting", () => {
    const payload = {
      errorCode: 0,
      errorMsg: "Success",
      result: {
        ocrResults: [
          {
            prunedResult: {
              rec_texts: ["LLaMA-Factory", "Easy and Efficient LLM Fine-Tuning"],
              rec_scores: [0.99, 0.98],
            },
          },
        ],
      },
    }
    const got = collectTexts(payload)
    expect(got.texts).toEqual(["LLaMA-Factory", "Easy and Efficient LLM Fine-Tuning"])
    expect(got.scores).toEqual([0.99, 0.98])
    expect(isOcrUseful(got).ok).toBe(true)
  })
})
