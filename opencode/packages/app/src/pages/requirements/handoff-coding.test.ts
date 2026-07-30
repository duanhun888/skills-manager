import { describe, expect, test } from "bun:test"
import { findOpenTabForProject, pickLatestProjectSession } from "./handoff-coding"
import type { HandoffTab } from "./handoff-coding"
import type { ServerConnection } from "@/context/server"

const server = "local" as ServerConnection.Key

describe("findOpenTabForProject", () => {
  test("prefers open session for the linked directory over drafts", () => {
    const tabs: HandoffTab[] = [
      { type: "draft", draftID: "d1", server, directory: "G:/demo" },
      { type: "session", server, sessionId: "ses_1" },
    ]
    const found = findOpenTabForProject({
      tabs,
      server,
      directory: "G:/demo",
      sessionDirectory: (id) => (id === "ses_1" ? "G:/demo" : undefined),
    })
    expect(found?.type).toBe("session")
    if (found?.type === "session") expect(found.sessionId).toBe("ses_1")
  })

  test("reuses draft when no session tab is open", () => {
    const tabs: HandoffTab[] = [
      { type: "draft", draftID: "d1", server, directory: "G:/other" },
      { type: "draft", draftID: "d2", server, directory: "G:/demo" },
    ]
    const found = findOpenTabForProject({
      tabs,
      server,
      directory: "G:\\demo",
    })
    expect(found).toEqual({ type: "draft", draftID: "d2", server, directory: "G:/demo" })
  })

  test("returns undefined when project has no open tabs", () => {
    const tabs: HandoffTab[] = [{ type: "draft", draftID: "d1", server, directory: "G:/other" }]
    expect(
      findOpenTabForProject({
        tabs,
        server,
        directory: "G:/demo",
      }),
    ).toBeUndefined()
  })
})

describe("pickLatestProjectSession", () => {
  test("picks newest non-archived root session", () => {
    const latest = pickLatestProjectSession([
      { id: "a", directory: "/demo", time: { created: 1, updated: 10 } },
      { id: "b", directory: "/demo", parentID: "a", time: { created: 2, updated: 99 } },
      { id: "c", directory: "/demo", time: { created: 3, updated: 20, archived: 1 } },
      { id: "d", directory: "/demo", time: { created: 4, updated: 15 } },
    ])
    expect(latest?.id).toBe("d")
  })
})
