import { batch, createMemo, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { Persist, persisted } from "@/utils/persist"
import { uuid } from "@/utils/uuid"
import { buildSectionsFromHandoffMessages } from "./analyze"
import { defaultDocumentMarkdown } from "./document-template"
import type {
  RequirementAsset,
  RequirementChatMessage,
  RequirementCreateInput,
  RequirementIntegration,
  RequirementApiRef,
  RequirementProject,
  RequirementsStore,
} from "./types"
import { inheritSystemIntegration, isSharedIntegrationEmpty } from "./apifox"
import { EMPTY_INTEGRATION } from "./types"

function migrateApis(value: unknown): RequirementApiRef[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).flatMap((item) => {
    const path = typeof item.path === "string" ? item.path : typeof item.name === "string" ? item.name : ""
    if (!path.trim() && typeof item.name !== "string") return []
    return [
      {
        id: typeof item.id === "string" ? item.id : uuid(),
        method: typeof item.method === "string" ? item.method : "POST",
        path: typeof item.path === "string" ? item.path : "",
        name: typeof item.name === "string" ? item.name : "",
        requestSummary: typeof item.requestSummary === "string" ? item.requestSummary : undefined,
        responseSummary: typeof item.responseSummary === "string" ? item.responseSummary : undefined,
      },
    ]
  })
}

function migrateIntegration(value: unknown): RequirementIntegration {
  if (!isRecord(value)) return { ...EMPTY_INTEGRATION }
  return {
    envName: typeof value.envName === "string" ? value.envName : "",
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    apifoxUrl: typeof value.apifoxUrl === "string" ? value.apifoxUrl : "",
    apifoxProjectId: typeof value.apifoxProjectId === "string" ? value.apifoxProjectId : "",
    apifoxFolderId: typeof value.apifoxFolderId === "string" ? value.apifoxFolderId : "",
    apifoxAccessToken: typeof value.apifoxAccessToken === "string" ? value.apifoxAccessToken : "",
    tapdUrl: typeof value.tapdUrl === "string" ? value.tapdUrl : "",
    tapdWorkspaceId: typeof value.tapdWorkspaceId === "string" ? value.tapdWorkspaceId : "",
    tapdStoryUrl: typeof value.tapdStoryUrl === "string" ? value.tapdStoryUrl : "",
    tapdAccessToken: typeof value.tapdAccessToken === "string" ? value.tapdAccessToken : "",
    notes: typeof value.notes === "string" ? value.notes : "",
    apis: migrateApis(value.apis),
  }
}

