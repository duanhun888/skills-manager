import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Check,
  DownloadCloud,
  FolderInput,
  FolderSearch,
  FolderUp,
  Loader2,
  Pencil,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { cn } from "../../utils";
import { useApp } from "../../context/AppContext";
import { useOpenSkillDetail } from "../../hooks/useOpenSkillDetail";
import * as api from "../../lib/tauri";
import type { BatchImportResult, ScanResult } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import { StatusBanner } from "../../components/StatusBanner";
import { warnRejected } from "./installHelpers";

export function LocalInstallTab() {
  const { t } = useTranslation();
  const { refreshPresets, refreshManagedSkills, managedSkills } = useApp();
  const openSkillDetail = useOpenSkillDetail();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [importingPaths, setImportingPaths] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);
  const [renameEditing, setRenameEditing] = useState<Record<string, string>>({});

  const goToSkill = useCallback(
    (skillName: string) => {
      const skill = managedSkills.find(
        (item) => item.name === skillName || item.source_ref === skillName
      );
      if (skill) openSkillDetail(skill.id);
    },
    [managedSkills, openSkillDetail]
  );

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setLocalError(null);
    try {
      const result = await api.scanLocalSkills();
      setScanResult(result);
    } catch (error: unknown) {
      console.error(error);
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    } finally {
      setScanLoading(false);
    }
  }, [t]);

  const runScanSilent = useCallback(async () => {
    try {
      const result = await api.scanLocalSkills();
      setScanResult(result);
      setLocalError(null);
    } catch (error: unknown) {
      console.warn("silent scan failed:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void runScan();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runScan]);

  const installLocalSource = async (sourcePath: string) => {
    const name = sourcePath.split("/").pop() || sourcePath;
    const toastId = toast.loading(t("install.toast.installing", { name }));
    try {
      await api.installLocal(sourcePath);
    } catch (e) {
      const message = getErrorMessage(e, t("common.error"));
      setLocalError(message);
      toast.error(message, { id: toastId });
      return;
    }
    const results = await Promise.allSettled([
      refreshPresets(),
      refreshManagedSkills(),
      runScanSilent(),
    ]);
    warnRejected(results, "post-install refresh");
    toast.success(t("install.toast.success", { name }), {
      id: toastId,
      action: {
        label: t("install.toast.view"),
        onClick: () => goToSkill(name),
      },
    });
  };

  const handleLocalFolderInstall = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      await installLocalSource(selected as string);
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    }
  };

  const handleLocalFileInstall = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Skills", extensions: ["zip", "skill"] }],
      });
      if (!selected) return;
      await installLocalSource(selected as string);
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    }
  };

  const handleBatchImportFolder = async () => {
    let unlisten: (() => void) | null = null;
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;

      const toastId = toast.loading(t("install.local.batchImporting"));
      unlisten = await listen<{ current: number; total: number; name: string }>(
        "batch-import-progress",
        (event) => {
          const { current, total, name } = event.payload;
          toast.loading(t("install.local.batchProgress", { current, total, name }), { id: toastId });
        }
      );

      const result: BatchImportResult = await api.batchImportFolder(selected as string);
      if (result.errors.length > 0) {
        const previewErrors = result.errors.slice(0, 3).join("; ");
        const remaining = result.errors.length - 3;
        const detail = remaining > 0 ? `${previewErrors}; +${remaining} more` : previewErrors;
        toast.error(`${t("install.local.batchErrors", { count: result.errors.length })}: ${detail}`, {
          id: toastId,
        });
      } else if (result.imported === 0) {
        toast.info(t("install.local.batchAllSkipped", { skipped: result.skipped }), { id: toastId });
      } else {
        toast.success(
          t("install.local.batchSuccess", { imported: result.imported, skipped: result.skipped }),
          { id: toastId }
        );
      }

      await Promise.all([refreshPresets(), refreshManagedSkills()]);
      await runScan();
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    } finally {
      unlisten?.();
    }
  };

  const handleImportDiscovered = async (sourcePath: string, name: string) => {
    setImportingPaths((prev) => new Set(prev).add(sourcePath));
    try {
      await api.importExistingSkill(sourcePath, name);
      toast.success(t("install.scan.importedOne", { name }));
      const results = await Promise.allSettled([
        refreshPresets(),
        refreshManagedSkills(),
        runScanSilent(),
      ]);
      warnRejected(results, "post-import refresh");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setImportingPaths((prev) => {
        const next = new Set(prev);
        next.delete(sourcePath);
        return next;
      });
    }
  };

  const handleImportAllDiscovered = async () => {
    setImportingAll(true);
    try {
      await api.importAllDiscovered();
      toast.success(t("install.scan.importedAll"));
      const results = await Promise.allSettled([
        refreshPresets(),
        refreshManagedSkills(),
        runScanSilent(),
      ]);
      warnRejected(results, "post-import refresh");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setImportingAll(false);
    }
  };

  const scanGroups = scanResult?.groups ?? [];
  const pendingGroups = scanGroups.filter((group) => !group.imported);

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-300">
      <section className="app-panel overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3.5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-accent-border bg-accent-bg px-2 py-1 font-medium text-accent-light">
                  <FolderUp className="h-3.5 w-3.5" />
                  {t("install.local.title")}
                </span>
              </div>
              <h2 className="text-[14px] font-semibold text-secondary">{t("install.local.title")}</h2>
              <p className="mt-1 text-[13px] leading-5 text-muted">{t("install.local.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleLocalFolderInstall} className="app-button-primary">
                <FolderUp className="h-4 w-4" />
                {t("install.local.selectFolder")}
              </button>
              <button type="button" onClick={handleLocalFileInstall} className="app-button-secondary bg-background">
                <UploadCloud className="h-4 w-4" />
                {t("install.local.selectArchive")}
              </button>
              <button type="button" onClick={handleBatchImportFolder} className="app-button-secondary bg-background">
                <FolderInput className="h-4 w-4" />
                {t("install.local.batchImport")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {localError ? (
        <StatusBanner
          compact
          title={t("common.requestFailed")}
          description={localError}
          actionLabel={t("common.retry")}
          onAction={runScan}
          tone="danger"
        />
      ) : null}

      <section className="app-panel overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3.5">
          <div>
            <h2 className="text-[13px] font-semibold text-secondary">{t("install.scan.title")}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {scanResult
                ? t("install.scan.summary", {
                    tools: scanResult.tools_scanned,
                    skills: scanResult.skills_found,
                  })
                : t("install.scan.initial")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runScan}
              disabled={scanLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", scanLoading && "animate-spin")} />
              {t("install.scan.rescan")}
            </button>
            <button
              type="button"
              onClick={handleImportAllDiscovered}
              disabled={scanLoading || importingAll || pendingGroups.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-border bg-accent-dark px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
            >
              {importingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadCloud className="h-3.5 w-3.5" />
              )}
              {t("install.scan.importAll")}
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          {scanLoading ? (
            <div className="flex items-center justify-center gap-2.5 py-12 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">{t("install.scan.scanning")}</span>
            </div>
          ) : scanResult && scanGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-hover">
                <FolderSearch className="h-5 w-5 text-muted" />
              </div>
              <h3 className="mb-1 text-[13px] font-semibold text-tertiary">{t("install.scan.noResults")}</h3>
              <p className="text-[13px] text-muted">{t("install.scan.noResultsHint")}</p>
            </div>
          ) : (
            <div className="app-panel-muted overflow-hidden">
              {scanGroups.map((group) => {
                const [primaryLocation, ...otherLocations] = group.locations;
                const primaryPath = primaryLocation?.found_path;
                const isImporting = !!primaryPath && importingPaths.has(primaryPath);
                const isRenaming = group.name in renameEditing;
                const importName = renameEditing[group.name] ?? group.name;
                const foundDate = new Date(group.found_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });

                return (
                  <article key={group.name} className="border-b border-border-subtle last:border-b-0">
                    <div className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renameEditing[group.name]}
                              onChange={(e) =>
                                setRenameEditing((prev) => ({ ...prev, [group.name]: e.target.value }))
                              }
                              onBlur={() => {
                                if (!renameEditing[group.name]?.trim()) {
                                  setRenameEditing((prev) => {
                                    const next = { ...prev };
                                    delete next[group.name];
                                    return next;
                                  });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setRenameEditing((prev) => {
                                    const next = { ...prev };
                                    delete next[group.name];
                                    return next;
                                  });
                                } else if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="min-w-0 max-w-[220px] rounded border border-accent-border bg-surface px-1.5 py-0.5 text-[13px] font-semibold text-secondary outline-none focus:ring-1 focus:ring-accent"
                            />
                          ) : (
                            <h3 className="truncate text-[13px] font-semibold text-secondary">{group.name}</h3>
                          )}
                          {!group.imported && !isRenaming ? (
                            <button
                              type="button"
                              onClick={() =>
                                setRenameEditing((prev) => ({ ...prev, [group.name]: group.name }))
                              }
                              className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
                              title={t("install.scan.rename")}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          ) : null}
                          {group.imported ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[13px] font-semibold text-emerald-400">
                              <Check className="h-3 w-3" />
                              {t("install.scan.imported")}
                            </span>
                          ) : null}
                          <span className="shrink-0 rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[13px] text-muted">
                            {t("install.scan.locations", { count: group.locations.length })}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
                            <Calendar className="h-3 w-3" />
                            {foundDate}
                          </span>
                        </div>
                        {primaryLocation ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex shrink-0 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-px text-[13px] font-medium text-tertiary">
                              {primaryLocation.tool}
                            </span>
                            <code className="block min-w-0 truncate text-[13px] text-tertiary">
                              {primaryLocation.found_path}
                            </code>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-start justify-end">
                        {group.imported ? null : (
                          <button
                            type="button"
                            onClick={() => primaryPath && handleImportDiscovered(primaryPath, importName)}
                            disabled={!primaryPath || isImporting}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-accent-border bg-accent-dark px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
                          >
                            {isImporting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <DownloadCloud className="h-3 w-3" />
                            )}
                            {t("install.scan.importOne")}
                          </button>
                        )}
                      </div>
                    </div>
                    {otherLocations.length > 0 ? (
                      <div className="border-t border-border-subtle bg-surface/40 px-3 py-1.5">
                        <div className="space-y-1">
                          {otherLocations.map((location) => (
                            <div key={location.id} className="flex min-w-0 items-center gap-2">
                              <span className="inline-flex shrink-0 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-px text-[13px] font-medium text-tertiary">
                                {location.tool}
                              </span>
                              <code className="block min-w-0 truncate text-[13px] text-muted">
                                {location.found_path}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
