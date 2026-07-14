import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  DownloadCloud,
  Loader2,
  RefreshCw,
  Check,
  Search,
  X,
  Calendar,
  Cloud,
  Package,
  GitBranch,
  Trash2,
  Ban,
  RotateCcw,
  Square,
  SquareCheck,
  FileDown,
  User,
  History,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../../utils";
import { useApp } from "../../context/AppContext";
import * as api from "../../lib/tauri";
import { useNavigate } from "react-router-dom";
import { useOpenSkillDetail } from "../../hooks/useOpenSkillDetail";
import { StatusBanner } from "../../components/StatusBanner";
import { MultiSelectToolbar } from "../../components/MultiSelectToolbar";
import { BatchCategoryDialog } from "../../components/BatchCategoryDialog";
import { useMultiSelect } from "../../hooks/useMultiSelect";
import { getErrorMessage } from "../../lib/error";
import { useAuth } from "../../context/useAuth";
import { enrichServerSkillsFromHistory } from "../../lib/enrichServerSkillsFromHistory";
import {
  applyServerSkillPatch,
  deleteServerSkill,
  fetchServerSkills,
  getHttpStatusFromError,
  getStoredToken,
  ServerDeleteUnsupportedError,
  serverSkillHasCategoryField,
  setServerSkillStatus,
  userIsOps,
  type ServerSkill,
} from "../../lib/serverApi";
import { ServerSkillAvatar } from "../../components/ServerSkillAvatar";
import {
  formatServerSkillCreatorLabel,
  formatServerSkillOwnerLabel,
  formatServerSkillRecentUpdaterLabels,
  formatServerSkillRecentUpdaterTooltip,
  formatSkillContentVersion,
  shouldShowServerSkillOwner,
} from "../../lib/serverSkillAvatar";
import { serverScopeBadgeClass } from "../../lib/managedSkillDisplay";
import { updateServerSkill } from "../../lib/skillSync";
import {
  exportUnsetCategoryReport,
  isUncategorizedCategory,
  type UnsetCategoryExportRow,
} from "../../lib/skillCategoryReport";
import { skillCategoryBadgeClass, skillCategoryLabelKey, SKILL_CATEGORY_IDS, countSkillsByCategory, countUncategorizedSkills, isSkillCategoryId, type SkillCategoryId } from "../../lib/skillCategories";

