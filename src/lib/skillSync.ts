import type { ManagedSkill, SkillScope } from "./tauri";
import type { ServerSkill, ServerUser } from "./serverApi";
import {
  getStoredToken,
  getHttpStatusFromError,
  serverRequest,
  serverSkillHasCategoryField,
  ServerCategoryUnsupportedError,
} from "./serverApi";
import { invoke } from "@tauri-apps/api/core";

export interface PushSkillOptions {
  serverApiUrl: string;
  user: ServerUser;
  skill: ManagedSkill;
  scope: SkillScope;
  serverProjectId?: string | null;
}

function gitRemoteFromSkill(skill: ManagedSkill): string | null {
  return skill.source_ref_resolved ?? skill.source_ref;
}

export function buildServerSkillPayload(
  skill: ManagedSkill,
  scope: SkillScope,
  user: ServerUser,
  serverProjectId?: string | null
) {
  const payload: Record<string, unknown> = {
    scope,
    name: skill.name,
    description: skill.description,
    category: skill.category ?? null,
    git_remote: gitRemoteFromSkill(skill),
    git_path: skill.source_subpath,
    content_hash: skill.content_hash,
  };
  if (scope === "personal") {
    payload.owner_user_id = user.id;
  }
  if (scope === "project") {
    if (!serverProjectId) {
      throw new Error("project link required");
    }
    payload.project_id = serverProjectId;
  }
  return payload;
}

export async function createServerSkill(
  baseUrl: string,
  token: string,
  body: Record<string, unknown>
): Promise<ServerSkill> {
  return serverRequest<ServerSkill>(baseUrl, token, "POST", "/api/v1/skills", body);
}

export async function updateServerSkill(
  baseUrl: string,
  token: string,
  serverSkillId: string,
  body: Record<string, unknown>
): Promise<ServerSkill> {
  return serverRequest<ServerSkill>(
    baseUrl,
    token,
    "PATCH",
    `/api/v1/skills/${serverSkillId}`,
    body
  );
}

/** Upload skill zip archive to central server OBS storage. Returns false if OBS is disabled. */
export async function pushSkillContentToServer(
  serverApiUrl: string,
  localSkillId: string,
  serverSkillId: string
): Promise<boolean> {
  const token = getStoredToken();
  if (!token) throw new Error("not authenticated");

  try {
    await invoke<void>("upload_skill_content_to_server", {
      baseUrl: serverApiUrl.trim().replace(/\/+$/, ""),
      token,
      localSkillId,
      serverSkillId,
    });
    return true;
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    if (message.includes("obs_not_configured")) {
      return false;
    }
    throw error;
  }
}

export async function syncServerSkillScope(
  opts: PushSkillOptions
): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("not authenticated");
  if (!opts.skill.server_skill_id) return;

  const patch: Record<string, unknown> = { scope: opts.scope };
  if (opts.scope === "project") {
    if (!opts.serverProjectId) throw new Error("project link required");
    patch.project_id = opts.serverProjectId;
  }
  await updateServerSkill(
    opts.serverApiUrl,
    token,
    opts.skill.server_skill_id,
    patch
  );
}

export async function syncServerSkillCategory(
  serverApiUrl: string,
  skill: ManagedSkill
): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("not authenticated");
  if (!skill.server_skill_id) return;

  const updated = await updateServerSkill(serverApiUrl, token, skill.server_skill_id, {
    category: skill.category ?? null,
  });
  if (!serverSkillHasCategoryField(updated)) {
    throw new ServerCategoryUnsupportedError();
  }
}

/** Register or update skill metadata on the central server, then upload content when OBS is enabled. */
export async function pushSkillToServer(
  opts: PushSkillOptions
): Promise<{ serverSkillId: string; contentUploaded: boolean; reRegistered?: boolean }> {
  const token = getStoredToken();
  if (!token) throw new Error("not authenticated");

  const body = buildServerSkillPayload(
    opts.skill,
    opts.scope,
    opts.user,
    opts.serverProjectId
  );

  let serverSkillId: string;
  let reRegistered = false;
  if (opts.skill.server_skill_id) {
    const patch: Record<string, unknown> = {
      name: body.name,
      description: body.description,
      category: body.category,
      git_remote: body.git_remote,
      git_path: body.git_path,
      content_hash: body.content_hash,
      scope: opts.scope,
    };
    if (opts.scope === "project" && opts.serverProjectId) {
      patch.project_id = opts.serverProjectId;
    }
    try {
      const updated = await updateServerSkill(
        opts.serverApiUrl,
        token,
        opts.skill.server_skill_id,
        patch
      );
      serverSkillId = updated.id;
    } catch (error: unknown) {
      if (getHttpStatusFromError(error) === 404) {
        const created = await createServerSkill(opts.serverApiUrl, token, body);
        serverSkillId = created.id;
        reRegistered = true;
      } else {
        throw error;
      }
    }
  } else {
    const created = await createServerSkill(opts.serverApiUrl, token, body);
    serverSkillId = created.id;
  }

  const contentUploaded = await pushSkillContentToServer(
    opts.serverApiUrl,
    opts.skill.id,
    serverSkillId
  );

  return { serverSkillId, contentUploaded, reRegistered };
}
