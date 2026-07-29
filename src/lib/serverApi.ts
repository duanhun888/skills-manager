import { invoke } from "@tauri-apps/api/core";
import { getErrorMessage } from "./error";

/** Default central API URL for local / open-source builds (user can change in Settings). */
export const DEFAULT_SERVER_API_URL = "http://127.0.0.1:8088";

/**
 * When true, always use DEFAULT_SERVER_API_URL and hide the Settings URL editor.
 * Keep false for public builds so each org configures its own server.
 */
export const SERVER_API_URL_FIXED = false;

export const AUTH_TOKEN_KEY = "skills_manager_auth_token";

export interface ServerUser {
  id: string;
  username: string;
  display_name: string;
  roles: string;
}

export interface LoginResult {
  user: ServerUser;
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface PermissionDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  group_name: string;
}

export interface RoleDto {
  id: number;
  code: string;
  name: string;
  is_system: number;
  permissions: string;
}

export interface ServerUserListItem {
  id: string;
  username: string;
  display_name: string;
  status: string;
  roles: string;
}

export interface ServerProject {
  id: string;
  name: string;
  repo_url: string | null;
  owner_user_id: string;
  owner_username: string;
  created_at: string;
}

export interface ServerSkillUpdater {
  username: string | null;
  display_name: string | null;
  action: string;
  created_at: string;
}

export interface ServerSkill {
  id: string;
  scope: string;
  name: string;
  description: string | null;
  category?: string | null;
  owner_user_id: string | null;
  owner_username?: string | null;
  owner_display_name?: string | null;
  creator_username?: string | null;
  creator_display_name?: string | null;
  recent_updaters?: ServerSkillUpdater[];
  project_id: string | null;
  project_name?: string | null;
  git_remote: string | null;
  git_path: string | null;
  content_hash: string | null;
  has_content: boolean;
  has_icon?: boolean;
  content_size: number | null;
  content_updated_at: string | null;
  can_write: boolean;
  can_admin?: boolean;
  status?: string;
  created_at: string;
}

export interface ServerPublicConfig {
  obs_enabled: boolean;
  max_content_bytes: number;
  model_policy_mode?: "open" | "restricted" | string;
  requirements_only_models?: string[];
}

export class ServerApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function login(
  baseUrl: string,
  username: string,
  password: string
): Promise<LoginResult> {
  return invoke<LoginResult>("server_login", {
    baseUrl: normalizeBaseUrl(baseUrl),
    username,
    password,
  });
}

export async function fetchMe(baseUrl: string, token: string): Promise<ServerUser> {
  return invoke<ServerUser>("server_fetch_me", {
    baseUrl: normalizeBaseUrl(baseUrl),
    token,
  });
}

export async function fetchPermissions(baseUrl: string, token: string): Promise<string[]> {
  return serverRequest<string[]>(baseUrl, token, "GET", "/api/v1/auth/permissions");
}

export async function fetchUsers(
  baseUrl: string,
  token: string
): Promise<ServerUserListItem[]> {
  return serverRequest<ServerUserListItem[]>(baseUrl, token, "GET", "/api/v1/users");
}

export async function createUser(
  baseUrl: string,
  token: string,
  body: {
    username: string;
    password: string;
    display_name: string;
    roles: string[];
  }
): Promise<{ id: string }> {
  return serverRequest<{ id: string }>(baseUrl, token, "POST", "/api/v1/users", body);
}

export async function updateUser(
  baseUrl: string,
  token: string,
  userId: string,
  body: {
    display_name?: string;
    status?: "active" | "disabled";
    roles?: string[];
    password?: string;
  }
): Promise<ServerUserListItem> {
  return serverRequest<ServerUserListItem>(
    baseUrl,
    token,
    "PATCH",
    `/api/v1/users/${userId}`,
    body
  );
}

export async function deleteUser(
  baseUrl: string,
  token: string,
  userId: string
): Promise<void> {
  await serverRequest(baseUrl, token, "DELETE", `/api/v1/users/${userId}`);
}

export async function fetchMyProjects(
  baseUrl: string,
  token: string
): Promise<ServerProject[]> {
  return serverRequest<ServerProject[]>(baseUrl, token, "GET", "/api/v1/projects?mine=true");
}

export async function createServerProject(
  baseUrl: string,
  token: string,
  name: string,
  ownerUserId: string
): Promise<ServerProject> {
  return serverRequest<ServerProject>(baseUrl, token, "POST", "/api/v1/projects", {
    name,
    owner_user_id: ownerUserId,
  });
}

export interface SkillHistoryEntry {
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
}

export async function fetchSkillHistory(
  baseUrl: string,
  token: string,
  serverSkillId: string
): Promise<SkillHistoryEntry[]> {
  return serverRequest<SkillHistoryEntry[]>(
    baseUrl,
    token,
    "GET",
    `/api/v1/skills/${serverSkillId}/history`
  );
}

