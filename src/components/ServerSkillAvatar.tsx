import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../utils";
import type { ServerSkill } from "../lib/serverApi";
import {
  avatarColorClass,
  serverSkillGithubAvatar,
  skillInitials,
} from "../lib/serverSkillAvatar";

interface ServerSkillAvatarProps {
  skill: ServerSkill;
  baseUrl?: string | null;
  token?: string | null;
  className?: string;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

interface CentralServerSkillIconProps {
  skill: ServerSkill;
  baseUrl: string;
  token: string;
  className?: string;
  githubAvatar: string | null;
}

function CentralServerSkillIcon({
  skill,
  baseUrl,
  token,
  className,
  githubAvatar,
  initials,
  colorClass,
}: CentralServerSkillIconProps & { initials: string; colorClass: string }) {
  const [centralIconUrl, setCentralIconUrl] = useState<string | null>(null);
  const [githubFailed, setGithubFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    void invoke<number[]>("server_download_bytes", {
      baseUrl: normalizeBaseUrl(baseUrl),
      token,
      path: `/api/v1/skills/${skill.id}/icon`,
    })
      .then((bytes) => {
        if (cancelled || bytes.length === 0) return;
        const blob = new Blob([Uint8Array.from(bytes)]);
        revoked = URL.createObjectURL(blob);
        setCentralIconUrl(revoked);
      })
      .catch(() => {
        if (!cancelled) setCentralIconUrl(null);
      });

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [baseUrl, skill.id, token]);

  const imageUrl = centralIconUrl ?? (!githubFailed && githubAvatar ? githubAvatar : null);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={skill.name}
        className={className}
        loading="lazy"
        onError={() => {
          if (centralIconUrl) {
            setCentralIconUrl(null);
            return;
          }
          setGithubFailed(true);
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
        colorClass
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function ServerSkillAvatar({
  skill,
  baseUrl,
  token,
  className,
}: ServerSkillAvatarProps) {
  const githubAvatar = useMemo(
    () => serverSkillGithubAvatar(skill, 64),
    [skill]
  );
  const initials = useMemo(() => skillInitials(skill.name), [skill.name]);
  const colorClass = useMemo(() => avatarColorClass(skill.id), [skill.id]);

  const imageClassName = cn(
    "h-9 w-9 shrink-0 rounded-full border border-border-subtle object-cover bg-background",
    className
  );

  if (skill.has_icon && baseUrl && token) {
    return (
      <CentralServerSkillIcon
        key={`${skill.id}-${baseUrl}-${token}`}
        skill={skill}
        baseUrl={baseUrl}
        token={token}
        className={imageClassName}
        githubAvatar={githubAvatar}
        initials={initials}
        colorClass={colorClass}
      />
    );
  }

  if (githubAvatar) {
    return (
      <img
        src={githubAvatar}
        alt={skill.name}
        className={imageClassName}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
        colorClass,
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}
