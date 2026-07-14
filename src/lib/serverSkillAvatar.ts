import type { ServerSkill } from "./serverApi";

const AVATAR_COLORS = [
  "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
] as const;

export function githubOwnerFromRemote(remote: string | null | undefined): string | null {
  if (!remote) return null;
  const ssh = remote.match(/^git@github\.com:([^/]+)/i);
  if (ssh) return ssh[1];
  const https = remote.match(/github\.com[/:]([^/]+)/i);
  if (https) return https[1];
  return null;
}

export function githubAvatarUrl(remote: string | null | undefined, size = 64): string | null {
  const owner = githubOwnerFromRemote(remote);
  return owner ? `https://github.com/${owner}.png?size=${size}` : null;
}

export function skillInitials(name: string): string {
  const parts = name.trim().split(/[-_\s./]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  const compact = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "");
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return (name.slice(0, 2) || "?").toUpperCase();
}

export function avatarColorClass(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

export function serverSkillGithubAvatar(skill: ServerSkill, size = 64): string | null {
  return githubAvatarUrl(skill.git_remote, size);
}

/** Display label for a central-server user account. */
export function formatServerUserLabel(
  username: string | null | undefined,
  displayName: string | null | undefined
): string | null {
  const user = username?.trim();
  if (!user) return null;
  const display = displayName?.trim();
  if (display && display !== user) {
    return `${display} (@${user})`;
  }
  return `@${user}`;
}

/** Display label for personal/project scope owner on central list cards. */
export function formatServerSkillOwnerLabel(skill: ServerSkill): string | null {
  if (skill.scope === "personal" && skill.owner_username) {
    const display = skill.owner_display_name?.trim();
    if (display && display !== skill.owner_username) {
      return `${display} (@${skill.owner_username})`;
    }
    return `@${skill.owner_username}`;
  }
  if (skill.scope === "project" && skill.project_name) {
    return skill.project_name;
  }
  return null;
}

export function formatServerSkillCreatorLabel(skill: ServerSkill): string | null {
  const fromCreator = formatServerUserLabel(
    skill.creator_username,
    skill.creator_display_name
  );
  if (fromCreator) return fromCreator;
  if (skill.scope === "personal") {
    return formatServerUserLabel(skill.owner_username, skill.owner_display_name);
  }
  return null;
}

export function formatServerSkillRecentUpdaterLabels(skill: ServerSkill): string[] {
  const updaters = skill.recent_updaters ?? [];
  return updaters
    .map((entry) => formatServerUserLabel(entry.username, entry.display_name))
    .filter((label): label is string => Boolean(label));
}

export function formatServerSkillRecentUpdaterTooltip(skill: ServerSkill): string | undefined {
  const updaters = skill.recent_updaters ?? [];
  if (updaters.length === 0) return undefined;
  return updaters
    .map((entry) => {
      const label = formatServerUserLabel(entry.username, entry.display_name) ?? "?";
      const date = entry.created_at?.slice(0, 10) ?? "";
      return date ? `${label} · ${date}` : label;
    })
    .join("\n");
}

export function serverSkillHasCreatorField(skill: ServerSkill): boolean {
  return Object.prototype.hasOwnProperty.call(skill, "creator_username");
}

export function serverSkillHasRecentUpdatersField(skill: ServerSkill): boolean {
  return Object.prototype.hasOwnProperty.call(skill, "recent_updaters");
}

export function shouldShowServerSkillOwner(
  skill: ServerSkill,
  currentUsername: string | undefined,
  isOpsUser: boolean
): boolean {
  if (skill.scope === "personal" && skill.owner_username) {
    return isOpsUser || skill.owner_username !== currentUsername;
  }
  if (skill.scope === "project" && skill.project_name) {
    return true;
  }
  return false;
}

/** Short content version from central content_hash (OBS package fingerprint). */
export function formatSkillContentVersion(
  contentHash: string | null | undefined
): string | null {
  const hash = contentHash?.trim();
  if (!hash) return null;
  return hash.length > 8 ? hash.slice(0, 8) : hash;
}

/** Prefer SKILL.md semver; strip a leading `v` for i18n templates that add it back. */
export function normalizeSkillDisplayVersion(
  displayVersion: string | null | undefined
): string | null {
  const raw = displayVersion?.trim();
  if (!raw) return null;
  return raw.replace(/^[vV]/, "");
}
