import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "../context/useAuth";
import {
  fetchServerPublicConfig,
  FIXED_CODING_OCR_URL,
  getStoredToken,
  updateServerModelPolicy,
  userIsOps,
} from "../lib/serverApi";
import { getSettings, setSettings, syncOpenCodeModelPolicy } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

type PolicyMode = "open" | "restricted";
type ImagePriority = "ocr_then_vl" | "vl_then_ocr" | "ocr_only" | "vl_only";

const DEFAULT_MODELS = [
  "alibaba-cn/qwen3-vl-plus",
  "alibaba-cn/qwen-vl-max",
  "alibaba-cn/qwen2.5-vl-72b-instruct",
  "alibaba-cn/qwen3.7-plus",
].join("\n");

function parseImagePriority(raw: string | undefined | null): ImagePriority {
  const value = raw?.trim().toLowerCase();
  if (value === "vl_then_ocr" || value === "ocr_only" || value === "vl_only") return value;
  return "ocr_then_vl";
}

export function AdminModelPolicy() {
  const { t } = useTranslation();
  const { serverApiUrl, user } = useAuth();
  const token = getStoredToken();
  const isOps = userIsOps(user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<PolicyMode>("open");
  const [modelsText, setModelsText] = useState(DEFAULT_MODELS);
  const [codingVisionModel, setCodingVisionModel] = useState("alibaba-cn/qwen3-vl-plus");
  const [imagePriority, setImagePriority] = useState<ImagePriority>("ocr_then_vl");

  const load = useCallback(async () => {
    if (!serverApiUrl.trim()) return;
    setLoading(true);
    try {
      const cfg = await fetchServerPublicConfig(serverApiUrl);
      const cachedPriority =
        (await getSettings("org_coding_image_priority").catch(() => null))?.trim() || "";
      setMode(cfg.model_policy_mode === "restricted" ? "restricted" : "open");
      const models = cfg.requirements_only_models ?? [];
      setModelsText(models.length > 0 ? models.join("\n") : DEFAULT_MODELS);
      setCodingVisionModel(cfg.coding_vision_model?.trim() || "");
      setImagePriority(parseImagePriority(cachedPriority || cfg.coding_image_priority));
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setLoading(false);
    }
  }, [serverApiUrl, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!token || !isOps) return;
    const models = modelsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (mode === "restricted" && models.length === 0) {
      toast.error(t("admin.policy.modelsRequired"));
      return;
    }
    setSaving(true);
    try {
      const ocrUrl = FIXED_CODING_OCR_URL;
      const cfg = await updateServerModelPolicy(serverApiUrl, token, {
        mode,
        requirements_only_models: models,
        coding_vision_model: codingVisionModel.trim(),
        coding_ocr_url: ocrUrl,
        coding_image_priority: imagePriority,
      });
      await setSettings("org_coding_ocr_url", ocrUrl).catch(() => {});
      await setSettings("org_coding_image_priority", imagePriority).catch(() => {});
      await syncOpenCodeModelPolicy({
        mode: cfg.model_policy_mode === "restricted" ? "restricted" : "open",
        requirements_only_models: cfg.requirements_only_models ?? models,
        coding_vision_model: cfg.coding_vision_model?.trim() || codingVisionModel.trim() || null,
        coding_ocr_url: ocrUrl,
        coding_image_priority: imagePriority,
      });
      setImagePriority(imagePriority);
      toast.success(t("admin.policy.saved"));
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setSaving(false);
    }
  };

  if (!isOps) {
    return (
      <div className="app-panel p-4">
        <p className="text-sm text-muted">{t("admin.policy.opsOnly")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="app-panel p-4 space-y-4 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold text-primary">{t("admin.policy.title")}</h2>
        <p className="text-[13px] text-tertiary mt-1">{t("admin.policy.subtitle")}</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-secondary">{t("admin.policy.mode")}</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="model-policy-mode"
              className="mt-1"
              checked={mode === "open"}
              onChange={() => setMode("open")}
            />
            <span>
              <span className="font-medium text-primary">{t("admin.policy.modeOpen")}</span>
              <span className="block text-tertiary text-[13px]">
                {t("admin.policy.modeOpenDesc")}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="model-policy-mode"
              className="mt-1"
              checked={mode === "restricted"}
              onChange={() => setMode("restricted")}
            />
            <span>
              <span className="font-medium text-primary">{t("admin.policy.modeRestricted")}</span>
              <span className="block text-tertiary text-[13px]">
                {t("admin.policy.modeRestrictedDesc")}
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-secondary" htmlFor="requirements-only-models">
          {t("admin.policy.models")}
        </label>
        <p className="text-[13px] text-tertiary">{t("admin.policy.modelsHint")}</p>
        <textarea
          id="requirements-only-models"
          className="w-full min-h-[120px] rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
          value={modelsText}
          onChange={(e) => setModelsText(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-secondary" htmlFor="coding-ocr-url">
          {t("admin.policy.codingOcr")}
        </label>
        <p className="text-[13px] text-tertiary">{t("admin.policy.codingOcrHint")}</p>
        <input
          id="coding-ocr-url"
          type="text"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono opacity-80"
          value={FIXED_CODING_OCR_URL}
          readOnly
          spellCheck={false}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-secondary" htmlFor="coding-vision-model">
          {t("admin.policy.codingVision")}
        </label>
        <p className="text-[13px] text-tertiary">{t("admin.policy.codingVisionHint")}</p>
        <input
          id="coding-vision-model"
          type="text"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
          value={codingVisionModel}
          onChange={(e) => setCodingVisionModel(e.target.value)}
          placeholder="alibaba-cn/qwen3-vl-plus"
          spellCheck={false}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-secondary">{t("admin.policy.imagePriority")}</label>
        <p className="text-[13px] text-tertiary">{t("admin.policy.imagePriorityHint")}</p>
        <div className="flex flex-col gap-2">
          {(
            [
              ["ocr_then_vl", "imagePriorityOcrThenVl"],
              ["vl_then_ocr", "imagePriorityVlThenOcr"],
              ["ocr_only", "imagePriorityOcrOnly"],
              ["vl_only", "imagePriorityVlOnly"],
            ] as const
          ).map(([value, labelKey]) => (
            <label key={value} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="coding-image-priority"
                className="mt-1"
                checked={imagePriority === value}
                onChange={() => setImagePriority(value)}
              />
              <span className="text-primary">{t(`admin.policy.${labelKey}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {t("admin.policy.save")}
      </button>
    </div>
  );
}
