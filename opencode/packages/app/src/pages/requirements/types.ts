import type { RequirementSections } from "./document-template"

export type RequirementAsset = {
  id: string
  filename: string
  mime: string
  dataUrl: string
  note: string
  createdAt: number
}

/** Snapshot of materials attached to a chat turn (shown like coding user-message attachments). */
export type RequirementMessageAttachment = {
  assetId: string
  filename: string
  mime: string
  /** Image preview data URL; omitted for documents */
  previewUrl?: string
}

export type RequirementChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  at: number
  attachments?: RequirementMessageAttachment[]
  /** Structured Spec payload from analysis — Spec panel is filled only when this message is checked */
  sections?: RequirementSections
}

/** One backend API this requirement will call during 联调 */
export type RequirementApiRef = {
  id: string
  method: string
  path: string
  name: string
  /** Compact request params / body summary from OpenAPI (optional) */
  requestSummary?: string
  /** Compact response summary from OpenAPI (optional) */
  responseSummary?: string
}

/** Frontend 联调 / API environment — product-side pointers, not secrets */
export type RequirementIntegration = {
  /** e.g. test / staging / mock */
  envName: string
  /** API Base URL (non-secret) */
  baseUrl: string
  /** Apifox project or doc link */
  apifoxUrl: string
  /** Apifox project id for MCP (`--project-id=`) */
  apifoxProjectId: string
  /** Apifox folder / directory id — import only this folder (and children). Empty = whole project. */
  apifoxFolderId: string
  /** Apifox API access token (local only; never sent in coding brief) */
  apifoxAccessToken: string
  /** TAPD project / workspace link */
  tapdUrl: string
  /** TAPD workspace id */
  tapdWorkspaceId: string
  /** Optional story / bug / task link for this requirement */
  tapdStoryUrl: string
  /** TAPD personal access token (local only; never sent in coding brief) */
  tapdAccessToken: string
  /** Auth / proxy / header notes (no tokens) */
  notes: string
  /** APIs this requirement depends on (multi-select from Apifox) */
  apis: RequirementApiRef[]
}

export const EMPTY_INTEGRATION: RequirementIntegration = {
  envName: "",
  baseUrl: "",
  apifoxUrl: "",
  apifoxProjectId: "",
  apifoxFolderId: "",
  apifoxAccessToken: "",
  tapdUrl: "",
  tapdWorkspaceId: "",
  tapdStoryUrl: "",
  tapdAccessToken: "",
  notes: "",
  apis: [],
}

export type RequirementProject = {
  id: string
  title: string
  /** Bound coding project / system worktree */
  systemDirectory?: string
  /** Display name cached when bound (survives closed projects) */
  systemName?: string
  document: string
  assistantNotes: string
  integration: RequirementIntegration
  messages: RequirementChatMessage[]
  /** Message ids checked in analysis chat to include when sending to coding */
  handoffMessageIds: string[]
  analysisSessionID?: string
  assets: RequirementAsset[]
  createdAt: number
  updatedAt: number
}

export type RequirementCreateInput = {
  title?: string
  systemDirectory?: string
  systemName?: string
}

export type RequirementsStore = {
  projects: RequirementProject[]
  activeId?: string
}

export type { RequirementSections } from "./document-template"
