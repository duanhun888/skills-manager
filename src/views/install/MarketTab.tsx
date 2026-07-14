import { useCallback, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  DownloadCloud,
  Loader2,
  Search,
  Star,
  TrendingUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "../../utils";
import { useApp } from "../../context/AppContext";
import { useOpenSkillDetail } from "../../hooks/useOpenSkillDetail";
import * as api from "../../lib/tauri";
import type { SkillsShSkill } from "../../lib/tauri";
import { getErrorKind, getErrorMessage } from "../../lib/error";
import { StatusBanner } from "../../components/StatusBanner";
import { MarketSkillCard } from "../../components/MarketSkillCard";
import { MarketSkillGridSkeleton } from "../../components/MarketSkillGridSkeleton";
import {
  MARKET_PAGE_SIZE,
  MARKET_SEARCH_STEP,
  MARKET_SOURCE_PILL_LIMIT,
} from "./constants";
import { useMarketSkills } from "./useMarketSkills";

export function MarketTab() {
  const { t } = useTranslation();
  const { refreshPresets, refreshManagedSkills, managedSkills } = useApp();
  const openSkillDetail = useOpenSkillDetail();
  const [installing, setInstalling] = useState<string | null>(null);

  const {
    marketTab,
    changeBoard,
    query,
    setQuery,
    debouncedQuery,
    sourceFilter,
    setSourceFilter,
    showAllSources,
    setShowAllSources,
    skills,
    page,
    setPage,
    searchLimit,
    setSearchLimit,
    loading,
    loadingMore,
    error,
    retry,
  } = useMarketSkills();

  const installedSourceRefs = useMemo(() => {
    const set = new Set<string>();
    for (const skill of managedSkills) {
      if (skill.source_type === "skillssh" && skill.source_ref) {
        set.add(skill.source_ref);
      }
    }
    return set;
  }, [managedSkills]);

  const goToSkill = useCallback(
    (skillName: string) => {
      const skill = managedSkills.find(
        (item) => item.name === skillName || item.source_ref === skillName
      );
      if (skill) {
        openSkillDetail(skill.id);
      }
    },
    [managedSkills, openSkillDetail]
  );

  const handleInstall = useCallback(
    async (skill: SkillsShSkill) => {
      const displayName = skill.name || skill.skill_id;
      const cancelKey = `${skill.source}/${skill.skill_id}`;
      setInstalling(skill.id);

      const toastId = toast.loading(t("install.toast.cloning"));
      let unlisten: (() => void) | null = null;

      try {
        unlisten = await listen<{ skill_id: string; phase: string; detail?: string }>(
          "install-progress",
          (event) => {
            if (event.payload.skill_id !== cancelKey) return;
            if (event.payload.phase === "cloning") {
              const detail = event.payload.detail?.trim();
              const msg = detail
                ? `${t("install.toast.cloning")}\n${detail}`
                : t("install.toast.cloning");
              toast.loading(msg, { id: toastId });
            } else if (event.payload.phase === "installing") {
              toast.loading(t("install.toast.installing", { name: displayName }), { id: toastId });
            }
          }
        );
        await api.installFromSkillssh(skill.source, skill.skill_id);
        await Promise.all([refreshPresets(), refreshManagedSkills()]);
        toast.success(t("install.toast.success", { name: displayName }), {
          id: toastId,
          action: {
            label: t("install.toast.view"),
            onClick: () => goToSkill(displayName),
          },
        });
      } catch (err: unknown) {
        if (getErrorKind(err) === "cancelled") {
          toast.info(t("install.toast.cancelled"), { id: toastId });
        } else {
          toast.error(getErrorMessage(err, t("common.error")), { id: toastId });
        }
      } finally {
        setInstalling(null);
        unlisten?.();
      }
    },
    [goToSkill, refreshManagedSkills, refreshPresets, t]
  );

  const handleCancelInstall = useCallback((cancelKey: string) => {
    api.cancelInstall(cancelKey).catch(() => undefined);
  }, []);

  const sourceOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) {
      counts.set(skill.source, (counts.get(skill.source) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([source]) => source);
  }, [skills]);

  const visibleSourceOptions = useMemo(() => {
    if (showAllSources) return sourceOptions;
    if (sourceFilter === "all") {
      return sourceOptions.slice(0, MARKET_SOURCE_PILL_LIMIT);
    }
    const top = sourceOptions.slice(0, MARKET_SOURCE_PILL_LIMIT);
    return top.includes(sourceFilter) ? top : [...top, sourceFilter];
  }, [showAllSources, sourceFilter, sourceOptions]);

  const hiddenSourceCount = Math.max(0, sourceOptions.length - visibleSourceOptions.length);
  const hasQuery = debouncedQuery.trim().length > 0;

  const filteredSkills = useMemo(() => {
    const filtered =
      sourceFilter === "all"
        ? skills
        : skills.filter((skill) => skill.source === sourceFilter);
    if (hasQuery) {
      return [...filtered].sort((a, b) => b.installs - a.installs);
    }
    return filtered;
  }, [hasQuery, skills, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSkills.length / MARKET_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * MARKET_PAGE_SIZE;
  const pageSkills = filteredSkills.slice(pageStart, pageStart + MARKET_PAGE_SIZE);
  const showInitialSkeleton = loading && !loadingMore && skills.length === 0;
  const showRefreshIndicator = loading && skills.length > 0;

  return (
    <div className="animate-in fade-in duration-300">
      <div className="app-panel mb-3 p-3.5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
            {!hasQuery ? (
              <div className="app-segmented shrink-0 bg-background">
                {[
                  { id: "alltime" as const, label: t("install.all"), icon: Clock },
                  { id: "trending" as const, label: t("install.trending"), icon: TrendingUp },
                  { id: "hot" as const, label: t("install.hot"), icon: Star },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => changeBoard(tab.id)}
                      className={cn(
                        "app-segmented-button flex items-center gap-1.5",
                        marketTab === tab.id && "app-segmented-button-active"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="relative flex-1 lg:max-w-[640px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchLimit(MARKET_SEARCH_STEP);
                }}
                placeholder={t("install.searchMarket")}
                className="app-input w-full bg-background pl-9"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>

          {sourceOptions.length > 0 ? (
            <div className="border-t border-border-subtle pt-2">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-[13px] font-medium text-tertiary">
                  {t("install.filters.source")}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  <button
                    type="button"
                    onClick={() => setSourceFilter("all")}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
                      sourceFilter === "all"
                        ? "border-accent-border bg-accent-bg text-accent-light"
                        : "border-border-subtle bg-background text-muted hover:text-secondary"
                    )}
                  >
                    {t("install.filters.allSources")}
                  </button>
                  {visibleSourceOptions.map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setSourceFilter(source)}
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
                        sourceFilter === source
                          ? "border-accent-border bg-accent-bg text-accent-light"
                          : "border-border-subtle bg-background text-muted hover:text-secondary"
                      )}
                    >
                      @{source}
                    </button>
                  ))}
                  {hiddenSourceCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllSources(true)}
                      className="shrink-0 rounded-full border border-border-subtle bg-background px-2.5 py-1 text-[13px] font-medium whitespace-nowrap text-muted transition-colors hover:text-secondary"
                    >
                      {t("install.filters.moreSources", { count: hiddenSourceCount })}
                    </button>
                  ) : null}
                  {showAllSources && sourceOptions.length > MARKET_SOURCE_PILL_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => setShowAllSources(false)}
                      className="shrink-0 rounded-full border border-border-subtle bg-background px-2.5 py-1 text-[13px] font-medium whitespace-nowrap text-muted transition-colors hover:text-secondary"
                    >
                      {t("install.filters.lessSources")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4">
          <StatusBanner
            compact
            title={t("common.requestFailed")}
            description={error}
            actionLabel={t("common.retry")}
            onAction={retry}
            tone="danger"
          />
        </div>
      ) : null}

      {showRefreshIndicator ? (
        <div className="mb-3 flex items-center gap-2 text-[12px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("install.refreshingMarket")}
        </div>
      ) : null}

      {showInitialSkeleton ? (
        <MarketSkillGridSkeleton count={9} />
      ) : filteredSkills.length === 0 && !loading ? (
        <div className="app-panel flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted">
            <Search className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-[14px] font-semibold text-secondary">
            {t("install.noResults.title")}
          </h3>
          <p className="mt-1 max-w-md text-[13px] text-muted">
            {t("install.noResults.description")}
          </p>
        </div>
      ) : (
        <div className="pb-8">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {pageSkills.map((skill) => {
              const sourceRef = `${skill.source}/${skill.skill_id}`;
              return (
                <MarketSkillCard
                  key={skill.id}
                  skill={skill}
                  marketTab={marketTab}
                  marketSourceFilter={sourceFilter}
                  isInstalled={installedSourceRefs.has(sourceRef)}
                  isInstalling={installing === skill.id}
                  installDisabled={installing !== null}
                  onInstall={handleInstall}
                  onCancelInstall={handleCancelInstall}
                  onOpenWeb={openUrl}
                  onFilterSource={setSourceFilter}
                />
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("install.pagination.previous")}
              </button>
              <span className="px-2 text-[13px] text-muted">
                {t("install.pagination.page", { current: currentPage, total: totalPages })}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                {t("install.pagination.next")}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {hasQuery ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setSearchLimit((value) => value + MARKET_SEARCH_STEP)}
                disabled={skills.length < searchLimit || loading}
                className="inline-flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface px-3.5 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <DownloadCloud className="h-3.5 w-3.5" />
                )}
                {loadingMore ? t("install.loadingMore") : t("install.loadMoreSearch")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
