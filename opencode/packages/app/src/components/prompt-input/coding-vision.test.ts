import { describe, expect, test } from "bun:test"
import {
  buildCodingFollowupText,
  buildVisionDescribeUserText,
  collectAssistantText,
} from "./coding-vision"

describe("coding-vision", () => {
  test("collectAssistantText joins non-ignored text parts", () => {
    expect(
      collectAssistantText([
        { type: "text", text: " a " },
        { type: "text", text: "b", ignored: true },
        { type: "text", text: "c" },
      ]),
    ).toBe("a\n\nc")
  })

  test("buildVisionDescribeUserText wraps user ask in zh", () => {
    const text = buildVisionDescribeUserText("修这个报错", "zh")
    expect(text).toContain("[识图准备]")
    expect(text).toContain("修这个报错")
    expect(text).toContain("不要写业务代码")
  })

  test("buildVisionDescribeUserText empty falls back with context hint", () => {
    expect(buildVisionDescribeUserText("  ", "zh")).toContain("本会话上文")
    expect(buildVisionDescribeUserText("", "en")).toContain("chat's context")
  })

  test("buildCodingFollowupText keeps user ask and marks vision proxy", () => {
    const text = buildCodingFollowupText("继续改", "按钮是红色", "zh")
    expect(text.startsWith("继续改")).toBe(true)
    expect(text).toContain("[截图识别]")
    expect(text).toContain("看不到原图")
    expect(text).toContain("按钮是红色")
  })
})
