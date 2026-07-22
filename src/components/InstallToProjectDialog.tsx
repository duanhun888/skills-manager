import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils";
import { AppModal } from "./AppModal";
import { AgentIcon } from "./AgentIcon";
import * as api from "../lib/tauri";
import type { Project, ProjectAgentTarget } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

const AGENT_PRIORITY = ["cursor", "claude_code", "codex", "gemini_cli", "github_copilot"];

function defaultAgents(targets: ProjectAgentTarget[]): string[] {
  const enabled = targets.filter((t) => t.installed && t.enabled);
  if (enabled.length === 0) return [];
  const available = new Set(enabled.map((t) => t.key));
  const prioritized = AGENT_PRIORITY.filter((key) => available.has(key));
  const picks = prioritized.length > 0 ? prioritized : enabled.map((t) => t.key);
  return Array.from(new Set(picks.slice(0, 3)));
}

interface Props {
  open: boolean;
  skillName: string;
  projects: Project[];
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (projectId: string, agents: string[]) => Promise<void>;
}

export function InstallToProjectDialog({
  open,
  skillName,
  projects,
  submitting = false,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [targets, setTargets] = useState<ProjectAgentTarget[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updated_at - a.updated_at),
    [projects]
  );

  const selectedProject = useMemo(
    () => sortedProjects.find((p) => p.id === selectedProjectId) ?? null,
    [selectedProjectId, sortedProjects]
  );

  const enabledTargets = useMemo(
    () => targets.filter((t) => t.installed && t.enabled),
    [targets]
  );

  const resetState = useCallback(() => {
    setSelectedProjectId(null);
    setTargets([]);
    setSelectedAgents([]);
    setLoadingTargets(false);
    setTargetsError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  useEffect(() => {
    if (!open || !selectedProjectId) {
      setTargets([]);
      setSelectedAgents([]);
      setTargetsError(null);
      return;
    }

    let cancelled = false;
    setLoadingTargets(true);
    setTargetsError(null);
    void (async () => {
      try {
        const next = await api.getProjectAgentTargets(selectedProjectId);
        if (cancelled) return;
        setTargets(next);
        setSelectedAgents(defaultAgents(next));
      } catch (error: unknown) {
        if (cancelled) return;
        setTargets([]);
        setSelectedAgents([]);
        setTargetsError(getErrorMessage(error, t("common.error")));
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, selectedProjectId, t]);

  if (!open) return null;

  const canConfirm =
    Boolean(selectedProjectId) &&
    selectedAgents.length > 0 &&
    !loadingTargets &&
    !submitting;

  const toggleAgent = (key: string) => {
    setSelectedAgents((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleConfirm = async () => {
    if (!selectedProjectId || selectedAgents.length === 0) return;
    await onConfirm(selectedProjectId, selectedAgents);
  };

  return (
    <AppModal open={open} onBackdropClick={submitting ? undefined : onClose}>
      <div className="relative flex max-h-[min(80vh,560px)] w-full max-w-md flex-col rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-primary">
              {t("install.server.installToProjectTitle")}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted" title={skillName}>
              {t("install.server.installToProjectSubtitle", { name: skillName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded p-1 text-muted transition-colors hover:text-secondary outline-none disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <FolderOpen className="h-8 w-8 text-muted" />
            <p className="text-[13px] text-secondary">{t("install.server.installToProjectEmpty")}</p>
            <p className="text-[12px] text-muted">{t("install.server.installToProjectEmptyHint")}</p>
            <button
              type="button"
              className="app-button-primary text-[12px]"
              onClick={() => {
                onClose();
                navigate("/");
              }}
            >
              {t("install.server.installToProjectGoDashboard")}
            </button>
          </div>
        ) : (
          <>
            <p className="mb-2 text-[12px] font-medium text-tertiary">
              {t("install.server.installToProjectPick")}
            </p>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {sortedProjects.map((project) => {
                const selected = project.id === selectedProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none disabled:opacity-50",
                      selected
                        ? "border-accent/50 bg-accent/10"
                        : "border-border-subtle bg-background hover:border-border hover:bg-surface-hover"
                    )}
                  >
                    <FolderOpen
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        selected ? "text-accent" : "text-muted"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-primary">
                        {project.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted" title={project.path}>
                        {project.path}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedProject ? (
              <div className="mt-3 border-t border-border-subtle pt-3">
                <p className="mb-2 text-[12px] font-medium text-tertiary">
                  {t("install.server.installToProjectAgents")}
                </p>
                {loadingTargets ? (
                  <div className="flex items-center gap-2 py-2 text-[12px] text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("common.loading")}
                  </div>
                ) : targetsError ? (
                  <p className="text-[12px] text-red-500">{targetsError}</p>
                ) : enabledTargets.length === 0 ? (
                  <p className="text-[12px] text-amber-500">
                    {t("install.server.installToProjectNoAgents")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {enabledTargets.map((target) => {
                      const checked = selectedAgents.includes(target.key);
                      return (
                        <button
                          key={target.key}
                          type="button"
                          disabled={submitting}
                          onClick={() => toggleAgent(target.key)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[12px] transition-colors outline-none disabled:opacity-50",
                            checked
                              ? "border-accent/40 bg-accent/10 text-secondary"
                              : "border-border-subtle bg-background text-muted hover:text-secondary"
                          )}
                        >
                          <AgentIcon
                            agentKey={target.key}
                            displayName={target.display_name}
                            className="h-4 w-4"
                          />
                          {target.display_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-[4px] px-3 py-1.5 text-[13px] font-medium text-tertiary transition-colors hover:bg-surface-hover hover:text-secondary outline-none disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={!canConfirm}
                className="app-button-primary text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {submitting
                  ? t("install.server.installToProjectWorking")
                  : t("install.server.installToProjectConfirm")}
              </button>
            </div>
          </>
        )}
      </div>
    </AppModal>
  );
}
