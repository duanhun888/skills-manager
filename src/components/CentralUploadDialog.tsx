import { useState, useEffect } from "react";
import { Cloud, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import type { SkillScope } from "../lib/tauri";
import {
  SKILL_CATEGORY_IDS,
  skillCategoryLabelKey,
  type SkillCategoryId,
} from "../lib/skillCategories";
import { AppModal } from "./AppModal";

interface CentralUploadDialogProps {
  open: boolean;
  skillName: string;
  allowedScopes: SkillScope[];
  defaultScope?: SkillScope;
  defaultCategory?: string | null;
  requireCategory?: boolean;
  linkedProjectName?: string | null;
  uploading?: boolean;
  onClose: () => void;
  onConfirm: (scope: SkillScope, category: SkillCategoryId) => Promise<void>;
}

export function CentralUploadDialog({
  open,
  skillName,
  allowedScopes,
  defaultScope = "personal",
  defaultCategory,
  requireCategory = false,
  linkedProjectName,
  uploading = false,
  onClose,
  onConfirm,
}: CentralUploadDialogProps) {
  const { t } = useTranslation();
  const initialScope = allowedScopes.includes(defaultScope)
    ? defaultScope
    : allowedScopes[0] ?? "personal";
  const initialCategory =
    defaultCategory &&
    SKILL_CATEGORY_IDS.includes(defaultCategory as SkillCategoryId)
      ? (defaultCategory as SkillCategoryId)
      : ("dev-workflow" as SkillCategoryId);
  const [scope, setScope] = useState<SkillScope>(initialScope);
  const [category, setCategory] = useState<SkillCategoryId>(initialCategory);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, uploading, onClose]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!allowedScopes.includes(scope)) return;
    if (scope === "project" && !linkedProjectName) return;
    if (uploading) return;
    onClose();
    void onConfirm(scope, category);
  };

  const showCategoryPicker = requireCategory || !defaultCategory;

  return (
    <AppModal
      open={open}
      scope="content"
      onBackdropClick={uploading ? undefined : onClose}
    >
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-primary">
            {t("mySkills.centralUpload.dialogTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded p-1 text-muted transition-colors hover:text-secondary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[13px] text-secondary">
          {t("mySkills.centralUpload.dialogIntro", { name: skillName })}
        </p>

        {showCategoryPicker ? (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              {t("mySkills.category")}
            </div>
            <select
              value={category}
              disabled={uploading}
              onChange={(e) => setCategory(e.target.value as SkillCategoryId)}
              className="app-input w-full text-[13px]"
            >
              {SKILL_CATEGORY_IDS.map((id) => (
                <option key={id} value={id}>
                  {skillCategoryLabelKey(id) ? t(skillCategoryLabelKey(id)!) : id}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] text-muted">
              {t("mySkills.centralUpload.dialogCategoryHint")}
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            {t("mySkills.scope")}
          </div>
          <div className="app-segmented inline-flex">
            {(["personal", "org", "project"] as const).map((option) => {
              const enabled = allowedScopes.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={!enabled || uploading}
                  title={!enabled ? t("mySkills.scopeDenied") : undefined}
                  onClick={() => {
                    if (enabled) setScope(option);
                  }}
                  className={cn(
                    "app-segmented-button",
                    scope === option && "app-segmented-button-active",
                    !enabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {t(`mySkills.scopeFilter.${option}`)}
                </button>
              );
            })}
          </div>
          {scope === "project" && !linkedProjectName ? (
            <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-300">
              {t("mySkills.projectLinkRequired")}
            </p>
          ) : null}
          {scope === "project" && linkedProjectName ? (
            <p className="mt-2 text-[12px] text-muted">
              {t("mySkills.projectLinkLabel", { project: linkedProjectName })}
            </p>
          ) : null}
          <p className="mt-2 text-[12px] text-muted">
            {t("mySkills.centralUpload.dialogScopeHint")}
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={uploading} className="app-button-secondary">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={
              uploading ||
              !allowedScopes.includes(scope) ||
              (scope === "project" && !linkedProjectName)
            }
            className="app-button-primary"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Cloud className="h-3.5 w-3.5" />
            )}
            {uploading ? t("mySkills.centralUpload.uploading") : t("mySkills.centralUpload.confirmUpload")}
          </button>
        </div>
      </div>
    </AppModal>
  );
}
