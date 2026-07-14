import { memo, useState } from "react";
import { Check, DownloadCloud, ExternalLink, Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import type { SkillsShSkill } from "../lib/tauri";

interface MarketSkillCardProps {
  skill: SkillsShSkill;
  marketTab: "hot" | "trending" | "alltime";
  marketSourceFilter: string;
  isInstalled: boolean;
  isInstalling: boolean;
  installDisabled: boolean;
  onInstall: (skill: SkillsShSkill) => void;
  onCancelInstall: (sourceRef: string) => void;
  onOpenWeb: (url: string) => void;
  onFilterSource: (source: string) => void;
}

function LazyGithubAvatar({ owner }: { owner: string }) {
  const [failed, setFailed] = useState(false);
  const initial = owner.charAt(0).toUpperCase() || "?";

  if (failed) {
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-background text-[10px] font-semibold text-muted"
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={`https://github.com/${owner}.png?size=32`}
      alt=""
      className="h-6 w-6 shrink-0 rounded-full border border-border-subtle bg-background"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export const MarketSkillCard = memo(function MarketSkillCard({
  skill,
  marketTab,
  marketSourceFilter,
  isInstalled,
  isInstalling,
  installDisabled,
  onInstall,
  onCancelInstall,
  onOpenWeb,
  onFilterSource,
}: MarketSkillCardProps) {
  const { t } = useTranslation();
  const displayName = skill.name || skill.skill_id;
  const showSkillId = skill.skill_id.trim() !== displayName.trim();
  const owner = skill.source.split("/")[0] ?? skill.source;
  const sourceRef = `${skill.source}/${skill.skill_id}`;

  return (
    <div className="app-panel flex flex-col gap-2 p-3 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LazyGithubAvatar owner={owner} />
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-secondary">{displayName}</h3>
            {showSkillId ? (
              <p className="truncate text-[13px] leading-4 text-muted">{skill.skill_id}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenWeb(`https://skills.sh/${skill.source}/${skill.skill_id}`)}
            className="rounded-[5px] p-1 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
            title={t("install.viewOnWeb")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          {isInstalled ? (
            <span
              className="rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 p-1 text-emerald-400"
              title={t("install.installed")}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : isInstalling ? (
            <button
              type="button"
              onClick={() => onCancelInstall(sourceRef)}
              className="inline-flex items-center gap-1 rounded-[5px] border border-red-500/30 bg-red-500/10 px-1.5 py-1 text-red-400 transition-colors hover:bg-red-500/20"
              title={t("install.cancel")}
              aria-label={t("install.cancel")}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-[11px] font-medium leading-none">{t("install.cancel")}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onInstall(skill)}
              disabled={installDisabled}
              className="rounded-[5px] border border-accent-border bg-accent-dark p-1 text-white transition-colors hover:bg-accent disabled:opacity-50"
              title={t("install.oneClickInstall")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onFilterSource(skill.source)}
          disabled={marketSourceFilter === skill.source}
          title={t("install.onlyThisContributor")}
          className={cn(
            "rounded-[5px] bg-accent-bg px-1.5 py-0.5 text-[13px] font-medium leading-4 text-accent-light transition-colors",
            marketSourceFilter === skill.source
              ? "cursor-default opacity-90"
              : "hover:bg-accent-bg/80"
          )}
        >
          @{skill.source}
        </button>
        {marketTab === "alltime" && skill.installs > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-border-subtle bg-background px-1.5 py-0.5 text-[13px] leading-4 text-muted">
            <DownloadCloud className="h-3 w-3" />
            {skill.installs >= 1_000_000
              ? `${(skill.installs / 1_000_000).toFixed(1)}M`
              : skill.installs >= 1_000
                ? `${(skill.installs / 1_000).toFixed(1)}K`
                : skill.installs}
          </span>
        ) : null}
        {isInstalled ? (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[13px] font-medium leading-4 text-emerald-400">
            <Check className="h-3 w-3" />
            {t("install.installed")}
          </span>
        ) : null}
      </div>
    </div>
  );
});
