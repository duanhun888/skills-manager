import { useEffect, useMemo, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../utils";
import type { ManagedSkill } from "../lib/tauri";
import type { ServerSkill } from "../lib/serverApi";
import {
  avatarColorClass,
  serverSkillGithubAvatar,
  skillInitials,
} from "../lib/serverSkillAvatar";

interface ManagedSkillAvatarProps {
  skill: ManagedSkill;
  serverMeta?: ServerSkill | null;
  baseUrl?: string | null;
  token?: string | null;
  className?: string;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function localIconPath(centralPath: string): string {
  const sep = centralPath.includes("\\") ? "\\" : "/";
  return `${centralPath}${sep}icon.png`;
}

function resolveLocalIconUrl(centralPath: string | null | undefined): string | null {
  if (!centralPath) return null;
  try {
    return convertFileSrc(localIconPath(centralPath));
  } catch {
    return null;
  }
}

interface CentralSkillIconProps {
  serverSkillId: string;
  baseUrl: string;
  token: string;
  alt: string;
  className?: string;
  githubAvatar: string | null;
}

function CentralSkillIcon({
  serverSkillId,
  baseUrl,
  token,
  alt,
  className,
  githubAvatar,
  initials,
  colorClass,
}: CentralSkillIconProps & { initials: string; colorClass: string }) {
  const [centralIconUrl, setCentralIconUrl] = useState<string | null>(null);
  const [githubFailed, setGithubFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    void invoke<number[]>("server_download_bytes", {
      baseUrl: normalizeBaseUrl(baseUrl),
      token,
      path: `/api/v1/skills/${serverSkillId}/icon`,
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
  }, [baseUrl, serverSkillId, token]);

  const imageUrl = centralIconUrl ?? (!githubFailed && githubAvatar ? githubAvatar : null);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt}
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

export function ManagedSkillAvatar({
  skill,
  serverMeta,
  baseUrl,
  token,
  className,
}: ManagedSkillAvatarProps) {
  const initials = useMemo(() => skillInitials(skill.name), [skill.name]);
  const colorClass = useMemo(() => avatarColorClass(skill.id), [skill.id]);
  const githubAvatar = useMemo(
    () => (serverMeta ? serverSkillGithubAvatar(serverMeta, 64) : null),
    [serverMeta]
  );
  const localIconUrl = useMemo(
    () => resolveLocalIconUrl(skill.central_path),
    [skill.central_path]
  );

  const [localIconFailed, setLocalIconFailed] = useState(false);
  const serverSkillId = skill.server_skill_id ?? serverMeta?.id;
  const hasCentralIcon = !!(serverMeta?.has_icon && serverSkillId && baseUrl && token);

  const imageClassName = cn(
    "h-9 w-9 shrink-0 rounded-full border border-border-subtle object-cover bg-background",
    className
  );

  if (localIconUrl && !localIconFailed) {
    return (
      <img
        key={skill.central_path ?? skill.id}
        src={localIconUrl}
        alt={skill.name}
        className={imageClassName}
        loading="lazy"
        onError={() => setLocalIconFailed(true)}
      />
    );
  }

  if (hasCentralIcon) {
    return (
      <CentralSkillIcon
        key={`${serverSkillId}-${baseUrl}-${token}`}
        serverSkillId={serverSkillId}
        baseUrl={baseUrl}
        token={token}
        alt={skill.name}
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
