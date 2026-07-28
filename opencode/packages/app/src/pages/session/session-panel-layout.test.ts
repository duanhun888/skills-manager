import { describe, expect, test } from "bun:test"
import { sessionPanelLayout } from "./session-panel-layout"

describe("sessionPanelLayout", () => {
  test("keeps one V2 owner while changing panel geometry", () => {
    expect(sessionPanelLayout({ review: false, terminal: false })).toEqual({
      visible: false,
      stacked: false,
    })
    expect(sessionPanelLayout({ review: false, terminal: true })).toEqual({
      visible: true,
      stacked: false,
    })
    expect(sessionPanelLayout({ review: true, terminal: true })).toEqual({
      visible: true,
      stacked: true,
    })
  })

  test("does not treat the session file tree as the V2 column owner", () => {
    // File tree is mounted as a chat sibling; review/terminal alone own the right column.
    expect(sessionPanelLayout({ review: false, terminal: false })).toEqual({
      visible: false,
      stacked: false,
    })
  })
})
