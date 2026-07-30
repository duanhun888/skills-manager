export * as SkillsOrgProviders from "./org-providers"

import { existsSync, readFileSync, statSync } from "fs"
import path from "path"
import { ConfigManaged } from "./managed"
import { Global } from "@opencode-ai/core/global"

export type Info = {
  /** Providers with org-shared credentials available. */
  providerIds: string[]
}

const DEFAULT: Info = { providerIds: [] }

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

function fileStamp(file: string): string {
  if (!existsSync(file)) return `${file}:missing`
  try {
    return `${file}:${statSync(file).mtimeMs}`
  } catch {
    return `${file}:err`
  }
}

function load(): Info {
  for (const file of orgMarkerPaths()) {
    if (!existsSync(file)) continue
    try {
      const providerIds = parseOrgIds(JSON.parse(readFileSync(file, "utf8")))
      if (providerIds.length > 0) return { providerIds }
    } catch {
      continue
    }
  }
  return DEFAULT
}

export function current(): Info {
  const mtimeKey = orgMarkerPaths().map(fileStamp).join("|")
  if (cache && cache.mtimeKey === mtimeKey) return cache.info
  const info = load()
  cache = { mtimeKey, info }
  return info
}

/** Org shared credential exists for this provider — show as 共享 alongside any personal/custom providers. */
export function isSharedProvider(providerID: string): boolean {
  const id = providerID.trim().toLowerCase()
  if (!id) return false
  return current().providerIds.includes(id)
}
