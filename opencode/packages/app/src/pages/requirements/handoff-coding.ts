import { pathKey } from "@/utils/path-key"
import type { ServerConnection } from "@/context/server"

export type HandoffTab =
  | { type: "draft"; draftID: string; server: ServerConnection.Key; directory: string; worktree?: string }
  | { type: "session"; server: ServerConnection.Key; sessionId: string }

/** Prefer an already-open coding tab for the linked project over always creating a new draft. */
export function findOpenTabForProject(input: {
  tabs: HandoffTab[]
  server: ServerConnection.Key
  directory: string
  recentKey?: string
  tabKey?: (tab: HandoffTab) => string
  sessionDirectory?: (sessionId: string) => string | undefined
}): HandoffTab | undefined {
  const target = pathKey(input.directory)
  const matches = input.tabs.filter((tab) => {
    if (tab.server !== input.server) return false
    if (tab.type === "draft") {
      if (pathKey(tab.directory) === target) return true
      return !!tab.worktree && pathKey(tab.worktree) === target
    }
    const directory = input.sessionDirectory?.(tab.sessionId)
    return !!directory && pathKey(directory) === target
  })
  if (matches.length === 0) return undefined

  if (input.recentKey && input.tabKey) {
    const recent = matches.find((tab) => input.tabKey!(tab) === input.recentKey)
    if (recent) return recent
  }

  const sessions = matches.filter((tab) => tab.type === "session")
  if (sessions.length > 0) return sessions[sessions.length - 1]
  return matches[matches.length - 1]
}

type SessionLike = {
  id: string
  directory: string
  parentID?: string
  time?: { archived?: number; updated?: number; created?: number }
}

/** Most recently updated root session in the linked project. */
export function pickLatestProjectSession(sessions: SessionLike[]): SessionLike | undefined {
  const roots = sessions.filter((session) => !session.parentID && !session.time?.archived)
  if (roots.length === 0) return undefined
  return roots.reduce((best, session) => {
    const bestAt = best.time?.updated ?? best.time?.created ?? 0
    const nextAt = session.time?.updated ?? session.time?.created ?? 0
    return nextAt >= bestAt ? session : best
  })
}
