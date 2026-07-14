import { useState } from "react";
import { Layers, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SKILL_CATEGORY_IDS,
  skillCategoryLabelKey,
  type SkillCategoryId,
} from "../lib/skillCategories";
import { AppModal } from "./AppModal";

interface Props {
  open: boolean;
  skillCount: number;
  loading?: boolean;
  onClose: () => void;
  onApply: (category: SkillCategoryId) => Promise<void>;
}

export function BatchCategoryDialog({
  open,
  skillCount,
  loading = false,
  onClose,
  onApply,
}: Props) {
  if (!open) return null;

  return (
    <BatchCategoryDialogContent
      skillCount={skillCount}
      loading={loading}
      onClose={onClose}
      onApply={onApply}
    />
  );
}

function BatchCategoryDialogContent({
  skillCount,
  loading = false,
  onClose,
  onApply,
}: Omit<Props, "open">) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<SkillCategoryId>("other");

  const busy = loading;

  return (
    <AppModal open onBackdropClick={busy ? undefined : onClose}>
      <div className="relative w-full max-w-[400px] rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-primary">
            <Layers className="h-4 w-4 text-accent-light" />
            {t("mySkills.batchCategoryDialog.title", { count: skillCount })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-muted transition-colors hover:text-secondary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[13px] text-muted">{t("mySkills.batchCategoryDialog.intro")}</p>

        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            {t("mySkills.category")}
          </div>
          <select
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value as SkillCategoryId)}
            className="app-input w-full text-[13px]"
          >
            {SKILL_CATEGORY_IDS.map((id) => (
              <option key={id} value={id}>
                {skillCategoryLabelKey(id) ? t(skillCategoryLabelKey(id)!) : id}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[12px] text-muted">{t("mySkills.batchCategoryDialog.hint")}</p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[4px] px-3 py-1.5 text-[13px] font-medium text-tertiary transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onApply(category)}
            className="app-button-primary"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("mySkills.batchCategoryDialog.apply")}
          </button>
        </div>
      </div>
    </AppModal>
  );
}
