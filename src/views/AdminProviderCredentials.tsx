import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "../context/useAuth";
import {
  fetchServerProviderCredentials,
  getStoredToken,
  updateServerProviderCredentials,
  userIsOps,
} from "../lib/serverApi";
import { syncOpenCodeProviderAuth } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

type Row = {
  id: string;
  providerId: string;
  key: string;
  modelsText: string;
};

const DEFAULT_ROWS: Row[] = [
  {
    id: "default-0",
    providerId: "alibaba-cn",
    key: "",
    modelsText: "qwen3.7-plus\nqwen-plus",
  },
];

function rowsFromProviders(
  providers: Record<string, { type?: string; key?: string; models?: string[] }>
): Row[] {
  const entries = Object.entries(providers);
  if (entries.length === 0) {
    return DEFAULT_ROWS.map((row) => ({ ...row }));
  }
  return entries.map(([providerId, value], i) => ({
    id: `row-${i}-${providerId}`,
    providerId,
    key: value.key ?? "",
    modelsText: (value.models ?? []).join("\n"),
  }));
}

function parseModels(text: string): string[] {
  return text
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AdminProviderCredentials() {
  const { t } = useTranslation();
  const { serverApiUrl, user } = useAuth();
  const token = getStoredToken();
  const isOps = userIsOps(user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!serverApiUrl.trim() || !token) return;
    setLoading(true);
    try {
      const data = await fetchServerProviderCredentials(serverApiUrl, token);
      setRows(rowsFromProviders(data.providers ?? {}));
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
      setRows(rowsFromProviders({}));
    } finally {
      setLoading(false);
    }
  }, [serverApiUrl, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!token || !isOps) return;
    const providers: Record<string, { type: string; key: string; models: string[] }> = {};
    for (const row of rows) {
      const providerId = row.providerId.trim();
      const key = row.key.trim();
      if (!providerId) continue;
      if (!key) continue;
      const models = parseModels(row.modelsText);
      if (models.length === 0) {
        toast.error(t("admin.credentials.modelsRequired", { provider: providerId }));
        return;
      }
      providers[providerId] = { type: "api", key, models };
    }
    setSaving(true);
    try {
      const data = await updateServerProviderCredentials(serverApiUrl, token, providers);
      await syncOpenCodeProviderAuth({
        providers: Object.fromEntries(
          Object.entries(data.providers ?? {}).map(([id, value]) => [
            id,
            {
              type: value.type || "api",
              key: value.key || "",
              models: value.models ?? providers[id]?.models ?? [],
            },
          ])
        ),
      });
      toast.success(t("admin.credentials.saved"));
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, t("common.error")));
    } finally {
      setSaving(false);
    }
  };

  if (!isOps) {
    return (
      <div className="app-panel p-4">
        <p className="text-sm text-muted">{t("admin.credentials.opsOnly")}</p>
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
        <h2 className="text-sm font-semibold text-primary">{t("admin.credentials.title")}</h2>
        <p className="text-[13px] text-tertiary mt-1">{t("admin.credentials.subtitle")}</p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <label className="flex-1 space-y-1 min-w-0">
                <span className="text-xs text-secondary">{t("admin.credentials.providerId")}</span>
                <input
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
                  value={row.providerId}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, providerId: e.target.value } : r))
                    )
                  }
                  placeholder="alibaba-cn"
                  spellCheck={false}
                />
              </label>
              <label className="flex-[1.6] space-y-1 min-w-0">
                <span className="text-xs text-secondary">{t("admin.credentials.apiKey")}</span>
                <input
                  type="password"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
                  value={row.key}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r))
                    )
                  }
                  placeholder="sk-..."
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-border px-2 py-2 text-muted hover:text-primary"
                onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                title={t("admin.credentials.remove")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-secondary">{t("admin.credentials.models")}</span>
              <textarea
                className="w-full min-h-[72px] rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
                value={row.modelsText}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, modelsText: e.target.value } : r))
                  )
                }
                placeholder={"qwen3.7-plus\nqwen-plus"}
                spellCheck={false}
              />
              <span className="text-[11px] text-tertiary">{t("admin.credentials.modelsHint")}</span>
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-secondary"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { id: `new-${Date.now()}`, providerId: "", key: "", modelsText: "" },
            ])
          }
        >
          <Plus className="w-4 h-4" />
          {t("admin.credentials.add")}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t("admin.credentials.save")}
        </button>
      </div>

      <p className="text-[12px] text-tertiary">{t("admin.credentials.hint")}</p>
    </div>
  );
}
