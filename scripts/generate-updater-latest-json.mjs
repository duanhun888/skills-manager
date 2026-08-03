#!/usr/bin/env node
/**
 * Build and upload Tauri updater latest.json for a GitHub Release.
 * Used after matrix builds so parallel tauri-action jobs don't race on latest.json.
 *
 * Usage: node scripts/generate-updater-latest-json.mjs <tag>
 * Env: GITHUB_TOKEN or GH_TOKEN, GITHUB_REPOSITORY (owner/repo)
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tag = process.argv[2]
if (!tag) {
  console.error("Usage: node scripts/generate-updater-latest-json.mjs <tag>")
  process.exit(1)
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const repo = process.env.GITHUB_REPOSITORY
if (!token || !repo) {
  console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required")
  process.exit(1)
}

const version = tag.replace(/^v/, "")
const api = "https://api.github.com"
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "skills-manager-updater-json",
}

async function gh(path, init = {}) {
  const res = await fetch(`${api}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${body}`)
  }
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

function pick(assets, predicates) {
  for (const pred of predicates) {
    const hit = assets.find(pred)
    if (hit) return hit
  }
  return undefined
}

const release = await gh(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`)
const assets = release.assets || []
console.log(
  "Release assets:",
  assets.map((a) => a.name).join(", "),
)

const darwinArm = pick(assets, [
  (a) => a.name.endsWith(".app.tar.gz") && a.name.includes("aarch64"),
  (a) => a.name === "Skills._aarch64.app.tar.gz",
])
const darwinX64 = pick(assets, [
  (a) => a.name.endsWith(".app.tar.gz") && (a.name.includes("_x64.") || a.name.includes("x64.app")),
  (a) => a.name === "Skills._x64.app.tar.gz",
])
const linux = pick(assets, [
  (a) => a.name.endsWith(".AppImage") && !a.name.endsWith(".sig"),
])
const windows = pick(assets, [
  (a) => a.name.endsWith("-setup.exe") && !a.name.endsWith(".sig"),
  (a) => a.name.endsWith(".nsis.zip"),
])

const platforms = {}
async function addPlatform(key, asset) {
  if (!asset) {
    console.warn(`skip ${key}: asset not found`)
    return
  }
  const sigAsset = assets.find((a) => a.name === `${asset.name}.sig`)
  if (!sigAsset) {
    console.warn(`skip ${key}: missing ${asset.name}.sig`)
    return
  }
  const sigRes = await fetch(sigAsset.browser_download_url, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "User-Agent": "skills-manager-updater-json",
    },
    redirect: "follow",
  })
  if (!sigRes.ok) {
    throw new Error(`download ${sigAsset.name} -> ${sigRes.status}`)
  }
  const signature = (await sigRes.text()).trim()
  platforms[key] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${asset.name}`,
  }
  console.log(`ok ${key} <- ${asset.name}`)
}

await addPlatform("darwin-aarch64", darwinArm)
await addPlatform("darwin-x86_64", darwinX64)
await addPlatform("linux-x86_64", linux)
await addPlatform("windows-x86_64", windows)

if (Object.keys(platforms).length === 0) {
  throw new Error("no updater platforms found")
}

const latest = {
  version,
  notes: `芯宏Skills仓库 v${version}`,
  pub_date: new Date().toISOString(),
  platforms,
}

const dir = join(tmpdir(), "skills-updater-json")
mkdirSync(dir, { recursive: true })
const file = join(dir, "latest.json")
writeFileSync(file, `${JSON.stringify(latest, null, 2)}\n`, "utf8")
console.log("wrote", file)

const existing = assets.find((a) => a.name === "latest.json")
if (existing) {
  await gh(`/repos/${repo}/releases/assets/${existing.id}`, { method: "DELETE" })
  console.log("deleted previous latest.json")
}

const uploadUrl = release.upload_url.replace(/\{.*\}$/, "")
const uploadRes = await fetch(
  `${uploadUrl}?name=${encodeURIComponent("latest.json")}`,
  {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: readFileSync(file),
  },
)
if (!uploadRes.ok) {
  throw new Error(`upload latest.json -> ${uploadRes.status}: ${await uploadRes.text()}`)
}
console.log("uploaded latest.json to", tag)
