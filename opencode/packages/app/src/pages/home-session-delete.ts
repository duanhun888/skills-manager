import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import type { ServerConnection } from "@/context/server"

type HomeSession = {
  id: string
  directory: string
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (!error || typeof error !== "object") return String(error ?? "")
  const data = "data" in error ? (error as { data?: { message?: unknown } }).data : undefined
  if (typeof data?.message === "string") return data.message
  if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message
  }
  return String(error)
}

export function isSessionMissingError(error: unknown) {
  return /session not found/i.test(errorText(error))
}

export async function deleteHomeSession(input: {
  server: ServerConnection.Key
  session: HomeSession
  removeRemote: () => Promise<unknown>
  removeLocal: () => void
  onError?: (error: unknown) => void
}) {
  const finish = () => {
    input.removeLocal()
    notifySessionTabsRemoved({
      server: input.server,
      directory: input.session.directory,
      sessionIDs: [input.session.id],
    })
  }

  try {
    await input.removeRemote()
    finish()
  } catch (error) {
    // Home index can keep a stale row after an earlier delete missed the event stream.
    if (isSessionMissingError(error)) {
      finish()
      return
    }
    input.onError?.(error)
  }
}