function formatServerBytes(size: number | null): string | null {
  if (size == null || size <= 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatServerDate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function shortenGitRemote(remote: string): string {
  return remote
    .replace(/^git@[^:]+:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/i, "")
    .replace(/^www\./, "");
}

export function ServerInstallTab() {
  const { t } = useTranslation();
  const { refreshPresets, refreshManagedSkills, managedSkills } = useApp();
  const navigate = useNavigate();
  const openSkillDetail = useOpenSkillDetail();
  const { isServerMode, isAuthenticated, serverApiUrl, user } = useAuth();
  const [installing, setInstalling] = useState<string | null>(null);
  const [serverScope, setServerScope] = useState<"" | "org" | "project" | "personal">("");
  const [serverCategoryFilter, setServerCategoryFilter] = useState<"all" | "unset" | SkillCategoryId>("all");
  const [serverSearch, setServerSearch] = useState("");
  const [serverShowDisabled, setServerShowDisabled] = useState(false);
  const [serverManaging, setServerManaging] = useState<string | null>(null);
  const [serverBatchCategoryDialogOpen, setServerBatchCategoryDialogOpen] = useState(false);
  const [serverBatchCategorySaving, setServerBatchCategorySaving] = useState(false);
  const [serverExportingCategory, setServerExportingCategory] = useState(false);
  const [serverSkills, setServerSkills] = useState<ServerSkill[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const managedSkillsRef = useRef(managedSkills);
  managedSkillsRef.current = managedSkills;

  const goToSkill = useCallback((skillName: string) => {
    const skills = managedSkillsRef.current;
    const skill = skills.find(
      (s) => s.name === skillName || s.source_ref === skillName
    );
    if (skill) {
      openSkillDetail(skill.id);
    } else {
      navigate("/my-skills");
    }
  }, [navigate, openSkillDetail]);

  const isOpsUser = userIsOps(user);

  const loadServerSkills = useCallback(async () => {
    if (!isServerMode || !isAuthenticated || !serverApiUrl) return;
    const token = getStoredToken();
    if (!token) return;

    setServerLoading(true);
    setServerError(null);
    try {
      const skills = await fetchServerSkills(
        serverApiUrl,
        token,
        serverScope || undefined,
        isOpsUser && serverShowDisabled,
        serverCategoryFilter !== "all" && serverCategoryFilter !== "unset"
          ? serverCategoryFilter
          : undefined
      );
      const enriched = await enrichServerSkillsFromHistory(serverApiUrl, token, skills);
      setServerSkills(enriched);
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("install.server.loadFailed"));
      setServerError(message);
      setServerSkills([]);
    } finally {
      setServerLoading(false);
    }
  }, [
    isAuthenticated,
    isOpsUser,
    isServerMode,
    serverApiUrl,
    serverScope,
    serverShowDisabled,
    serverCategoryFilter,
    t,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void loadServerSkills();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadServerSkills]);

  const handleServerSetStatus = async (
    skill: ServerSkill,
    status: "active" | "disabled"
  ) => {
    const token = getStoredToken();
    if (!token || !serverApiUrl) return;
    setServerManaging(skill.id);
    try {
      await setServerSkillStatus(serverApiUrl, token, skill.id, status);
      toast.success(
        status === "disabled"
          ? t("install.server.disabledSuccess", { name: skill.name })
          : t("install.server.enabledSuccess", { name: skill.name })
      );
      await loadServerSkills();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setServerManaging(null);
    }
  };

  const handleServerDelete = async (skill: ServerSkill) => {
    if (!window.confirm(t("install.server.deleteConfirm", { name: skill.name }))) {
      return;
    }
    const token = getStoredToken();
    if (!token || !serverApiUrl) return;
    setServerManaging(skill.id);
    try {
      await deleteServerSkill(serverApiUrl, token, skill.id);
      toast.success(t("install.server.deletedSuccess", { name: skill.name }));
      await loadServerSkills();
    } catch (error: unknown) {
      if (
        error instanceof ServerDeleteUnsupportedError ||
        getHttpStatusFromError(error) === 405
      ) {
        toast.error(t("install.server.deleteServerOutdated"));
      } else {
        toast.error(getErrorMessage(error, t("common.error")));
      }
    } finally {
      setServerManaging(null);
    }
  };

  const handleServerSetCategory = async (skill: ServerSkill, categoryValue: string) => {
    const token = getStoredToken();
    if (!token || !serverApiUrl) return;
    const nextCategory =
      categoryValue && isSkillCategoryId(categoryValue) ? categoryValue : null;
    if (nextCategory === (skill.category ?? null)) return;

    setServerManaging(skill.id);
    try {
      const updated = await updateServerSkill(serverApiUrl, token, skill.id, {
        category: nextCategory,
      });
      if (nextCategory !== null && !serverSkillHasCategoryField(updated)) {
        toast.error(t("install.server.categoryServerOutdated"));
        return;
      }
      setServerSkills((prev) => applyServerSkillPatch(prev, updated));
      const localSkill = managedSkills.find((s) => s.server_skill_id === skill.id);
      if (localSkill && nextCategory) {
        try {
          await api.setSkillCategory(localSkill.id, nextCategory);
        } catch {
          /* central metadata updated; local SKILL.md sync best-effort */
        }
      }
      toast.success(t("install.server.categoryUpdated", { name: skill.name }));
      await loadServerSkills();
      if (localSkill) {
        await refreshManagedSkills();
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setServerManaging(null);
    }
  };

  const installedServerIds = useMemo(
    () =>
      new Set(
        managedSkills
          .map((s) => s.server_skill_id)
          .filter((id): id is string => Boolean(id))
      ),
    [managedSkills]
  );

  const serverNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of serverSkills) {
      counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
    }
    return counts;
  }, [serverSkills]);

  const serverCategoryCounts = useMemo(() => countSkillsByCategory(serverSkills), [serverSkills]);
  const serverUncategorizedCount = useMemo(
    () => countUncategorizedSkills(serverSkills),
    [serverSkills]
  );

  const filteredServerSkills = useMemo(() => {
    const query = serverSearch.trim().toLowerCase();
    let list = serverSkills.filter((skill) => {
      if (serverCategoryFilter === "unset") {
        if (skill.category && isSkillCategoryId(skill.category)) return false;
      } else if (serverCategoryFilter !== "all" && skill.category !== serverCategoryFilter) {
        return false;
      }
      if (!query) return true;
      return (
        skill.name.toLowerCase().includes(query) ||
        (skill.description?.toLowerCase().includes(query) ?? false) ||
        skill.id.toLowerCase().includes(query) ||
        (skill.git_remote?.toLowerCase().includes(query) ?? false)
      );
    });

    list = [...list].sort((a, b) => {
      const aReady = a.has_content || Boolean(a.git_remote);
      const bReady = b.has_content || Boolean(b.git_remote);
      if (aReady !== bReady) return aReady ? -1 : 1;
      const aTime = a.content_updated_at ?? a.created_at;
      const bTime = b.content_updated_at ?? b.created_at;
      return bTime.localeCompare(aTime);
    });

    return list;
  }, [serverSearch, serverSkills, serverCategoryFilter]);

  const serverManageableSkills = useMemo(
    () => filteredServerSkills.filter((skill) => skill.can_write || skill.can_admin),
    [filteredServerSkills]
  );

  const {
    isMultiSelect: isServerMultiSelect,
    setIsMultiSelect: setIsServerMultiSelect,
    selectedIds: serverSelectedIds,
    toggleSelect: toggleServerSelect,
    isAllSelected: isAllServerSelected,
    handleSelectAll: handleServerSelectAll,
    exitMultiSelect: exitServerMultiSelect,
  } = useMultiSelect({
    items: serverManageableSkills,
    filtered: serverManageableSkills,
    getKey: (skill) => skill.id,
    isItemActive: () => true,
  });

  const serverUncategorizedRows = useMemo((): UnsetCategoryExportRow[] => {
    return serverSkills
      .filter((skill) => isUncategorizedCategory(skill.category))
      .map((skill) => ({
        name: skill.name,
        scope: skill.scope,
        source: "central",
        identifier: skill.id,
        description: skill.description,
      }));
  }, [serverSkills]);

  const handleExportServerUncategorized = async () => {
    const rows =
      serverCategoryFilter === "unset"
        ? filteredServerSkills
            .filter((skill) => isUncategorizedCategory(skill.category))
            .map((skill) => ({
              name: skill.name,
              scope: skill.scope,
              source: "central",
              identifier: skill.id,
              description: skill.description,
            }))
        : serverUncategorizedRows;
    if (rows.length === 0) {
      toast.info(t("install.server.exportUncategorizedEmpty"));
      return;
    }
    setServerExportingCategory(true);
    try {
      const filename = `skills-unset-category-central-${rows.length}.csv`;
      const result = await exportUnsetCategoryReport(rows, filename);
      if (result === "empty") {
        toast.info(t("install.server.exportUncategorizedEmpty"));
      } else if (result === "clipboard") {
        toast.success(
          t("install.server.exportUncategorizedDone", {
            count: rows.length,
          })
        );
      } else {
        toast.success(
          t("install.server.exportUncategorizedDownloaded", {
            count: rows.length,
          })
        );
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setServerExportingCategory(false);
    }
  };

  const handleServerBatchSetCategory = async (category: SkillCategoryId) => {
    const token = getStoredToken();
    if (!token || !serverApiUrl) return;
    const selected = serverManageableSkills.filter((skill) =>
      serverSelectedIds.has(skill.id)
    );
    if (selected.length === 0) return;

    setServerBatchCategorySaving(true);
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    try {
      for (const skill of selected) {
        if (skill.category === category) {
          skipped++;
          continue;
        }
        try {
          const patched = await updateServerSkill(serverApiUrl, token, skill.id, {
            category,
          });
          if (!serverSkillHasCategoryField(patched)) {
            toast.error(t("install.server.categoryServerOutdated"));
            return;
          }
          setServerSkills((prev) => applyServerSkillPatch(prev, patched));
          const localSkill = managedSkills.find((s) => s.server_skill_id === skill.id);
          if (localSkill) {
            try {
              await api.setSkillCategory(localSkill.id, category);
            } catch {
              /* central updated */
            }
          }
          updated++;
        } catch {
          failed++;
        }
      }
      if (updated > 0) {
        toast.success(t("install.server.batchCategoryUpdated", { count: updated }));
        await loadServerSkills();
        await refreshManagedSkills();
        setServerBatchCategoryDialogOpen(false);
        exitServerMultiSelect();
      }
      if (skipped > 0 && updated === 0 && failed === 0) {
        toast.info(t("install.server.batchCategorySkipped", { count: skipped }));
      }
      if (failed > 0) {
        toast.error(t("install.server.batchCategoryFailed", { count: failed }));
      }
    } finally {
      setServerBatchCategorySaving(false);
    }
  };

  const handleInstallServer = async (skill: ServerSkill) => {
    const token = getStoredToken();
    if (!token) {
      toast.error(t("install.server.loginRequired"));
      return;
    }
    if (skill.status === "disabled") {
      toast.error(t("install.server.disabledHint"));
      return;
    }
    if (!skill.has_content && !skill.git_remote) {
      toast.error(t("install.server.noContent"));
      return;
    }
    if (installedServerIds.has(skill.id)) {
      toast.info(t("install.server.alreadyInstalled"));
      return;
    }

    setInstalling(skill.id);
    const toastId = toast.loading(t("install.toast.installing", { name: skill.name }));
    try {
      const result = await api.installFromServer(serverApiUrl, token, skill.id);
      await Promise.all([refreshPresets(), refreshManagedSkills()]);
      toast.success(t("install.toast.success", { name: result.skill_name }), {
        id: toastId,
        action: {
          label: t("install.toast.view"),
          onClick: () => goToSkill(result.skill_name),
        },
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      if (message.includes("already_installed")) {
        toast.info(t("install.server.alreadyInstalled"), { id: toastId });
      } else if (message.includes("no_server_content")) {
        toast.error(t("install.server.noContent"), { id: toastId });
      } else {
        toast.error(message, { id: toastId });
      }
    } finally {
      setInstalling(null);
    }
  };

  return (
    <>

        <div className="animate-in fade-in duration-300">
          {!isServerMode ? (
            <StatusBanner
              title={t("install.server.configureServer")}
              actionLabel={t("install.server.openSettings")}
              onAction={() => navigate("/settings")}
            />
          ) : !isAuthenticated ? (
            <StatusBanner
              title={t("install.server.loginRequired")}
              actionLabel={t("install.server.signIn")}
              onAction={() => navigate("/login")}
            />
          ) : (
            <>
              <div className="app-panel mb-3 space-y-3 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative min-w-[220px] flex-1 max-w-md">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={serverSearch}
                      onChange={(e) => setServerSearch(e.target.value)}
                      placeholder={t("install.server.searchPlaceholder")}
                      className="w-full rounded-[6px] border border-border-subtle bg-background py-1.5 pl-8 pr-8 text-[13px] text-primary outline-none transition-colors placeholder:text-muted focus:border-accent-border"
                    />
                    {serverSearch ? (
                      <button
                        type="button"
                        onClick={() => setServerSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-secondary"
                        aria-label={t("install.server.clearSearch")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted">
                      {t("install.server.count", { count: filteredServerSkills.length })}
                    </span>
                    {serverUncategorizedCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void handleExportServerUncategorized()}
                        disabled={serverExportingCategory}
                        className="inline-flex items-center gap-1.5 rounded-[6px] border border-border-subtle px-2.5 py-1.5 text-[13px] text-tertiary transition-colors hover:text-secondary disabled:opacity-50"
                        title={t("install.server.exportUncategorizedHint")}
                      >
                        <FileDown
                          className={cn(
                            "h-3.5 w-3.5",
                            serverExportingCategory && "animate-pulse"
                          )}
                        />
                        {t("install.server.exportUncategorized", {
                          count: serverUncategorizedCount,
                        })}
                      </button>
                    ) : null}
                    {serverManageableSkills.length > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          isServerMultiSelect
                            ? exitServerMultiSelect()
                            : setIsServerMultiSelect(true)
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-[6px] border border-border-subtle px-2.5 py-1.5 text-[13px] transition-colors",
                          isServerMultiSelect
                            ? "bg-surface-active text-secondary"
                            : "text-tertiary hover:text-secondary"
                        )}
                        title={
                          isServerMultiSelect
                            ? t("mySkills.cancelSelect")
                            : t("mySkills.selectMode")
                        }
                      >
                        <SquareCheck className="h-3.5 w-3.5" />
                        {t("mySkills.selectMode")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void loadServerSkills()}
                      disabled={serverLoading}
                      className="inline-flex items-center gap-1.5 rounded-[6px] border border-border-subtle px-2.5 py-1.5 text-[13px] text-tertiary transition-colors hover:text-secondary disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", serverLoading && "animate-spin")} />
                      {t("common.retry")}
                    </button>
                  </div>
                </div>
                <div className="app-segmented shrink-0 bg-background">
                  {(
                    [
                      { id: "" as const, label: t("mySkills.scopeFilter.all") },
                      { id: "org" as const, label: t("mySkills.scopeFilter.org") },
                      { id: "project" as const, label: t("mySkills.scopeFilter.project") },
                      { id: "personal" as const, label: t("mySkills.scopeFilter.personal") },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id || "all"}
                      type="button"
                      onClick={() => setServerScope(item.id)}
                      className={cn(
                        "app-segmented-button",
                        serverScope === item.id && "app-segmented-button-active"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                  <span className="shrink-0 text-[11px] font-medium text-muted">
                    {t("mySkills.filterRow.category")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setServerCategoryFilter("all")}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                      serverCategoryFilter === "all"
                        ? "bg-accent text-white dark:bg-accent dark:text-white"
                        : "bg-surface-hover text-muted hover:text-secondary"
                    )}
                  >
                    {t("mySkills.categoryFilter.all")}
                    <span className="ml-1 tabular-nums opacity-80">({serverCategoryCounts.all})</span>
                  </button>
                  {serverUncategorizedCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setServerCategoryFilter("unset")}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                        serverCategoryFilter === "unset"
                          ? "bg-amber-600/90 text-white"
                          : "bg-surface-hover text-muted hover:text-secondary"
                      )}
                    >
                      {t("mySkills.categoryFilter.unset")}
                      <span className="ml-1 tabular-nums opacity-80">({serverUncategorizedCount})</span>
                    </button>
                  ) : null}
                  {SKILL_CATEGORY_IDS.filter((id) => serverCategoryCounts[id] > 0).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setServerCategoryFilter(cat)}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                        serverCategoryFilter === cat
                          ? "bg-accent/90 text-white"
                          : "bg-surface-hover text-muted hover:text-secondary"
                      )}
                    >
                      {skillCategoryLabelKey(cat) ? t(skillCategoryLabelKey(cat)!) : cat}
                      <span className="ml-1 tabular-nums opacity-80">({serverCategoryCounts[cat]})</span>
                    </button>
                  ))}
                </div>
                {isOpsUser ? (
                  <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted">
                    <input
                      type="checkbox"
                      checked={serverShowDisabled}
                      onChange={(e) => setServerShowDisabled(e.target.checked)}
                      className="rounded border-border-subtle"
                    />
                    {t("install.server.showDisabled")}
                  </label>
                ) : null}
              </div>

              {isServerMultiSelect ? (
                <MultiSelectToolbar
                  selectedCount={serverSelectedIds.size}
                  isAllSelected={isAllServerSelected}
                  anyDisabled={false}
                  showToggle={false}
                  showDelete={false}
                  labels={{
                    hint: t("install.server.selectHint"),
                    selected: t("mySkills.selectedCount", { count: serverSelectedIds.size }),
                    delete: "",
                    enable: "",
                    disable: "",
                    selectAll: t("mySkills.selectAll"),
                    deselectAll: t("mySkills.deselectAll"),
                    cancel: t("common.cancel"),
                    editCategory: t("install.server.batchEditCategory", {
                      count: serverSelectedIds.size,
                    }),
                  }}
                  onDelete={() => undefined}
                  onToggle={() => undefined}
                  onSelectAll={handleServerSelectAll}
                  onCancel={exitServerMultiSelect}
                  onEditCategory={() => setServerBatchCategoryDialogOpen(true)}
                />
              ) : null}

              {serverError ? (
                <StatusBanner
                  compact
                  tone="danger"
                  title={t("install.server.loadFailed")}
                  description={serverError}
                  actionLabel={t("common.retry")}
                  onAction={() => void loadServerSkills()}
                />
              ) : null}

              {serverLoading && serverSkills.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-muted">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : serverSkills.length === 0 ? (
                <div className="app-panel flex flex-col items-center justify-center px-6 py-16 text-center">
                  <Cloud className="mb-3 h-8 w-8 text-muted" />
                  <p className="text-[14px] font-medium text-secondary">{t("install.server.empty")}</p>
                  <p className="mt-1 max-w-md text-[13px] text-muted">{t("install.server.emptyHint")}</p>
                </div>
              ) : filteredServerSkills.length === 0 ? (
                <div className="app-panel flex flex-col items-center justify-center px-6 py-14 text-center">
                  <Search className="mb-3 h-7 w-7 text-muted" />
                  <p className="text-[14px] font-medium text-secondary">{t("install.server.noSearchResults")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredServerSkills.map((skill) => {
                    const isInstalled = installedServerIds.has(skill.id);
                    const isInstalling = installing === skill.id;
                    const isDisabled = skill.status === "disabled";
                    const isManaging = serverManaging === skill.id;
                    const canManage = skill.can_write || skill.can_admin;
                    const canInstall =
                      !isDisabled &&
                      (skill.has_content || !!skill.git_remote) &&
                      !isInstalled;
                    const scopeLabel =
                      skill.scope === "org"
                        ? t("mySkills.scopeFilter.org")
                        : skill.scope === "project"
                          ? t("mySkills.scopeFilter.project")
                          : t("mySkills.scopeFilter.personal");
                    const showSkillId = (serverNameCounts.get(skill.name) ?? 0) > 1;
                    const hasDescription = Boolean(skill.description?.trim());
                    const versionLabel = formatSkillContentVersion(skill.content_hash);
                    const metaTags: string[] = [];
                    if (skill.has_content) {
                      metaTags.push(t("install.server.sourceObs"));
                      const sizeLabel = formatServerBytes(skill.content_size);
                      if (sizeLabel) metaTags.push(sizeLabel);
                    } else if (skill.git_remote) {
                      metaTags.push(t("install.server.sourceGit"));
                    }
                    const updatedLabel = formatServerDate(
                      skill.content_updated_at ?? skill.created_at
                    );
                    if (updatedLabel) {
                      metaTags.push(t("install.server.updatedAt", { date: updatedLabel }));
                    }
                    const ownerLabel = formatServerSkillOwnerLabel(skill);
                    const showOwner = shouldShowServerSkillOwner(
                      skill,
                      user?.username,
                      isOpsUser
                    );
                    const creatorLabel = formatServerSkillCreatorLabel(skill);
                    const recentUpdaterLabels = formatServerSkillRecentUpdaterLabels(skill);
                    const recentUpdaterTooltip = formatServerSkillRecentUpdaterTooltip(skill);

                    return (
                      <div
                        key={skill.id}
                        className={cn(
                          "app-panel flex flex-col gap-2.5 p-3 transition-colors hover:border-border",
                          isDisabled && "opacity-70",
                          isServerMultiSelect &&
                            canManage &&
                            serverSelectedIds.has(skill.id) &&
                            "ring-1 ring-accent border-accent/40",
                          isServerMultiSelect && canManage && "cursor-pointer"
                        )}
                        onClick={
                          isServerMultiSelect && canManage
                            ? () => toggleServerSelect(skill.id)
                            : undefined
                        }
                      >
                        <div className="flex items-start gap-2.5">
                          {isServerMultiSelect && canManage ? (
                            serverSelectedIds.has(skill.id) ? (
                              <SquareCheck className="mt-1 h-4 w-4 shrink-0 text-accent" />
                            ) : (
                              <Square className="mt-1 h-4 w-4 shrink-0 text-faint" />
                            )
                          ) : null}
                          <ServerSkillAvatar
                            skill={skill}
                            baseUrl={serverApiUrl}
                            token={getStoredToken()}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="truncate text-[13px] font-semibold text-primary">
                                {skill.name}
                              </h3>
                              <span
                                className={cn(
                                  "shrink-0 rounded-[4px] border px-1.5 py-px text-[11px] font-medium",
                                  serverScopeBadgeClass(skill.scope)
                                )}
                              >
                                {scopeLabel}
                              </span>
                              {isDisabled ? (
                                <span className="shrink-0 rounded-[4px] border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[11px] font-medium text-amber-600 dark:text-amber-300">
                                  {t("install.server.disabledBadge")}
                                </span>
                              ) : null}
                              {canManage ? (
                                <select
                                  value={
                                    skill.category && isSkillCategoryId(skill.category)
                                      ? skill.category
                                      : ""
                                  }
                                  disabled={isManaging}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    void handleServerSetCategory(skill, e.target.value)
                                  }
                                  className="app-input max-w-[132px] shrink-0 py-0.5 text-[11px]"
                                  title={t("install.server.editCategory")}
                                >
                                  <option value="">{t("mySkills.categoryUnset")}</option>
                                  {SKILL_CATEGORY_IDS.map((id) => (
                                    <option key={id} value={id}>
                                      {skillCategoryLabelKey(id)
                                        ? t(skillCategoryLabelKey(id)!)
                                        : id}
                                    </option>
                                  ))}
                                </select>
                              ) : skill.category && skillCategoryLabelKey(skill.category) ? (
                                <span
                                  className={cn(
                                    "shrink-0 rounded-[4px] border px-1.5 py-px text-[11px] font-medium",
                                    skillCategoryBadgeClass(skill.category)
                                  )}
                                >
                                  {t(skillCategoryLabelKey(skill.category)!)}
                                </span>
                              ) : null}
                              {showOwner && ownerLabel ? (
                                <span
                                  className="shrink-0 max-w-[140px] truncate rounded-[4px] border border-border-subtle bg-background px-1.5 py-px text-[11px] text-tertiary"
                                  title={ownerLabel}
                                >
                                  {skill.scope === "personal"
                                    ? t("install.server.personalOwner", { owner: ownerLabel })
                                    : t("install.server.projectOwner", { project: ownerLabel })}
                                </span>
                              ) : null}
                              {versionLabel ? (
                                <span
                                  className="shrink-0 rounded-[4px] border border-border-subtle bg-background px-1.5 py-px font-mono text-[11px] text-tertiary"
                                  title={skill.content_hash ?? undefined}
                                >
                                  {t("install.server.versionLabel", { version: versionLabel })}
                                </span>
                              ) : null}
                            </div>
                            {showSkillId ? (
                              <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                                {t("install.server.skillId", { id: skill.id.slice(0, 8) })}
                              </p>
                            ) : null}
                            <div className="mt-1.5">
                              <p className="text-[11px] font-medium text-muted">
                                {t("install.server.introLabel")}
                              </p>
                              {hasDescription ? (
                                <p className="mt-0.5 line-clamp-3 text-[12px] leading-5 text-secondary">
                                  {skill.description!.trim()}
                                </p>
                              ) : (
                                <p className="mt-0.5 text-[12px] leading-5 text-muted italic">
                                  {t("install.server.noDescription")}
                                </p>
                              )}
                            </div>
                            {metaTags.length > 0 ? (
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                {metaTags.map((tag, index) => (
                                  <span
                                    key={`${skill.id}-meta-${index}`}
                                    className="inline-flex items-center gap-1 rounded-[4px] border border-border-subtle bg-background px-1.5 py-0.5 text-[11px] text-tertiary"
                                  >
                                    {index === 0 && skill.has_content ? (
                                      <Package className="h-3 w-3 shrink-0" />
                                    ) : null}
                                    {index === 0 && !skill.has_content && skill.git_remote ? (
                                      <GitBranch className="h-3 w-3 shrink-0" />
                                    ) : null}
                                    {index === metaTags.length - 1 &&
                                    (skill.content_updated_at || skill.created_at) ? (
                                      <Calendar className="h-3 w-3 shrink-0" />
                                    ) : null}
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {creatorLabel || recentUpdaterLabels.length > 0 ? (
                              <div className="mt-2 flex flex-col gap-1">
                                {creatorLabel ? (
                                  <p
                                    className="inline-flex min-w-0 items-center gap-1 text-[11px] text-tertiary"
                                    title={creatorLabel}
                                  >
                                    <User className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {t("install.server.createdBy", { creator: creatorLabel })}
                                    </span>
                                  </p>
                                ) : null}
                                {recentUpdaterLabels.length > 0 ? (
                                  <p
                                    className="inline-flex min-w-0 items-center gap-1 text-[11px] text-tertiary"
                                    title={recentUpdaterTooltip}
                                  >
                                    <History className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {t("install.server.recentUpdates", {
                                        users: recentUpdaterLabels.join(" · "),
                                      })}
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {!skill.has_content && skill.git_remote && hasDescription ? (
                              <p
                                className="mt-1.5 truncate font-mono text-[11px] text-muted"
                                title={skill.git_remote}
                              >
                                {shortenGitRemote(skill.git_remote)}
                              </p>
                            ) : null}
                            {!skill.has_content && !skill.git_remote ? (
                              <p className="mt-1.5 text-[11px] text-amber-500">
                                {t("install.server.noContent")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div
                          className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2"
                          onClick={(e) => isServerMultiSelect && e.stopPropagation()}
                        >
                          {canManage ? (
                            <div className="flex flex-wrap gap-1">
                              {isDisabled ? (
                                <button
                                  type="button"
                                  onClick={() => void handleServerSetStatus(skill, "active")}
                                  disabled={isManaging}
                                  className="inline-flex items-center gap-1 rounded-[5px] border border-border-subtle px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover disabled:opacity-50"
                                  title={t("install.server.enable")}
                                >
                                  {isManaging ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3" />
                                  )}
                                  {t("install.server.enable")}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleServerSetStatus(skill, "disabled")}
                                  disabled={isManaging}
                                  className="inline-flex items-center gap-1 rounded-[5px] border border-amber-500/30 px-2 py-1 text-[11px] text-amber-600 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
                                  title={t("install.server.disable")}
                                >
                                  {isManaging ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Ban className="h-3 w-3" />
                                  )}
                                  {t("install.server.disable")}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleServerDelete(skill)}
                                disabled={isManaging}
                                className="inline-flex items-center gap-1 rounded-[5px] border border-red-500/30 px-2 py-1 text-[11px] text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
                                title={t("install.server.delete")}
                              >
                                <Trash2 className="h-3 w-3" />
                                {t("install.server.delete")}
                              </button>
                            </div>
                          ) : (
                            <span />
                          )}
                          {isDisabled ? (
                            <span className="text-[12px] text-amber-500">
                              {t("install.server.disabledHint")}
                            </span>
                          ) : isInstalled ? (
                            <span className="inline-flex items-center gap-1 text-[12px] text-emerald-500">
                              <Check className="h-3.5 w-3.5" />
                              {t("install.installed")}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleInstallServer(skill)}
                              disabled={!canInstall || isInstalling}
                              className="app-button-primary text-[12px]"
                            >
                              {isInstalling ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <DownloadCloud className="h-3.5 w-3.5" />
                              )}
                              {isInstalling ? t("install.installing") : t("install.oneClickInstall")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

      <BatchCategoryDialog
        open={serverBatchCategoryDialogOpen}
        skillCount={serverSelectedIds.size}
        loading={serverBatchCategorySaving}
        onClose={() => setServerBatchCategoryDialogOpen(false)}
        onApply={handleServerBatchSetCategory}
      />
    </>
  );
}
