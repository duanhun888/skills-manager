import type { SyncHealth } from "./tauri";

export type ProjectSyncStatusKind =
  | "no_skills"
  | "diverged"
  | "pending"
  | "project_only"
  | "in_sync"
  | "unknown";

export function getProjectSyncStatusKind(
  health: SyncHealth,
  skillCount: number
): ProjectSyncStatusKind {
  if (skillCount === 0) return "no_skills";
  if (health.diverged > 0) return "diverged";
  if (health.project_newer > 0 || health.center_newer > 0) return "pending";
  if (health.project_only > 0) return "project_only";
  if (health.in_sync === skillCount) return "in_sync";
  return "unknown";
}

export function getSyncHealthDotClass(kind: ProjectSyncStatusKind): string {
  switch (kind) {
    case "diverged":
      return "bg-red-400";
    case "pending":
      return "bg-amber-400";
    case "project_only":
      return "bg-blue-400";
    case "in_sync":
      return "bg-emerald-400";
    default:
      return "bg-faint";
  }
}

/** Legacy tooltip for sidebar dots (English fallback). */
export function getSyncHealthIndicator(
  health: SyncHealth,
  skillCount: number
): { color: string; title: string } | null {
  const kind = getProjectSyncStatusKind(health, skillCount);
  if (kind === "no_skills") return null;
  const color = getSyncHealthDotClass(kind);
  switch (kind) {
    case "diverged":
      return { color, title: `${health.diverged} diverged` };
    case "pending": {
      const parts: string[] = [];
      if (health.project_newer > 0) parts.push(`${health.project_newer} project newer`);
      if (health.center_newer > 0) parts.push(`${health.center_newer} center newer`);
      return { color, title: parts.join(", ") };
    }
    case "project_only":
      return { color, title: `${health.project_only} project only` };
    case "in_sync":
      return { color, title: "All in sync" };
    default:
      return null;
  }
}