/** True when central API includes the `category` field (v9+ server). */
export function serverSkillHasCategoryField(skill: ServerSkill): boolean {
  return Object.prototype.hasOwnProperty.call(skill, "category");
}

export function applyServerSkillPatch(
  skills: ServerSkill[],
  updated: ServerSkill
): ServerSkill[] {
  return skills.map((skill) =>
    skill.id === updated.id ? { ...skill, ...updated } : skill
  );
}

export async function fetchServerSkills(
  baseUrl: string,
  token: string,
  scope?: string,
  includeDisabled?: boolean,
  category?: string
): Promise<ServerSkill[]> {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (category) params.set("category", category);
  if (includeDisabled) params.set("include_disabled", "true");
  const qs = params.toString();
  const path = qs ? `/api/v1/skills?${qs}` : "/api/v1/skills";
  return serverRequest<ServerSkill[]>(baseUrl, token, "GET", path);
}

/** Parse HTTP status from Tauri network errors like `请求失败 (405 Method Not Allowed):`. */
export function getHttpStatusFromError(error: unknown): number | undefined {
  const message = getErrorMessage(error, "");
  const match = message.match(/\((\d{3})\b/);
  return match ? Number(match[1]) : undefined;
}

/** Central API too old to delete skills (DELETE 405 and POST fallback missing). */
export class ServerDeleteUnsupportedError extends Error {
  constructor() {
    super("SERVER_DELETE_UNSUPPORTED");
    this.name = "ServerDeleteUnsupportedError";
  }
}

/** Central API too old to persist skill categories. */
export class ServerCategoryUnsupportedError extends Error {
  constructor() {
    super("SERVER_CATEGORY_UNSUPPORTED");
    this.name = "ServerCategoryUnsupportedError";
  }
}

export async function deleteServerSkill(
  baseUrl: string,
  token: string,
  serverSkillId: string
): Promise<void> {
  try {
    await serverRequest(baseUrl, token, "DELETE", `/api/v1/skills/${serverSkillId}`);
  } catch (deleteError: unknown) {
    const deleteStatus = getHttpStatusFromError(deleteError);
    if (deleteStatus === 405) {
      try {
        await serverRequest(
          baseUrl,
          token,
          "POST",
          `/api/v1/skills/${serverSkillId}/delete`
        );
        return;
      } catch (postError: unknown) {
        const postStatus = getHttpStatusFromError(postError);
        if (postStatus === 404 || postStatus === 405) {
          throw new ServerDeleteUnsupportedError();
        }
        throw postError;
      }
    }
    throw deleteError;
  }
}

export async function setServerSkillStatus(
  baseUrl: string,
  token: string,
  serverSkillId: string,
  status: "active" | "disabled"
): Promise<ServerSkill> {
  return serverRequest<ServerSkill>(
    baseUrl,
    token,
    "PATCH",
    `/api/v1/skills/${serverSkillId}`,
    { status }
  );
}

export async function fetchServerPublicConfig(
  baseUrl: string
): Promise<ServerPublicConfig> {
  return invoke<ServerPublicConfig>("server_fetch_public_config", {
    baseUrl: normalizeBaseUrl(baseUrl),
  });
}

export async function updateServerModelPolicy(
  baseUrl: string,
  token: string,
  body: {
    mode: "open" | "restricted";
    requirements_only_models?: string[];
  }
): Promise<ServerPublicConfig> {
  const base = normalizeBaseUrl(baseUrl);
  try {
    return await serverRequest<ServerPublicConfig>(
      base,
      token,
      "POST",
      "/api/v1/server/model-policy",
      body
    );
  } catch (err) {
    const status = getHttpStatusFromError(err);
    // Older builds only had PATCH /server/config; remote old builds have neither.
    if (status === 404 || status === 405) {
      try {
        return await serverRequest<ServerPublicConfig>(
          base,
          token,
          "PATCH",
          "/api/v1/server/config",
          body
        );
      } catch (err2) {
        const status2 = getHttpStatusFromError(err2);
        if (status2 === 404 || status2 === 405) {
          throw new ServerApiError(
            status2 ?? 404,
            `当前中央服务 (${base}) 版本过旧，不支持模型策略保存。请部署最新 skills-manager-server 后重试。`
          );
        }
        throw err2;
      }
    }
    throw err;
  }
}

export async function serverRequest<T>(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const result = await invoke<unknown>("server_api_request", {
    baseUrl: normalizeBaseUrl(baseUrl),
    token,
    method,
    path,
    body: body ?? null,
  });
  return result as T;
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    return await invoke<boolean>("server_health", {
      baseUrl: normalizeBaseUrl(baseUrl),
    });
  } catch {
    return false;
  }
}

export function parseRolePermissions(permissions: string): string[] {
  return permissions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function userIsOps(user: ServerUser | null): boolean {
  if (!user?.roles) return false;
  return user.roles.split(",").some((r) => r.trim() === "ops");
}

export function canPermission(
  permissions: string[],
  user: ServerUser | null,
  code: string
): boolean {
  if (userIsOps(user)) return true;
  return permissions.includes(code);
}
