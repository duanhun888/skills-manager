import type { ManagedSkill, Project, SkillScope } from "./tauri";
import type { ServerSkill } from "./serverApi";
import { formatSkillContentVersion, normalizeSkillDisplayVersion } from "./serverSkillAvatar";

/** Scope badge colors aligned with central repository cards. */
export function serverScopeBadgeClass(scope: string): string {
  switch (scope) {
    case "org":
      return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300";
    case "project":
      return "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300";
    default:
      return "border-border-subtle bg-surface text-tertiary";
  }
}

export type ManagedSkillCentralStatus = "from_central" | "uploaded" | "not_uploaded";

export function getManagedSkillCentralStatus(skill: ManagedSkill): ManagedSkillCentralStatus {
  if (skill.source_type === "server") return "from_central";
  if (skill.server_skill_id) return "uploaded";
  return "not_uploaded";
}

export function resolveLinkedProjectName(
  projects: Project[],
  linkedServerProjectId: string | null | undefined
): string | null {
  if (!linkedServerProjectId) return null;
  return projects.find((p) => p.server_project_id === linkedServerProjectId)?.name ?? null;
}

export function resolveSkillScope(skill: ManagedSkill): SkillScope {
  return skill.scope ?? "personal";
}

export function resolveSkillVersionLabel(
  skill: ManagedSkill,
  serverMeta?: ServerSkill | null
): string | null {
  const semver = normalizeSkillDisplayVersion(skill.display_version);
  if (semver) return semver;
  const hash = serverMeta?.content_hash ?? skill.content_hash ?? null;
  return formatSkillContentVersion(hash);
}

export function skillHasDisplayVersion(skill: ManagedSkill): boolean {
  return Boolean(normalizeSkillDisplayVersion(skill.display_version));
}

export function countSkillsByScope(skills: ManagedSkill[]): Record<"all" | SkillScope, number> {
  const counts = {
    all: skills.length,
    personal: 0,
    org: 0,
    project: 0,
  };
  for (const skill of skills) {
    counts[resolveSkillScope(skill)] += 1;
  }
  return counts;
}

export function countSkillsByCentralStatus(
  skills: ManagedSkill[]
): Record<ManagedSkillCentralStatus | "all", number> {
  const counts = {
    all: skills.length,
    from_central: 0,
    uploaded: 0,
    not_uploaded: 0,
  };
  for (const skill of skills) {
    counts[getManagedSkillCentralStatus(skill)] += 1;
  }
  return counts;
}

/** Scope is fixed after central registration or when installed from central. */
export function isSkillScopeLocked(skill: ManagedSkill): boolean {
  return skill.source_type === "server" || Boolean(skill.server_skill_id);
}

/** Source filter keys for the library list (server origin uses central row instead). */
export type SourceFilterKey = "local" | "git" | "skillssh";

export function getSourceFilterKey(
  skill: ManagedSkill
): SourceFilterKey | "server" | null {
  if (skill.source_type === "local" || skill.source_type === "import") return "local";
  if (skill.source_type === "git") return "git";
  if (skill.source_type === "skillssh") return "skillssh";
  if (skill.source_type === "server") return "server";
  return null;
}

export function countSkillsBySourceFilter(
  skills: ManagedSkill[]
): Record<SourceFilterKey, number> {
  const counts: Record<SourceFilterKey, number> = {
    local: 0,
    git: 0,
    skillssh: 0,
  };
  for (const skill of skills) {
    const key = getSourceFilterKey(skill);
    if (key === "local" || key === "git" || key === "skillssh") {
      counts[key] += 1;
    }
  }
  return counts;
}

export function matchesSourceFilter(
  skill: ManagedSkill,
  sourceFilters: Set<string>
): boolean {
  if (sourceFilters.size === 0) return true;
  const key = getSourceFilterKey(skill);
  if (!key || key === "server") return false;
  return sourceFilters.has(key);
}

export const SOURCE_FILTER_KEYS: SourceFilterKey[] = ["local", "git", "skillssh"];
