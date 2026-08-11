export * as SkillsOrgProviders from "./org-providers"

import { existsSync, readFileSync, statSync } from "fs"
import path from "path"
import { ConfigManaged } from "./managed"
import { Global } from "@opencode-ai/core/global"
import { isSkillsSharedProviderID, isSkillsPersonalProviderID, skillsBaseProviderID } from "@/auth/skills-shared"
import { SkillsModelPolicy } from "./model-policy"

export type Info = {
  /** Providers with org-shared credentials available (base ids). */
  providerIds: string[]
  /** Providers the user also configured personally (auth.json). */
  personalIds: string[]
  /** Allowed models per shared provider id (empty list = none). */
  modelsByProvider: Record<string, string[]>
}

const DEFAULT: Info = { providerIds: [], personalIds: [], modelsByProvider: {} }

type Cache = {
  mtimeKey: string
  info: Info
}

let cache: Cache | undefined

function orgMarkerPaths(): string[] {
  return [
    path.join(ConfigManaged.managedConfigDir(), "skills-org-providers.json"),
    path.join(Global.Path.config, "skills-org-providers.json"),
    path.join(Global.Path.data, "skills-org-providers.json"),
  ]
}

function personalAuthPath() {
  return path.join(Global.Path.data, "auth.json")
}

function parseOrgIds(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return []
  const obj = raw as Record<string, unknown>
  const ids = Array.isArray(obj.provider_ids)
    ? obj.provider_ids
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : []
  return [...new Set(ids)]
}

function parseModelsByProvider(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {}
  const obj = raw as Record<string, unknown>
  const models = obj.models
  if (!models || typeof models !== "object" || Array.isArray(models)) return {}
  const out: Record<string, string[]> = {}
  for (const [providerID, value] of Object.entries(models as Record<string, unknown>)) {
    const id = providerID.trim().toLowerCase()
    if (!id) continue
    if (!Array.isArray(value)) continue
    out[id] = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return out
}

function parsePersonalIds(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
  return Object.keys(raw as Record<string, unknown>)
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
}

function fileStamp(file: string): string {
  if (!existsSync(file)) return `${file}:missing`
  try {
    return `${file}:${statSync(file).mtimeMs}`
  } catch {
    return `${file}:err`
  }
}

function normalizeModelToken(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/\./g, "-")
}

function modelAllowed(entry: string, providerID: string, modelID: string): boolean {
  const normalizedEntry = entry.trim().toLowerCase()
  if (!normalizedEntry) return false
  const model = modelID.trim().toLowerCase()
  const provider = providerID.trim().toLowerCase()
  if (normalizedEntry === `${provider}/${model}`) return true
  if (normalizedEntry === model) return true
  if (normalizeModelToken(normalizedEntry) === normalizeModelToken(modelID)) return true
  const slash = normalizedEntry.indexOf("/")
  if (slash >= 0) {
    const entryModel = normalizedEntry.slice(slash + 1)
    return normalizeModelToken(entryModel) === normalizeModelToken(modelID)
  }
  return false
}

function load(): Info {
  let providerIds: string[] = []
  let modelsByProvider: Record<string, string[]> = {}
  for (const file of orgMarkerPaths()) {
    if (!existsSync(file)) continue
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"))
      providerIds = parseOrgIds(raw)
      modelsByProvider = parseModelsByProvider(raw)
      if (providerIds.length > 0 || Object.keys(modelsByProvider).length > 0) break
    } catch {
      continue
    }
  }

  let personalIds: string[] = []
  const authFile = personalAuthPath()
  if (existsSync(authFile)) {
    try {
      personalIds = parsePersonalIds(JSON.parse(readFileSync(authFile, "utf8")))
    } catch {
      personalIds = []
    }
  }

  return { providerIds, personalIds, modelsByProvider }
}

export function current(): Info {
  const mtimeKey = [...orgMarkerPaths(), personalAuthPath()].map(fileStamp).join("|")
  if (cache && cache.mtimeKey === mtimeKey) return cache.info
  const info = load()
  cache = { mtimeKey, info }
  return info
}

/** Show 共享 on the org-owned provider id (canonical id, or legacy `.skills-shared`). */
export function isSharedProvider(providerID: string): boolean {
  const id = providerID.trim().toLowerCase()
  if (!id) return false
  const info = current()
  const base = skillsBaseProviderID(id).toLowerCase()
  if (!info.providerIds.includes(base)) return false
  if (isSkillsPersonalProviderID(id)) return false
  if (isSkillsSharedProviderID(id)) return true
  // Org owns the real id; personal leftovers (if any) live under `.skills-personal`.
  return true
}

/** Personal entry demoted when org also provides the same provider. */
export function isPersonalOverrideProvider(providerID: string): boolean {
  const id = providerID.trim().toLowerCase()
  if (!id || isSkillsSharedProviderID(id)) return false
  if (isSkillsPersonalProviderID(id)) return true
  const info = current()
  // Legacy: before org-wins, personal kept the real id alongside org share.
  return info.providerIds.includes(id) && info.personalIds.includes(id)
}

/**
 * Allowed models for an org-shared provider instance.
 * Returns null when this provider instance is not org-shared (no filtering).
 * Returns [] when shared but no models configured (hide all).
 */
export function allowedModelsForSharedProvider(providerID: string): string[] | null {
  if (!isSharedProvider(providerID)) return null
  const base = skillsBaseProviderID(providerID).toLowerCase()
  const info = current()
  return info.modelsByProvider[base] ?? []
}

export function isModelAllowedForSharedProvider(providerID: string, modelID: string): boolean {
  const allow = allowedModelsForSharedProvider(providerID)
  if (allow === null) return true
  const base = skillsBaseProviderID(providerID)
  // Always keep the org coding vision model usable for DeepSeek/personal text models
  // that route screenshots through the VL describe pipeline.
  const visionRaw = SkillsModelPolicy.current().codingVisionModel?.trim()
  if (visionRaw) {
    const slash = visionRaw.indexOf("/")
    if (slash > 0) {
      const visionProvider = skillsBaseProviderID(visionRaw.slice(0, slash)).toLowerCase()
      const visionModel = visionRaw.slice(slash + 1).trim()
      if (visionProvider === base.toLowerCase() && modelAllowed(visionModel, base, modelID)) {
        return true
      }
    }
  }
  if (allow.length === 0) return false
  return allow.some((entry) => modelAllowed(entry, base, modelID))
}
