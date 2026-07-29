import { createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { useServer } from "@/context/server"

export type SkillsModelPolicy = {
  mode: "open" | "restricted"
  requirements_only_models: string[]
}

const OPEN: SkillsModelPolicy = { mode: "open", requirements_only_models: [] }

function normalizeKey(providerID: string, modelID: string) {
  return `${providerID.trim()}/${modelID.trim()}`.toLowerCase()
}

async function fetchPolicy(baseUrl: string | undefined): Promise<SkillsModelPolicy> {
  if (!baseUrl) return OPEN
  try {
    const res = await fetch(new URL("/skills/model-policy", baseUrl).toString())
    if (!res.ok) return OPEN
    const data = (await res.json()) as Partial<SkillsModelPolicy>
    return {
      mode: data.mode === "restricted" ? "restricted" : "open",
      requirements_only_models: Array.isArray(data.requirements_only_models)
        ? data.requirements_only_models.filter((x): x is string => typeof x === "string")
        : [],
    }
  } catch {
    return OPEN
  }
}

/** Poll Skills model policy from the local OpenCode server. */
export function useSkillsModelPolicy() {
  const server = useServer()
  const [tick, setTick] = createSignal(0)
  const baseUrl = createMemo(() => server.current?.http.url)

  const [policy] = createResource(
    () => `${baseUrl() ?? ""}|${tick()}`,
    async () => fetchPolicy(baseUrl()),
    { initialValue: OPEN },
  )

  // Soft refresh so Skills policy edits apply without restarting OpenCode.
  const timer = window.setInterval(() => setTick((n) => n + 1), 15_000)
  onCleanup(() => window.clearInterval(timer))

  const current = createMemo(() => policy() ?? OPEN)

  const isCodingBlocked = (providerID: string, modelID: string) => {
    const p = current()
    if (p.mode !== "restricted") return false
    const key = normalizeKey(providerID, modelID)
    return p.requirements_only_models.some((entry) => entry.trim().toLowerCase() === key)
  }

  return { policy: current, isCodingBlocked }
}