function createProject(partial?: Partial<RequirementProject>): RequirementProject {
  const now = Date.now()
  return {
    id: partial?.id ?? uuid(),
    title: partial?.title ?? "Untitled requirement",
    systemDirectory: partial?.systemDirectory,
    systemName: partial?.systemName,
    document: partial?.document ?? defaultDocumentMarkdown(),
    assistantNotes: partial?.assistantNotes ?? "",
    integration: partial?.integration
      ? {
          ...EMPTY_INTEGRATION,
          ...partial.integration,
          apis: partial.integration.apis ?? [],
        }
      : { ...EMPTY_INTEGRATION, apis: [] },
    messages: partial?.messages ?? [],
    handoffMessageIds: partial?.handoffMessageIds ?? [],
    analysisSessionID: partial?.analysisSessionID,
    assets: partial?.assets ?? [],
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function migrateAttachments(value: unknown): RequirementChatMessage["attachments"] {
  if (!Array.isArray(value)) return
  const items = value.filter(isRecord).flatMap((item) => {
    if (typeof item.assetId !== "string" || typeof item.filename !== "string") return []
    return [
      {
        assetId: item.assetId,
        filename: item.filename,
        mime: typeof item.mime === "string" ? item.mime : "application/octet-stream",
        previewUrl: typeof item.previewUrl === "string" ? item.previewUrl : undefined,
      },
    ]
  })
  return items.length > 0 ? items : undefined
}

function migrateSections(value: unknown): RequirementChatMessage["sections"] {
  if (!isRecord(value)) return
  const next = {
    goal: typeof value.goal === "string" ? value.goal : "",
    pages: typeof value.pages === "string" ? value.pages : "",
    interactions: typeof value.interactions === "string" ? value.interactions : "",
    copy: typeof value.copy === "string" ? value.copy : "",
    constraints: typeof value.constraints === "string" ? value.constraints : "",
    acceptance: typeof value.acceptance === "string" ? value.acceptance : "",
  }
  if (!Object.values(next).some((part) => part.trim())) return
  return next
}

function migrateMessages(value: unknown): RequirementChatMessage[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).flatMap((item) => {
    if (item.role !== "user" && item.role !== "assistant") return []
    if (typeof item.content !== "string") return []
    return [
      {
        id: typeof item.id === "string" ? item.id : uuid(),
        role: item.role,
        content: item.content,
        at: typeof item.at === "number" ? item.at : Date.now(),
        attachments: migrateAttachments(item.attachments),
        sections: migrateSections(item.sections),
      },
    ]
  })
}

function migrate(value: unknown): RequirementsStore {
  if (!isRecord(value)) return { projects: [] }
  const projects = Array.isArray(value.projects)
    ? value.projects
        .filter(isRecord)
        .map((item) =>
          createProject({
            id: typeof item.id === "string" ? item.id : undefined,
            title: typeof item.title === "string" ? item.title : undefined,
            systemDirectory: typeof item.systemDirectory === "string" ? item.systemDirectory : undefined,
            systemName: typeof item.systemName === "string" ? item.systemName : undefined,
            document: typeof item.document === "string" ? item.document : undefined,
            assistantNotes: typeof item.assistantNotes === "string" ? item.assistantNotes : undefined,
            integration: migrateIntegration(item.integration),
            messages: migrateMessages(item.messages),
            handoffMessageIds: Array.isArray(item.handoffMessageIds)
              ? item.handoffMessageIds.filter((id): id is string => typeof id === "string")
              : [],
            analysisSessionID:
              typeof item.analysisSessionID === "string" ? item.analysisSessionID : undefined,
            assets: Array.isArray(item.assets)
              ? item.assets.filter(isRecord).map((asset) => ({
                  id: typeof asset.id === "string" ? asset.id : uuid(),
                  filename: typeof asset.filename === "string" ? asset.filename : "image.png",
                  mime: typeof asset.mime === "string" ? asset.mime : "image/png",
                  dataUrl: typeof asset.dataUrl === "string" ? asset.dataUrl : "",
                  note: typeof asset.note === "string" ? asset.note : "",
                  createdAt: typeof asset.createdAt === "number" ? asset.createdAt : Date.now(),
                }))
              : [],
            createdAt: typeof item.createdAt === "number" ? item.createdAt : undefined,
            updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : undefined,
          }),
        )
        .filter((item) => item.assets.every((asset) => asset.dataUrl.startsWith("data:")))
    : []
  const activeId = typeof value.activeId === "string" ? value.activeId : undefined
  return {
    projects,
    activeId: activeId && projects.some((p) => p.id === activeId) ? activeId : projects[0]?.id,
  }
}

export const { use: useRequirements, provider: RequirementsProvider } = createSimpleContext({
  name: "Requirements",
  gate: false,
  init: () => {
    const [store, setStore, , ready] = persisted(
      { ...Persist.global("requirements", ["requirements.v1"]), migrate },
      createStore<RequirementsStore>({ projects: [] }),
    )

    const projects = createMemo(() => [...store.projects].sort((a, b) => b.updatedAt - a.updatedAt))
    const active = createMemo(() => projects().find((item) => item.id === store.activeId))

    const touch = (id: string) => {
      const index = store.projects.findIndex((item) => item.id === id)
      if (index < 0) return
      setStore("projects", index, "updatedAt", Date.now())
    }

    const projectIndex = (id: string) => store.projects.findIndex((item) => item.id === id)

    return {
      ready,
      projects,
      active,
      activeId: createMemo(() => store.activeId),
      create(input?: string | RequirementCreateInput) {
        const options = typeof input === "string" ? { title: input } : (input ?? {})
        const inherited = inheritSystemIntegration(store.projects, options.systemDirectory)
        const project = createProject({
          title: options.title?.trim() || "Untitled requirement",
          systemDirectory: options.systemDirectory,
          systemName: options.systemName,
          integration: inherited,
        })
        batch(() => {
          setStore(
            produce((draft) => {
              draft.projects.unshift(project)
              draft.activeId = project.id
            }),
          )
        })
        return project
      },
      select(id: string) {
        if (!store.projects.some((item) => item.id === id)) return
        setStore("activeId", id)
      },
      remove(id: string) {
        setStore(
          produce((draft) => {
            draft.projects = draft.projects.filter((item) => item.id !== id)
            if (draft.activeId === id) draft.activeId = draft.projects[0]?.id
          }),
        )
      },
      rename(id: string, title: string) {
        const index = projectIndex(id)
        if (index < 0) return
        setStore("projects", index, "title", title)
        touch(id)
      },
      setSystem(id: string, system: { directory?: string; name?: string } | undefined) {
        const index = projectIndex(id)
        if (index < 0) return
        const previousDirectory = store.projects[index]?.systemDirectory
        const nextDirectory = system?.directory
        setStore("projects", index, "systemDirectory", nextDirectory)
        setStore("projects", index, "systemName", system?.name)

        const current = store.projects[index]?.integration ?? EMPTY_INTEGRATION
        const inherited = inheritSystemIntegration(store.projects, nextDirectory, id)
        if (inherited) {
          const sameSystem = previousDirectory === nextDirectory
          const shouldFillShared = isSharedIntegrationEmpty(current)
          if (shouldFillShared || !sameSystem) {
            setStore("projects", index, "integration", {
              ...inherited,
              // Keep APIs when staying on the same system; clear when switching systems
              apis: sameSystem ? current.apis : [],
            })
          }
        } else if (previousDirectory !== nextDirectory) {
          // Different system with no defaults — drop previous APIs (likely wrong project)
          setStore("projects", index, "integration", { ...current, apis: [] })
        }
        touch(id)
      },
      setDocument(id: string, document: string) {
        const index = projectIndex(id)
        if (index < 0) return
        setStore("projects", index, "document", document)
        touch(id)
      },
      setAssistantNotes(id: string, notes: string) {
        const index = projectIndex(id)
        if (index < 0) return
        setStore("projects", index, "assistantNotes", notes)
        touch(id)
      },
      setIntegration(id: string, patch: Partial<RequirementIntegration>) {
        const index = projectIndex(id)
        if (index < 0) return
        const current = store.projects[index]?.integration ?? EMPTY_INTEGRATION
        setStore("projects", index, "integration", { ...current, ...patch })
        touch(id)
      },
      setAnalysisSessionID(id: string, sessionID: string | undefined) {
        const index = projectIndex(id)
        if (index < 0) return
        setStore("projects", index, "analysisSessionID", sessionID)
        touch(id)
      },
      appendMessage(id: string, message: Omit<RequirementChatMessage, "id" | "at"> & { id?: string; at?: number }) {
        const index = projectIndex(id)
        if (index < 0) return
        const next: RequirementChatMessage = {
          id: message.id ?? uuid(),
          role: message.role,
          content: message.content,
          at: message.at ?? Date.now(),
          attachments: message.attachments?.length ? message.attachments : undefined,
          sections: message.sections,
        }
        setStore(
          produce((draft) => {
            draft.projects[index]?.messages.push(next)
            if (draft.projects[index]) draft.projects[index].updatedAt = Date.now()
          }),
        )
        return next
      },
      syncSpecFromHandoff(id: string) {
        const index = projectIndex(id)
        if (index < 0) return
        const project = store.projects[index]
        if (!project) return
        const selected = new Set(project.handoffMessageIds ?? [])
        const messages = selected.size
          ? project.messages.filter((message) => selected.has(message.id))
          : []
        const sections = buildSectionsFromHandoffMessages(messages)
        setStore("projects", index, "document", defaultDocumentMarkdown(sections))
        touch(id)
      },
      clearMessages(id: string) {
        const index = projectIndex(id)
        if (index < 0) return
        setStore("projects", index, "messages", [])
        setStore("projects", index, "handoffMessageIds", [])
        setStore("projects", index, "analysisSessionID", undefined)
        setStore("projects", index, "document", defaultDocumentMarkdown())
        touch(id)
      },
      toggleHandoffMessage(id: string, messageId: string) {
        const index = projectIndex(id)
        if (index < 0) return
        const current = store.projects[index]?.handoffMessageIds ?? []
        const next = current.includes(messageId)
          ? current.filter((item) => item !== messageId)
          : [...current, messageId]
        setStore("projects", index, "handoffMessageIds", next)
        // Rebuild Spec from checked messages only (empty selection → empty Spec).
        const project = store.projects[index]
        if (project) {
          const selected = new Set(next)
          const messages = project.messages.filter((message) => selected.has(message.id))
          setStore(
            "projects",
            index,
            "document",
            defaultDocumentMarkdown(buildSectionsFromHandoffMessages(messages)),
          )
        }
        touch(id)
      },
      setHandoffMessages(id: string, messageIds: string[]) {
        const index = projectIndex(id)
        if (index < 0) return
        setStore("projects", index, "handoffMessageIds", messageIds)
        const project = store.projects[index]
        if (project) {
          const selected = new Set(messageIds)
          const messages = project.messages.filter((message) => selected.has(message.id))
          setStore(
            "projects",
            index,
            "document",
            defaultDocumentMarkdown(buildSectionsFromHandoffMessages(messages)),
          )
        }
        touch(id)
      },
      addAsset(id: string, asset: Omit<RequirementAsset, "id" | "createdAt" | "note"> & { note?: string }) {
        const index = projectIndex(id)
        if (index < 0) return
        const next: RequirementAsset = {
          id: uuid(),
          filename: asset.filename,
          mime: asset.mime,
          dataUrl: asset.dataUrl,
          note: asset.note ?? "",
          createdAt: Date.now(),
        }
        setStore(
          produce((draft) => {
            draft.projects[index]?.assets.unshift(next)
            if (draft.projects[index]) draft.projects[index].updatedAt = Date.now()
          }),
        )
        return next
      },
      updateAssetNote(id: string, assetId: string, note: string) {
        const index = projectIndex(id)
        if (index < 0) return
        const assetIndex = store.projects[index]?.assets.findIndex((item) => item.id === assetId) ?? -1
        if (assetIndex < 0) return
        setStore("projects", index, "assets", assetIndex, "note", note)
        touch(id)
      },
      removeAsset(id: string, assetId: string) {
        const index = projectIndex(id)
        if (index < 0) return
        setStore(
          produce((draft) => {
            const project = draft.projects[index]
            if (!project) return
            project.assets = project.assets.filter((item) => item.id !== assetId)
            project.updatedAt = Date.now()
          }),
        )
      },
    }
  },
})

export type RequirementsContext = ReturnType<typeof useRequirements>

export function RequirementsScope(props: ParentProps) {
  return <RequirementsProvider>{props.children}</RequirementsProvider>
}
