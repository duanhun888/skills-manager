import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useServer } from "@/context/server"

export type SkillsModelPolicy = {
  mode: "open" | "restricted"
  requirements_only_models: string[]
}

const OPEN: SkillsModelPolicy = { mode: "open", requirements_only_models: [] }
const POLL_MS = 60_000

/** Last successful fetch — never silently fall back to open on transient errors. */
let lastGood: SkillsModelPolicy = OPEN
let lastFingerprint = fingerprint(OPEN)

function fingerprint(data: SkillsModelPolicy) {
  return `${data.mode}|${data.requirements_only_models.join("\n")}`
}

function normalizeKey(providerID: string, modelID: string) {
  return `${providerID.trim()}/${modelID.trim()}`.toLowerCase()
}

function normalizeModelToken(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/\./g, "-")
}

const PROVIDER_ALIAS_GROUPS: string[][] = [["alibaba", "alibaba-cn"]]

function providerAliases(providerID: string): string[] {
  const id = providerID.trim().toLowerCase()
  for (const group of PROVIDER_ALIAS_GROUPS) {
    if (group.includes(id)) return group
  }
  return [id]
}

export function entryMatches(entry: string, providerID: string, modelID: string) {
  const normalizedEntry = entry.trim().toLowerCase()
  if (!normalizedEntry) return false

  const model = modelID.trim().toLowerCase()
  for (const provider of providerAliases(providerID)) {
    if (normalizedEntry === normalizeKey(provider, modelID)) return true
  }

  if (normalizedEntry === model) return true
  if (normalizeModelToken(normalizedEntry) === normalizeModelToken(modelID)) return true

  const slash = normalizedEntry.indexOf("/")
  const entryModel = slash >= 0 ? normalizedEntry.slice(slash + 1) : normalizedEntry
  return normalizeModelToken(entryModel) === normalizeModelToken(modelID)
}

function parsePolicy(data: Partial<SkillsModelPolicy>): SkillsModelPolicy {
  return {
    mode: data.mode === "restricted" ? "restricted" : "open",
    requirements_only_models: Array.isArray(data.requirements_only_models)
      ? data.requirements_only_models.filter((x): x is string => typeof x === "string")
      : [],
  }
}

async function fetchPolicy(
  baseUrl: string | undefined,
  http?: { username?: string; password?: string },
): Promise<SkillsModelPolicy> {
  if (!baseUrl) return lastGood
  try {
    const url = new URL("/skills/model-policy", baseUrl)
    const headers: HeadersInit = {}
    if (http?.password) {
      const token = btoa(`${http.username ?? ""}:${http.password}`)
      headers.Authorization = `Basic ${token}`
      url.searchParams.set("auth_token", token)
    }
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) return lastGood
    return parsePolicy((await res.json()) as Partial<SkillsModelPolicy>)
  } catch {
    return lastGood
  }
}

/** Skills model policy; refreshes quietly and only updates UI when data changes. */
export function useSkillsModelPolicy() {
  const server = useServer()
  const [current, setCurrent] = createSignal<SkillsModelPolicy>(lastGood)
  const baseUrl = createMemo(() => server.current?.http.url)
  const httpAuth = createMemo(() => server.current?.http)

  const refresh = async () => {
    if (document.visibilityState === "hidden") return
    const next = await fetchPolicy(baseUrl(), httpAuth())
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

  const isCodingBlocked = (providerID: string, modelID: string) => {
    const p = current()
    if (p.mode !== "restricted") return false
    return p.requirements_only_models.some((entry) => entryMatches(entry, providerID, modelID))
  }

  return { policy: current, isCodingBlocked }
}
