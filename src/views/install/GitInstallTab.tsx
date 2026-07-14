import { useCallback, useMemo, useState } from "react";
import { Check, DownloadCloud, Github, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { cn } from "../../utils";
import { useApp } from "../../context/AppContext";
import * as api from "../../lib/tauri";
import type { GitPreviewResult } from "../../lib/tauri";
import { getErrorKind, getErrorMessage } from "../../lib/error";
import { AppModal } from "../../components/AppModal";

export function GitInstallTab() {
  const { t } = useTranslation();
  const { refreshPresets, refreshManagedSkills, managedSkills } = useApp();
  const [gitUrl, setGitUrl] = useState("");
  const [gitLoading, setGitLoading] = useState(false);
  const [gitCancelKey, setGitCancelKey] = useState<string | null>(null);
  const [gitPreview, setGitPreview] = useState<GitPreviewResult | null>(null);
  const [gitPreviewRepoUrl, setGitPreviewRepoUrl] = useState<string | null>(null);
  const [gitSelections, setGitSelections] = useState<
    { rel_path: string; name: string; description: string | null; selected: boolean }[]
  >([]);
  const [gitConfirmLoading, setGitConfirmLoading] = useState(false);

  const findInstalledByGitUrl = useCallback(
    (url: string) => {
      const trimmed = url.trim().replace(/\.git$/, "").toLowerCase();
      return managedSkills.find((skill) => {
        if (!skill.source_ref) return false;
        const ref = skill.source_ref.replace(/\.git$/, "").toLowerCase();
        return ref === trimmed || ref.endsWith("/" + trimmed.split("/").slice(-2).join("/"));
      });
    },
    [managedSkills]
  );

  const installedMatch = useMemo(
    () => (gitUrl.trim() ? findInstalledByGitUrl(gitUrl) : undefined),
    [findInstalledByGitUrl, gitUrl]
  );

  const handleCancelInstall = useCallback((cancelKey: string) => {
    api.cancelInstall(cancelKey).catch(() => undefined);
  }, []);

  const handleGitPreview = async () => {
    if (!gitUrl.trim()) return;
    setGitLoading(true);
    const url = gitUrl.trim();
    setGitCancelKey(url);

    const toastId = toast.loading(t("install.toast.cloning"));
    let unlisten: (() => void) | null = null;

    try {
      unlisten = await listen<{ skill_id: string; phase: string; detail?: string }>(
        "install-progress",
        (event) => {
          if (event.payload.skill_id !== url) return;
          if (event.payload.phase === "cloning") {
            const detail = event.payload.detail?.trim();
            const msg = detail
              ? `${t("install.toast.cloning")}\n${detail}`
              : t("install.toast.cloning");
            toast.loading(msg, { id: toastId });
          }
        }
      );
      const preview = await api.previewGitInstall(url);
      toast.dismiss(toastId);
      setGitPreview(preview);
      setGitPreviewRepoUrl(url);
      setGitSelections(
        preview.skills.map((skill) => ({
          rel_path: skill.rel_path,
          name: skill.name,
          description: skill.description,
          selected: true,
        }))
      );
    } catch (error: unknown) {
      if (getErrorKind(error) === "cancelled") {
        toast.info(t("install.toast.cancelled"), { id: toastId });
      } else {
        toast.error(getErrorMessage(error, t("common.error")), { id: toastId });
      }
    } finally {
      setGitLoading(false);
      setGitCancelKey(null);
      unlisten?.();
    }
  };

  const handleGitPreviewClose = () => {
    if (gitConfirmLoading) return;
    if (gitPreview) {
      api.cancelGitPreview(gitPreview.temp_dir).catch(() => undefined);
    }
    setGitPreview(null);
    setGitPreviewRepoUrl(null);
    setGitSelections([]);
  };

  const handleGitConfirm = async () => {
    if (!gitPreview) return;
    const repoUrl = gitPreviewRepoUrl ?? gitUrl.trim();
    if (!repoUrl) return;
    const selected = gitSelections.filter((item) => item.selected);
    if (selected.length === 0) return;
    setGitConfirmLoading(true);
    try {
      await api.confirmGitInstall(
        repoUrl,
        gitPreview.temp_dir,
        selected.map((item) => ({ rel_path: item.rel_path, name: item.name }))
      );
      await Promise.all([refreshPresets(), refreshManagedSkills()]);
      toast.success(t("install.toast.success", { name: selected.map((item) => item.name).join(", ") }));
      setGitUrl("");
      setGitPreview(null);
      setGitPreviewRepoUrl(null);
      setGitSelections([]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setGitConfirmLoading(false);
    }
  };

  return (
    <>
      <div className="animate-in fade-in duration-300">
        <div className="app-panel max-w-lg p-5">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-hover">
            <Github className="h-5 w-5 text-tertiary" />
          </div>
          <h2 className="mb-1 text-[14px] font-semibold text-primary">{t("install.gitTitle")}</h2>
          <p className="mb-4 text-[13px] text-muted">{t("install.gitDesc")}</p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-tertiary">
                {t("install.repoUrl")}
              </label>
              <input
                type="text"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !gitLoading && gitUrl.trim()) void handleGitPreview();
                }}
                placeholder={t("install.repoUrlPlaceholder")}
                disabled={gitLoading}
                className="app-input w-full bg-background"
              />
            </div>
            {installedMatch ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-400">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{t("install.gitAlreadyInstalled", { name: installedMatch.name })}</span>
              </div>
            ) : null}
            <div className="flex gap-2 pt-2">
              {gitLoading ? (
                <button
                  type="button"
                  onClick={() => gitCancelKey && handleCancelInstall(gitCancelKey)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                  disabled={!gitCancelKey}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("install.cancel")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGitPreview()}
                  disabled={!gitUrl.trim()}
                  className={cn(
                    "flex w-full",
                    gitUrl.trim() && installedMatch ? "app-button-secondary bg-background" : "app-button-primary"
                  )}
                >
                  <DownloadCloud className="h-3.5 w-3.5" />
                  {gitUrl.trim() && installedMatch
                    ? t("install.gitReinstall")
                    : t("install.installClone")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AppModal
        open={!!gitPreview}
        scope="content"
        onBackdropClick={gitConfirmLoading ? undefined : handleGitPreviewClose}
      >
        <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-primary">{t("install.gitPreview.title")}</h2>
            <button
              type="button"
              onClick={handleGitPreviewClose}
              disabled={gitConfirmLoading}
              className="rounded p-1 text-muted transition-colors hover:text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-[13px] text-muted">{t("install.gitPreview.description")}</p>

          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setGitSelections((prev) => prev.map((item) => ({ ...item, selected: true })))}
              disabled={gitConfirmLoading}
              className="text-[13px] text-accent-light hover:underline"
            >
              {t("install.gitPreview.selectAll")}
            </button>
            <span className="text-faint">·</span>
            <button
              type="button"
              onClick={() => setGitSelections((prev) => prev.map((item) => ({ ...item, selected: false })))}
              disabled={gitConfirmLoading}
              className="text-[13px] text-muted hover:underline"
            >
              {t("install.gitPreview.deselectAll")}
            </button>
          </div>

          {gitSelections.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">{t("install.gitPreview.empty")}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-hide pr-1">
              {gitSelections.map((item, idx) => (
                <div
                  key={item.rel_path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                    item.selected
                      ? "border-accent-border bg-accent-bg/40"
                      : "border-border-subtle bg-background opacity-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    disabled={gitConfirmLoading}
                    onChange={(e) =>
                      setGitSelections((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, selected: e.target.checked } : s))
                      )
                    }
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) =>
                        setGitSelections((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s))
                        )
                      }
                      disabled={!item.selected || gitConfirmLoading}
                      placeholder={t("install.gitPreview.namePlaceholder")}
                      className="app-input w-full bg-background py-1 text-[13px]"
                    />
                    {item.description ? (
                      <p className="mt-1 truncate text-[12px] text-muted">{item.description}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleGitPreviewClose}
              disabled={gitConfirmLoading}
              className="px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-secondary"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleGitConfirm()}
              disabled={gitConfirmLoading || gitSelections.every((item) => !item.selected)}
              className="app-button-primary"
            >
              {gitConfirmLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadCloud className="h-3.5 w-3.5" />
              )}
              {t("install.gitPreview.confirm")}
            </button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
