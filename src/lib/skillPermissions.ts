import type { SkillScope } from "./tauri";
import { canPermission, userIsOps, type ServerUser } from "./serverApi";

const ALL_SCOPES: SkillScope[] = ["personal", "org", "project"];

/** Scopes the current user may assign to their own skills (server mode). */
export function allowedSkillScopes(
  isServerMode: boolean,
  user: ServerUser | null,
  permissions: string[],
  ownsAnyProject: boolean
): SkillScope[] {
  if (!isServerMode || !user) {
    return ALL_SCOPES;
  }
  const scopes: SkillScope[] = ["personal"];
  if (userIsOps(user) || canPermission(permissions, user, "skill.org.write")) {
    scopes.push("org");
  }
  if (userIsOps(user) || ownsAnyProject) {
    scopes.push("project");
  }
  return scopes;
}

export function canAssignSkillScope(
  isServerMode: boolean,
  user: ServerUser | null,
  permissions: string[],
  ownsAnyProject: boolean,
  targetScope: SkillScope
): boolean {
  return allowedSkillScopes(isServerMode, user, permissions, ownsAnyProject).includes(
    targetScope
  );
}
