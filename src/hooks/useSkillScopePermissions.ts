import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/useAuth";
import type { SkillScope } from "../lib/tauri";
import { allowedSkillScopes, canAssignSkillScope } from "../lib/skillPermissions";
import { fetchMyProjects, getStoredToken } from "../lib/serverApi";

export function useSkillScopePermissions() {
  const { isServerMode, isAuthenticated, user, permissions, serverApiUrl } = useAuth();
  const [projectOwnership, setProjectOwnership] = useState<{
    userId: string;
    owns: boolean;
  } | null>(null);

  const ownsAnyProject = useMemo(() => {
    if (!isServerMode || !isAuthenticated || !user) return false;
    if (projectOwnership?.userId !== user.id) return false;
    return projectOwnership.owns;
  }, [isServerMode, isAuthenticated, user, projectOwnership]);

  useEffect(() => {
    if (!isServerMode || !isAuthenticated || !user) return;
    const token = getStoredToken();
    if (!token) return;

    let cancelled = false;
    fetchMyProjects(serverApiUrl, token)
      .then((projects) => {
        if (!cancelled) {
          setProjectOwnership({
            userId: user.id,
            owns: projects.some((p) => p.owner_user_id === user.id),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectOwnership({ userId: user.id, owns: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isServerMode, isAuthenticated, serverApiUrl, user]);

  const allowedScopes = useMemo(
    () => allowedSkillScopes(isServerMode, user, permissions, ownsAnyProject),
    [isServerMode, user, permissions, ownsAnyProject]
  );

  const canAssignScope = useMemo(
    () => (scope: SkillScope) =>
      canAssignSkillScope(isServerMode, user, permissions, ownsAnyProject, scope),
    [isServerMode, user, permissions, ownsAnyProject]
  );

  return { allowedScopes, canAssignScope, scopeRestricted: isServerMode && isAuthenticated };
}
