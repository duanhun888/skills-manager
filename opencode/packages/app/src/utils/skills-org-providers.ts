import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useServer } from "@/context/server"

const SKILLS_SHARED_SUFFIX = ".skills-shared"
const SKILLS_PERSONAL_SUFFIX = ".skills-personal"
const POLL_MS = 60_000

type OrgProviders = {
  provider_ids: string[]
  personal_ids: string[]
}

const EMPTY: OrgProviders = { provider_ids: [], personal_ids: [] }
let lastGood: OrgProviders = EMPTY
let lastFingerprint = fingerprint(EMPTY)

function fingerprint(data: OrgProviders) {
  return `${data.provider_ids.join(",")}|${data.personal_ids.join(",")}`
}

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
}

function baseProviderID(id: string) {
  const normalized = id.trim().toLowerCase()
  if (normalized.endsWith(SKILLS_SHARED_SUFFIX)) {
    return normalized.slice(0, -SKILLS_SHARED_SUFFIX.length)
  }
  if (normalized.endsWith(SKILLS_PERSONAL_SUFFIX)) {
    return normalized.slice(0, -SKILLS_PERSONAL_SUFFIX.length)
  }
  return normalized
}

function isSharedAlias(id: string) {
  return id.trim().toLowerCase().endsWith(SKILLS_SHARED_SUFFIX)
}

function isPersonalAlias(id: string) {
  return id.trim().toLowerCase().endsWith(SKILLS_PERSONAL_SUFFIX)
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
    return {
      provider_ids: normalizeIds(data.provider_ids),
      personal_ids: normalizeIds(data.personal_ids),
    }
  } catch {
    return lastGood
  }
}

/** Org-shared vs personal provider IDs; refreshes quietly and only updates UI when data changes. */
export function useSkillsOrgProviders() {
  const server = useServer()
  const [current, setCurrent] = createSignal<OrgProviders>(lastGood)
  const baseUrl = createMemo(() => server.current?.http.url)
  const httpAuth = createMemo(() => server.current?.http)

  const refresh = async () => {
    if (document.visibilityState === "hidden") return
    const next = await fetchOrgProviders(baseUrl(), httpAuth())
    const fp = fingerprint(next)
    if (fp === lastFingerprint) return
    lastFingerprint = fp
    lastGood = next
    setCurrent(next)
  }

  onMount(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    onCleanup(() => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    })
  })

  const isShared = (providerID: string) => {
    const id = providerID.trim().toLowerCase()
    if (!id) return false
    const p = current()
    const base = baseProviderID(id)
    if (!p.provider_ids.includes(base)) return false
    if (isPersonalAlias(id)) return false
    if (isSharedAlias(id)) return true
    // Org owns the canonical provider id.
    return true
  }

  const isPersonal = (providerID: string) => {
    const id = providerID.trim().toLowerCase()
    if (!id || isSharedAlias(id)) return false
    if (isPersonalAlias(id)) return true
    const p = current()
    return p.provider_ids.includes(id) && p.personal_ids.includes(id)
  }

  return { providers: current, isShared, isPersonal }
}
