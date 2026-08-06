import { describe, expect, test } from "bun:test"
import type { AssistantMessage, ToolPart, UserMessage } from "@opencode-ai/sdk/v2"
import { collectTurnToolDiffs } from "./turn-tool-diffs"

const user = {
  id: "usr_1",
  role: "user",
} as UserMessage

const assistant = {
  id: "asst_1",
  role: "assistant",
  parentID: "usr_1",
} as AssistantMessage

describe("collectTurnToolDiffs", () => {
  test("reads edit/write filediff metadata", () => {
    const part = {
      id: "prt_1",
      type: "tool",
      tool: "edit",
      state: {
        status: "completed",
        metadata: {
          filediff: {
            file: "website/a.html",
            patch: "@@\n-a\n+b\n",
            additions: 1,
            deletions: 1,
            status: "modified",
          },
        },
      },
    } as ToolPart

    const diffs = collectTurnToolDiffs({
      userMessageID: user.id,
      messages: [user, assistant],
      parts: (id) => (id === assistant.id ? [part] : []),
    })

    expect(diffs).toEqual([
      {
        file: "website/a.html",
        patch: "@@\n-a\n+b\n",
        additions: 1,
        deletions: 1,
        status: "modified",
      },
    ])
  })

  test("reads apply_patch files metadata", () => {
    const part = {
      id: "prt_2",
      type: "tool",
      tool: "apply_patch",
      state: {
        status: "completed",
        metadata: {
          files: [
            {
              relativePath: "website/b.html",
              type: "update",
              patch: "@@\n-x\n+y\n",
              additions: 2,
              deletions: 1,
            },
          ],
        },
      },
    } as ToolPart

    const diffs = collectTurnToolDiffs({
      userMessageID: user.id,
      messages: [user, assistant],
      parts: (id) => (id === assistant.id ? [part] : []),
    })

    expect(diffs.map((d) => d.file)).toEqual(["website/b.html"])
    expect(diffs[0]?.additions).toBe(2)
  })
})
