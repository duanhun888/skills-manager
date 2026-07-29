import { createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { useServer } from "@/context/server"

export type SkillsModelPolicy = {
  mode: "open" | "restricted"
  requirements_only_models: string[]
}

const OPEN: SkillsModelPolicy = { mode: "open", requirements_only_models: [] }

/** Last successful fetch — never silently fall back to open on transient errors. */
let lastGood: SkillsModelPolicy = OPEN

function normalizeKey(providerID: string, modelID: string) {
  return `${providerID.trim()}/${modelID.trim()}`.toLowerCase()
}

function normalizeModelToken(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
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
    const parsed = parsePolicy((await res.json()) as Partial<SkillsModelPolicy>)
    lastGood = parsed
    return parsed
  } catch {
    return lastGood
  }
}

/** Poll Skills model policy from the local OpenCode server. */
export function useSkillsModelPolicy() {
  const server = useServer()
  const [tick, setTick] = createSignal(0)
  const baseUrl = createMemo(() => server.current?.http.url)
  const httpAuth = createMemo(() => server.current?.http)

  const [policy] = createResource(
    () => `${baseUrl() ?? ""}|${httpAuth()?.password ?? ""}|${tick()}`,
    async () => fetchPolicy(baseUrl(), httpAuth()),
    { initialValue: lastGood },
  )

  // Soft refresh so Skills policy edits apply without restarting OpenCode.
  const timer = window.setInterval(() => setTick((n) => n + 1), 15_000)
  onCleanup(() => window.clearInterval(timer))

  const current = createMemo(() => policy() ?? lastGood)

  const isCodingBlocked = (providerID: string, modelID: string) => {
    const p = current()
    if (p.mode !== "restricted") return false
    return p.requirements_only_models.some((entry) => entryMatches(entry, providerID, modelID))
  }

  return { policy: current, isCodingBlocked }
}
