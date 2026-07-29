export * as SkillsModelPolicy from "./model-policy"

import { existsSync, readFileSync, statSync } from "fs"
import path from "path"
import { ConfigManaged } from "./managed"
import { Global } from "@opencode-ai/core/global"

export type Mode = "open" | "restricted"

export type Info = {
  mode: Mode
  requirementsOnlyModels: string[]
}

const DEFAULT: Info = {
  mode: "open",
  requirementsOnlyModels: [],
}

type Cache = {
  mtimeMs: number
  path: string
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

function normalizeKey(providerID: string, modelID: string) {
  return `${providerID.trim()}/${modelID.trim()}`.toLowerCase()
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
  return { mode, requirementsOnlyModels: models }
}

function loadFromDisk(): { path: string; mtimeMs: number; info: Info } | undefined {
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

/** Sync read with light mtime cache — safe for prompt guards and UI polls. */
export function current(): Info {
  const loaded = loadFromDisk()
  if (!loaded) {
    cache = undefined
    return DEFAULT
  }
  if (cache && cache.path === loaded.path && cache.mtimeMs === loaded.mtimeMs) {
    return cache.info
  }
  cache = { path: loaded.path, mtimeMs: loaded.mtimeMs, info: loaded.info }
  return loaded.info
}

export function isRestricted(): boolean {
  return current().mode === "restricted"
}

export function isRequirementsOnlyModel(providerID: string, modelID: string): boolean {
  const policy = current()
  if (policy.mode !== "restricted") return false
  const key = normalizeKey(providerID, modelID)
  return policy.requirementsOnlyModels.some((entry) => entry.trim().toLowerCase() === key)
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
