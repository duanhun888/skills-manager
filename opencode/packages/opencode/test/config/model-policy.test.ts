import { describe, expect, test } from "bun:test"
import { entryMatches } from "../../src/config/model-policy"

describe("SkillsModelPolicy.entryMatches", () => {
  test("matches exact provider/model", () => {
    expect(entryMatches("alibaba-cn/qwen3.7-plus", "alibaba-cn", "qwen3.7-plus")).toBe(true)
  })

  test("matches bare model id across providers", () => {
    expect(entryMatches("qwen3.7-plus", "alibaba-cn", "qwen3.7-plus")).toBe(true)
    expect(entryMatches("qwen3.7-plus", "opencode", "qwen3.7-plus")).toBe(true)
  })

  test("matches wrong provider prefix when model token matches (admin typo)", () => {
    expect(entryMatches("opencode/qwen3.7-plus", "alibaba-cn", "qwen3.7-plus")).toBe(true)
    expect(entryMatches("alibaba/qwen3-vl-plus", "alibaba-cn", "qwen3-vl-plus")).toBe(true)
  })

  test("matches alibaba ↔ alibaba-cn aliases", () => {
    expect(entryMatches("alibaba/qwen3-vl-plus", "alibaba-cn", "qwen3-vl-plus")).toBe(true)
    expect(entryMatches("alibaba-cn/qwen3-vl-plus", "alibaba", "qwen3-vl-plus")).toBe(true)
  })

  test("matches display-name style tokens", () => {
    expect(entryMatches("alibaba/Qwen3.7 Plus", "alibaba-cn", "qwen3.7-plus")).toBe(true)
  })

  test("does not match unrelated models", () => {
    expect(entryMatches("qwen3.7-plus", "alibaba-cn", "deepseek-v4-pro")).toBe(false)
    expect(entryMatches("opencode/qwen3.7-plus", "alibaba-cn", "glm-5.2")).toBe(false)
  })
})
