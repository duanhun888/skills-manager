export * as SkillsModelPolicy from "./model-policy"

import { existsSync, readFileSync, statSync } from "fs"
import path from "path"
import { ConfigManaged } from "./managed"
import { Global } from "@opencode-ai/core/global"

export type Mode = "open" | "restricted"

export type Info = {
  mode: Mode
  requirementsOnlyModels: string[]
  codingVisionModel?: string
  codingOcrUrl?: string
  codingImagePriority?: "ocr_then_vl" | "vl_then_ocr" | "ocr_only" | "vl_only"
}

const DEFAULT: Info = {
  mode: "open",
  requirementsOnlyModels: [],
}

type Cache = {
  orgPath: string
  orgMtimeMs: number
  userPath: string
  userMtimeMs: number
  info: Info
}

let cache: Cache | undefined

function candidatePaths(): string[] {
  const out: string[] = []
  const managed = path.join(ConfigManaged.managedConfigDir(), "skills-model-policy.json")
  const user = path.join(Global.Path.config, "skills-model-policy.json")
  // Managed (ProgramData / MDM) wins over user config.
  out.push(managed, user)
  return out
}

function userOverlayPaths(): string[] {
  return [
    path.join(ConfigManaged.managedConfigDir(), "skills-model-user-policy.json"),
    path.join(Global.Path.config, "skills-model-user-policy.json"),
  ]
}

function parsePriority(raw: unknown): Info["codingImagePriority"] | undefined {
  if (typeof raw !== "string") return undefined
  const priorityRaw = raw.trim().toLowerCase()
  if (
    priorityRaw === "vl_then_ocr" ||
    priorityRaw === "ocr_only" ||
    priorityRaw === "vl_only" ||
    priorityRaw === "ocr_then_vl"
  ) {
    return priorityRaw
  }
  return undefined
}

function normalizeKey(providerID: string, modelID: string) {
  return `${providerID.trim()}/${modelID.trim()}`.toLowerCase()
}

/** Turn "Qwen3.7 Plus" / "qwen3_7_plus" / "qwen3-7-plus" into a comparable token. */
function normalizeModelToken(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/\./g, "-")
}

/** Providers that commonly expose the same model under different IDs (CN vs intl, etc.). */
const PROVIDER_ALIAS_GROUPS: string[][] = [["alibaba", "alibaba-cn"]]

function providerAliases(providerID: string): string[] {
  const id = providerID.trim().toLowerCase()
  for (const group of PROVIDER_ALIAS_GROUPS) {
    if (group.includes(id)) return group
  }
  return [id]
}

/** Exported for unit tests — policy list entry vs live provider/model. */
export function entryMatches(entry: string, providerID: string, modelID: string) {
  const normalizedEntry = entry.trim().toLowerCase()
  if (!normalizedEntry) return false

  const model = modelID.trim().toLowerCase()
  const runtimeProvider = providerID
    .trim()
    .toLowerCase()
    .replace(/\.skills-shared$/i, "")
    .replace(/\.skills-personal$/i, "")
  const providers = providerAliases(runtimeProvider)
  for (const provider of providers) {
    if (normalizedEntry === normalizeKey(provider, modelID)) return true
  }

  // Bare model id: "qwen3.7-plus" blocks every provider surface of that model.
  if (normalizedEntry === model) return true
  if (normalizeModelToken(normalizedEntry) === normalizeModelToken(modelID)) return true

  // "alibaba/Qwen3.7 Plus" or "opencode/qwen3.7-plus" → match by model token only.
  // Provider typos in the admin list must not unblock the real runtime id (e.g. alibaba-cn).
  const slash = normalizedEntry.indexOf("/")
  const entryModel = slash >= 0 ? normalizedEntry.slice(slash + 1) : normalizedEntry
  if (normalizeModelToken(entryModel) === normalizeModelToken(modelID)) return true

  return false
}

function parse(raw: unknown): Info {
  if (!raw || typeof raw !== "object") return DEFAULT
  const obj = raw as Record<string, unknown>
  const mode = obj.mode === "restricted" ? "restricted" : "open"
  const models = Array.isArray(obj.requirements_only_models)
    ? obj.requirements_only_models
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const codingVision =
    typeof obj.coding_vision_model === "string" ? obj.coding_vision_model.trim() : ""
  const codingOcr =
    typeof obj.coding_ocr_url === "string" ? obj.coding_ocr_url.trim() : ""
  const codingImagePriority = parsePriority(obj.coding_image_priority)
  return {
    mode,
    requirementsOnlyModels: models,
    codingVisionModel: codingVision || undefined,
    codingOcrUrl: codingOcr || undefined,
    codingImagePriority,
  }
}

function loadOrgFromDisk(): { path: string; mtimeMs: number; info: Info } | undefined {
  for (const file of candidatePaths()) {
    if (!existsSync(file)) continue
    try {
      const st = statSync(file)
      const text = readFileSync(file, "utf8")
      return { path: file, mtimeMs: st.mtimeMs, info: parse(JSON.parse(text)) }
    } catch {
      continue
    }
  }
  return undefined
}

function loadUserOverlay(): { path: string; mtimeMs: number; priority?: Info["codingImagePriority"] } {
  for (const file of userOverlayPaths()) {
    if (!existsSync(file)) continue
    try {
      const st = statSync(file)
      const text = readFileSync(file, "utf8")
      const obj = JSON.parse(text) as Record<string, unknown>
      return { path: file, mtimeMs: st.mtimeMs, priority: parsePriority(obj.coding_image_priority) }
    } catch {
      continue
    }
  }
  return { path: "", mtimeMs: 0 }
}

/** Sync read with light mtime cache — safe for prompt guards and UI polls. */
export function current(): Info {
  const org = loadOrgFromDisk()
  const overlay = loadUserOverlay()
  const base = org?.info ?? DEFAULT
  const info: Info = overlay.priority
    ? { ...base, codingImagePriority: overlay.priority }
    : base

  if (
    cache &&
    cache.orgPath === (org?.path ?? "") &&
    cache.orgMtimeMs === (org?.mtimeMs ?? 0) &&
    cache.userPath === overlay.path &&
    cache.userMtimeMs === overlay.mtimeMs
  ) {
    return cache.info
  }

  cache = {
    orgPath: org?.path ?? "",
    orgMtimeMs: org?.mtimeMs ?? 0,
    userPath: overlay.path,
    userMtimeMs: overlay.mtimeMs,
    info,
  }
  return info
}

export function isRestricted(): boolean {
  return current().mode === "restricted"
}

export function isRequirementsOnlyModel(providerID: string, modelID: string): boolean {
  const policy = current()
  if (policy.mode !== "restricted") return false
  return policy.requirementsOnlyModels.some((entry) => entryMatches(entry, providerID, modelID))
}

/** Coding / non-requirements agents must not use requirements-only models in restricted mode. */
export function assertCodingModelAllowed(input: {
  agent: string
  providerID: string
  modelID: string
}): void {
  if (input.agent === "requirements") return
  if (!isRequirementsOnlyModel(input.providerID, input.modelID)) return
  throw new Error(
    `Model ${input.providerID}/${input.modelID} is restricted to the requirements workbench. Switch agent or pick another model.`,
  )
}
