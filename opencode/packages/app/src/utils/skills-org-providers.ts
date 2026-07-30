import { createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { useServer } from "@/context/server"

type OrgProviders = {
  provider_ids: string[]
}

const EMPTY: OrgProviders = { provider_ids: [] }
let lastGood: OrgProviders = EMPTY

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
}

async function fetchOrgProviders(
  baseUrl: string | undefined,
  http?: { username?: string; password?: string },
): Promise<OrgProviders> {
  if (!baseUrl) return lastGood
  try {
    const url = new URL("/skills/org-providers", baseUrl)
    const headers: HeadersInit = {}
    if (http?.password) {
      const token = btoa(`${http.username ?? ""}:${http.password}`)
      headers.Authorization = `Basic ${token}`
      url.searchParams.set("auth_token", token)
    }
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) return lastGood
    const data = (await res.json()) as Partial<OrgProviders>
    const parsed: OrgProviders = {
      provider_ids: normalizeIds(data.provider_ids),
    }
    lastGood = parsed
    return parsed
  } catch {
    return lastGood
  }
}

/** Poll org-shared provider IDs from the local OpenCode server. */
export function useSkillsOrgProviders() {
  const server = useServer()
  const [tick, setTick] = createSignal(0)
  const baseUrl = createMemo(() => server.current?.http.url)
  const httpAuth = createMemo(() => server.current?.http)

  const [resource] = createResource(
    () => `${baseUrl() ?? ""}|${httpAuth()?.password ?? ""}|${tick()}`,
    async () => fetchOrgProviders(baseUrl(), httpAuth()),
    { initialValue: lastGood },
  )

  const timer = window.setInterval(() => setTick((n) => n + 1), 15_000)
  onCleanup(() => window.clearInterval(timer))

  const current = createMemo(() => resource() ?? lastGood)

  /** Org shared credentials are available for this provider (shown as 共享). */
  const isShared = (providerID: string) => {
    const id = providerID.trim().toLowerCase()
    if (!id) return false
    return current().provider_ids.includes(id)
  }

  return { providers: current, isShared }
}
