import { createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { useServer } from "@/context/server"

const SKILLS_SHARED_SUFFIX = ".skills-shared"

type OrgProviders = {
  provider_ids: string[]
  personal_ids: string[]
}

const EMPTY: OrgProviders = { provider_ids: [], personal_ids: [] }
let lastGood: OrgProviders = EMPTY

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
}

function baseProviderID(id: string) {
  const normalized = id.trim().toLowerCase()
  if (!normalized.endsWith(SKILLS_SHARED_SUFFIX)) return normalized
  return normalized.slice(0, -SKILLS_SHARED_SUFFIX.length)
}

function isSharedAlias(id: string) {
  return id.trim().toLowerCase().endsWith(SKILLS_SHARED_SUFFIX)
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
      personal_ids: normalizeIds(data.personal_ids),
    }
    lastGood = parsed
    return parsed
  } catch {
    return lastGood
  }
}

/** Poll org-shared vs personal provider IDs from the local OpenCode server. */
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

  /** Org shared entry (only-org real id, or `{id}.skills-shared` when both exist). */
  const isShared = (providerID: string) => {
    const id = providerID.trim().toLowerCase()
    if (!id) return false
    const p = current()
    const base = baseProviderID(id)
    if (!p.provider_ids.includes(base)) return false
    if (isSharedAlias(id)) return true
    return !p.personal_ids.includes(base)
  }

  /** Personal entry when org share also exists — pick this row to use your own key. */
  const isPersonal = (providerID: string) => {
    const id = providerID.trim().toLowerCase()
    if (!id || isSharedAlias(id)) return false
    const p = current()
    return p.provider_ids.includes(id) && p.personal_ids.includes(id)
  }

  return { providers: current, isShared, isPersonal }
}
