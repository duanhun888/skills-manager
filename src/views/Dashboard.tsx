import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  FolderOpen,
  Link2,
  Plus,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import { useOpenSkillDetail } from "../hooks/useOpenSkillDetail";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import * as api from "../lib/tauri";
import {
  getProjectSyncStatusKind,
  getSyncHealthDotClass,
} from "../lib/projectSyncHealth";

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tools, projects, managedSkills, refreshProjects } = useApp();
  const openSkillDetail = useOpenSkillDetail();
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [removeProjectTarget, setRemoveProjectTarget] = useState<{ id: string; name: string } | null>(
    null
  );

  const enabledAgents = useMemo(
    () => tools.filter((tool) => tool.installed && tool.enabled),
    [tools]
  );

  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => b.updated_at - a.updated_at),
    [projects]
  );

  const recentSkills = useMemo(
    () => [...managedSkills].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5),
    [managedSkills]
  );

  const handleRemoveProject = async () => {
    if (!removeProjectTarget) return;
    await api.removeProject(removeProjectTarget.id);
    await refreshProjects();
    toast.success(t("project.removed"));
  };

  return (
    <div className="app-page app-page-narrow">
      <div className="app-page-header">
        <h1 className="app-page-title">{t("dashboard.greeting")}</h1>
        <p className="app-page-subtitle text-tertiary">
          {t("dashboard.summary", {
            skills: managedSkills.length,
            agents: enabledAgents.length,
            projects: projects.length,
          })}
        </p>
      </div>

      <section>
        <h2 className="app-section-title mb-2.5">{t("dashboard.recentProjects")}</h2>

        {recentProjects.length === 0 ? (
          <div className="app-panel flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-hover text-muted">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-secondary">{t("dashboard.noProjects")}</p>
              <p className="mt-1 text-[13px] text-muted">{t("dashboard.noProjectsHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setAddProjectOpen(true)}
              className="app-button-primary"
            >
              <Plus className="h-4 w-4" />
              {t("dashboard.linkProject")}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentProjects.map((project) => {
              const syncKind = getProjectSyncStatusKind(project.sync_health, project.skill_count);
              const syncLabel = t(`dashboard.syncStatus.${syncKind}`);
              return (
                <div key={project.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => navigate(`/project/${project.id}`)}
                    className="app-panel flex w-full items-start gap-3 px-4 py-3.5 text-left transition-all hover:border-border hover:shadow-md"
                  >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                      project.workspace_type === "linked"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    )}
                  >
                    {project.workspace_type === "linked" ? (
                      <Link2 className="h-4 w-4" />
                    ) : (
                      <FolderOpen className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[14px] font-semibold text-primary group-hover:text-accent-light">
                        {project.name}
                      </h3>
                      <ChevronRight className="h-4 w-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-muted" title={project.path}>
                      {project.path}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-tertiary tabular-nums">
                        {t("dashboard.skillsCount", { count: project.skill_count })}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            getSyncHealthDotClass(syncKind)
                          )}
                        />
                        {syncLabel}
                      </span>
                    </div>
                  </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveProjectTarget({ id: project.id, name: project.name })}
                    className="absolute right-2 top-2 rounded-md p-1.5 text-muted opacity-0 transition-all hover:bg-surface-hover hover:text-red-500 group-hover:opacity-100"
                    title={t("common.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="app-section-title mb-2.5">{t("dashboard.quickActions")}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddProjectOpen(true)}
            className="app-button-secondary"
          >
            <FolderOpen className="h-4 w-4 text-tertiary" />
            {t("dashboard.linkProject")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/install/market")}
            className="app-button-secondary"
          >
            <Plus className="h-4 w-4 text-tertiary" />
            {t("dashboard.installNew")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/install/local")}
            className="app-button-primary"
          >
            <Download className="h-4 w-4" />
            {t("dashboard.scanImport")}
          </button>
        </div>
      </section>

      {recentSkills.length > 0 ? (
        <section>
          <h2 className="app-section-title mb-2.5">{t("dashboard.recentSkillChanges")}</h2>
          <div className="app-panel divide-y divide-border-subtle overflow-hidden">
            {recentSkills.map((skill) => (
              <div
                key={skill.id}
                role="button"
                tabIndex={0}
                onClick={() => openSkillDetail(skill.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    openSkillDetail(skill.id);
                  }
                }}
                className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-accent-bg text-[13px] font-semibold text-accent-light">
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 text-[13px] font-medium text-secondary">
                      <span className="truncate">{skill.name}</span>
                      <span className="shrink-0 rounded border border-border bg-surface-hover px-1.5 py-px text-[9px] font-normal text-muted">
                        {skill.source_type}
                      </span>
                    </h4>
                    <p className="mt-px truncate text-[13px] text-muted">
                      {skill.targets.length > 0
                        ? `${t("dashboard.synced")} → ${skill.targets.map((target) => target.tool).join(", ")}`
                        : t("dashboard.notSynced")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <AddProjectDialog
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        onAdded={async () => {
          await refreshProjects();
          toast.success(t("project.workspaceAdded"));
        }}
      />

      <ConfirmDialog
        open={removeProjectTarget !== null}
        message={t("project.removeConfirm", { name: removeProjectTarget?.name || "" })}
        onClose={() => setRemoveProjectTarget(null)}
        onConfirm={handleRemoveProject}
      />
    </div>
  );
}
