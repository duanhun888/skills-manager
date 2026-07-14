import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/useAuth";
import { fetchSkillHistory, getStoredToken, type SkillHistoryEntry } from "../lib/serverApi";
import { getErrorMessage } from "../lib/error";

interface Props {
  serverSkillId: string | null | undefined;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function actionLabel(action: string, t: (key: string) => string): string {
  const key = `mySkills.centralHistory.actions.${action.replace(/\./g, "_")}`;
  const translated = t(key);
  return translated === key ? action : translated;
}

function detailSummary(entry: SkillHistoryEntry, t: (key: string) => string): string | null {
  const d = entry.detail;
  if (!d) return null;
  const parts: string[] = [];
  if (typeof d.content_hash === "string" && d.content_hash) {
    parts.push(`${t("mySkills.centralHistory.hash")}: ${d.content_hash.slice(0, 12)}…`);
  }
  if (typeof d.git_commit === "string" && d.git_commit) {
    parts.push(`${t("mySkills.centralHistory.gitCommit")}: ${d.git_commit.slice(0, 12)}`);
  }
  if (typeof d.git_branch === "string" && d.git_branch) {
    parts.push(`${t("mySkills.centralHistory.gitBranch")}: ${d.git_branch}`);
  }
  if (typeof d.bytes === "number") {
    const kb = Math.round(d.bytes / 1024);
    parts.push(`${t("mySkills.centralHistory.size")}: ${kb} KB`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

interface LoadedProps {
  serverSkillId: string;
  serverApiUrl: string;
}

function SkillCentralHistoryLoaded({ serverSkillId, serverApiUrl, token }: LoadedProps & { token: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SkillHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSkillHistory(serverApiUrl, token, serverSkillId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, t("common.error")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [serverSkillId, serverApiUrl, token, t]);

  return (
    <div className="mb-4 rounded-xl border border-border-subtle">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 text-[13px] font-medium text-secondary">
        <History className="h-3.5 w-3.5" />
        {t("mySkills.centralHistory.title")}
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("mySkills.centralHistory.loading")}
          </div>
        ) : error ? (
          <p className="text-[12px] text-rose-500">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-[12px] text-muted">{t("mySkills.centralHistory.empty")}</p>
        ) : (
          <ul className="space-y-2.5">
            {entries.map((entry, idx) => {
              const who =
                entry.display_name || entry.username || t("mySkills.centralHistory.unknownUser");
              const summary = detailSummary(entry, t);
              return (
                <li key={`${entry.created_at}-${idx}`} className="text-[12px]">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium text-secondary">{actionLabel(entry.action, t)}</span>
                    <span className="text-muted">{formatWhen(entry.created_at)}</span>
                    <span className="text-muted">· {who}</span>
                  </div>
                  {summary ? <p className="mt-0.5 text-muted">{summary}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SkillCentralHistory({ serverSkillId }: Props) {
  const { serverApiUrl, isServerMode, isAuthenticated } = useAuth();
  const token = getStoredToken();

  if (!serverSkillId || !isServerMode || !isAuthenticated || !serverApiUrl || !token) {
    return null;
  }

  return (
    <SkillCentralHistoryLoaded
      key={serverSkillId}
      serverSkillId={serverSkillId}
      serverApiUrl={serverApiUrl}
      token={token}
    />
  );
}
