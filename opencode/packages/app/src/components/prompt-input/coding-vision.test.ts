import { describe, expect, test } from "bun:test"
import {
  buildCodingFollowupText,
  buildVisionDescribeUserText,
  collectAssistantText,
  visionDescribeMode,
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

  test("visionDescribeMode treats plain analyze-image as image_only", () => {
    expect(visionDescribeMode("分析图片")).toBe("image_only")
    expect(visionDescribeMode("识别图片")).toBe("image_only")
    expect(visionDescribeMode("")).toBe("image_only")
    expect(visionDescribeMode("只看图，说说界面")).toBe("image_only")
  })

  test("visionDescribeMode uses task_context for coding asks", () => {
    expect(visionDescribeMode("修这个报错")).toBe("task_context")
    expect(visionDescribeMode("按我们刚才说的改按钮颜色")).toBe("task_context")
  })

  test("buildVisionDescribeUserText wraps coding ask with context mode", () => {
    const text = buildVisionDescribeUserText("修这个报错", "zh")
    expect(text).toContain("[识图准备 · 结合上下文]")
    expect(text).toContain("修这个报错")
    expect(text).toContain("不要写业务代码")
  })

  test("buildVisionDescribeUserText uses image-only for analyze-image", () => {
    const text = buildVisionDescribeUserText("分析图片", "zh")
    expect(text).toContain("[识图准备 · 仅看图]")
    expect(text).toContain("不要参考本会话上文")
  })

  test("buildCodingFollowupText keeps user ask and marks vision proxy", () => {
    const text = buildCodingFollowupText("继续改", "按钮是红色", "zh")
    expect(text.startsWith("继续改")).toBe(true)
    expect(text).toContain("[截图识别]")
    expect(text).toContain("看不到原图")
    expect(text).toContain("按钮是红色")
  })
})
