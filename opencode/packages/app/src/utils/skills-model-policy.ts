import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useServer } from "@/context/server"

/** Org-fixed PaddleX OCR — keeps coding识图 working when policy file is empty/wrong. */
export const FIXED_CODING_OCR_URL = "http://192.168.1.230"

export type SkillsModelPolicy = {
  mode: "open" | "restricted"
  requirements_only_models: string[]
  coding_vision_model?: string
  /** Optional PaddleX OCR serving URL (e.g. http://192.168.1.230:8080). Tried before VL. */
  coding_ocr_url?: string
  /** Image describe pipeline when coding model cannot see images. Default: ocr_then_vl */
  coding_image_priority?: CodingImagePriority
}

export type CodingImagePriority = "ocr_then_vl" | "vl_then_ocr" | "ocr_only" | "vl_only"

const OPEN: SkillsModelPolicy = { mode: "open", requirements_only_models: [] }
const POLL_MS = 60_000

/** Last successful fetch — never silently fall back to open on transient errors. */
let lastGood: SkillsModelPolicy = OPEN
let lastFingerprint = fingerprint(OPEN)

function fingerprint(data: SkillsModelPolicy) {
  return `${data.mode}|${data.requirements_only_models.join("\n")}|${data.coding_vision_model ?? ""}|${data.coding_ocr_url ?? ""}|${data.coding_image_priority ?? ""}`
}

export function parseCodingImagePriority(raw: string | undefined | null): CodingImagePriority {
  const value = raw?.trim().toLowerCase()
  if (value === "vl_then_ocr" || value === "ocr_only" || value === "vl_only") return value
  return "ocr_then_vl"
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

/** Parse `provider/model` or bare model id into provider/model parts. */
export function parseProviderModel(raw: string | undefined | null): { providerID: string; modelID: string } | undefined {
  const entry = raw?.trim()
  if (!entry) return undefined
  const slash = entry.indexOf("/")
  if (slash <= 0 || slash >= entry.length - 1) return undefined
  return {
    providerID: entry.slice(0, slash).trim(),
    modelID: entry.slice(slash + 1).trim(),
  }
}

export function modelSupportsImages(item: {
  modalities?: { input?: string[] }
  capabilities?: { input?: { image?: boolean } }
} | undefined) {
  if (!item) return false
  if (item.capabilities?.input?.image) return true
  const modalities = item.modalities?.input
  return Array.isArray(modalities) && modalities.includes("image")
}

function parsePolicy(
  data: Partial<SkillsModelPolicy> & {
    coding_vision_model?: string | null
    coding_ocr_url?: string | null
    coding_image_priority?: string | null
  },
): SkillsModelPolicy {
  const vision =
    typeof data.coding_vision_model === "string" ? data.coding_vision_model.trim() : ""
  // Always pin OCR — ignore stale/empty/wrong values from disk or central config.
  const ocr = FIXED_CODING_OCR_URL
  const priority =
    typeof data.coding_image_priority === "string"
      ? parseCodingImagePriority(data.coding_image_priority)
      : undefined
  return {
    mode: data.mode === "restricted" ? "restricted" : "open",
    requirements_only_models: Array.isArray(data.requirements_only_models)
      ? data.requirements_only_models.filter((x): x is string => typeof x === "string")
      : [],
    coding_vision_model: vision || undefined,
    coding_ocr_url: ocr,
    coding_image_priority: priority,
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

  const refresh = async (opts?: { force?: boolean }) => {
    if (!opts?.force && document.visibilityState === "hidden") {
      if (fingerprint(current()) !== lastFingerprint) setCurrent(lastGood)
      return
    }
    const next = await fetchPolicy(baseUrl(), httpAuth())
    const fp = fingerprint(next)
    // Multiple hook instances race: the first success updates lastFingerprint;
    // later instances must still setCurrent or they stay stuck on OPEN.
    if (fp !== lastFingerprint) {
      lastFingerprint = fp
      lastGood = next
    }
    if (fingerprint(current()) !== lastFingerprint) setCurrent(lastGood)
  }

  onMount(() => {
    // Adopt any policy another instance already loaded before this mount.
    if (fingerprint(current()) !== lastFingerprint) setCurrent(lastGood)
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

  return { policy: current, isCodingBlocked, refresh }
}
