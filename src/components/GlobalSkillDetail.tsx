import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/useAuth";
import { useSkillScopePermissions } from "../hooks/useSkillScopePermissions";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { CentralUploadDialog } from "./CentralUploadDialog";
import { pushSkillToServer, syncServerSkillCategory } from "../lib/skillSync";
import {
  isSkillScopeLocked,
  resolveLinkedProjectName,
  resolveSkillScope,
} from "../lib/managedSkillDisplay";
import {
  type SkillCategoryId,
} from "../lib/skillCategories";
import * as api from "../lib/tauri";
import { getLinkedServerProjectId, setServerSkillId } from "../lib/tauri";
import type { ManagedSkill, SkillScope, SkillToolToggle, ToolInfo } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { ServerCategoryUnsupportedError } from "../lib/serverApi";

function getToolDisplayName(toolKey: string, tools: ToolInfo[]) {
  return tools.find((tool) => tool.key === toolKey)?.display_name || toolKey;
}

/** Global skill detail overlay — mounted in Layout so it survives route changes. */
export function GlobalSkillDetail() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isServerMode, isAuthenticated, serverApiUrl, user } = useAuth();
  const { allowedScopes, canAssignScope } = useSkillScopePermissions();
  const {
    viewedPreset,
    tools,
    managedSkills,
    refreshManagedSkills,
    projects,
    refreshProjects,
    detailSkillId,
    openSkillDetailById,
    closeSkillDetail,
  } = useApp();

  const [linkedServerProjectId, setLinkedServerProjectId] = useState<string | null>(null);
  const [toolToggles, setToolToggles] = useState<SkillToolToggle[] | null>(null);
  const [togglingToolKey, setTogglingToolKey] = useState<string | null>(null);
  const [uploadingToCentralId, setUploadingToCentralId] = useState<string | null>(null);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [centralUploadDialogOpen, setCentralUploadDialogOpen] = useState(false);

  useEffect(() => {
    const state = location.state as { openSkillId?: string } | null;
    if (!state?.openSkillId) return;
    openSkillDetailById(state.openSkillId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate, openSkillDetailById]);

  useEffect(() => {
    if (!isServerMode || !isAuthenticated) {
      setLinkedServerProjectId(null);
      return;
    }
    let cancelled = false;
    void getLinkedServerProjectId()
      .then((id) => {
        if (!cancelled) setLinkedServerProjectId(id);
      })
      .catch(() => {
        if (!cancelled) setLinkedServerProjectId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isServerMode, isAuthenticated, managedSkills]);

  const selectedSkill = useMemo(
    () => managedSkills.find((skill) => skill.id === detailSkillId) ?? null,
    [detailSkillId, managedSkills]
  );

  const linkedProjectName = useMemo(
    () => resolveLinkedProjectName(projects, linkedServerProjectId),
    [projects, linkedServerProjectId]
  );

  useEffect(() => {
    let cancelled = false;
    const loadToggles = async () => {
      if (!selectedSkill || !viewedPreset) {
        setToolToggles(null);
        return;
      }
      if (!selectedSkill.preset_ids.includes(viewedPreset.id)) {
        setToolToggles(null);
        return;
      }
      try {
        const toggles = await api.getSkillToolToggles(selectedSkill.id, viewedPreset.id);
        if (!cancelled) setToolToggles(toggles);
      } catch {
        if (!cancelled) setToolToggles(null);
      }
    };
    void loadToggles();
    return () => {
      cancelled = true;
    };
  }, [selectedSkill, viewedPreset]);

  const handleClose = useCallback(() => {
    setCentralUploadDialogOpen(false);
    closeSkillDetail();
  }, [closeSkillDetail]);

  const handleToggleSkillTool = async (toolKey: string, enabled: boolean) => {
    if (!selectedSkill || !viewedPreset) return;
    setTogglingToolKey(toolKey);
    try {
      await api.setSkillToolToggle(selectedSkill.id, viewedPreset.id, toolKey, enabled);
      const displayName = getToolDisplayName(toolKey, tools);
      toast.success(
        enabled
          ? t("mySkills.agentToggleEnabled", { agent: displayName })
          : t("mySkills.agentToggleDisabled", { agent: displayName })
      );
      const [, toggles] = await Promise.all([
        refreshManagedSkills(),
        api.getSkillToolToggles(selectedSkill.id, viewedPreset.id),
      ]);
      setToolToggles(toggles);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      await refreshManagedSkills();
    } finally {
      setTogglingToolKey(null);
    }
  };

  const executeUploadToCentral = useCallback(
    async (skill: ManagedSkill, scope: SkillScope, category: SkillCategoryId) => {
      if (!isServerMode || !isAuthenticated || !user) {
        toast.error(t("mySkills.centralUpload.loginRequired"));
        return;
      }
      if (!canAssignScope(scope)) {
        toast.error(t("mySkills.scopeDenied"));
        return;
      }
      setUploadingToCentralId(skill.id);
      const toastId = toast.loading(t("mySkills.centralUpload.uploading"));
      try {
        if (!skill.category) {
          await api.setSkillCategory(skill.id, category);
        }
        if (!isSkillScopeLocked(skill)) {
          await api.setSkillScope(skill.id, scope);
        }
        const uploadScope = isSkillScopeLocked(skill) ? resolveSkillScope(skill) : scope;
        let serverProjectId: string | null = null;
        if (uploadScope === "project") {
          serverProjectId = await getLinkedServerProjectId();
          if (!serverProjectId) {
            toast.error(t("mySkills.projectLinkRequired"), { id: toastId });
            if (!isSkillScopeLocked(skill)) {
              await refreshManagedSkills();
            }
            return;
          }
        }
        const refreshed = await api.getManagedSkills();
        const skillForUpload =
          refreshed.find((s) => s.id === skill.id) ??
          (isSkillScopeLocked(skill) ? skill : { ...skill, scope: uploadScope, category });
        const { serverSkillId, contentUploaded, reRegistered } = await pushSkillToServer({
          serverApiUrl,
          user,
          skill: skillForUpload,
          scope: uploadScope,
          serverProjectId,
        });
        await setServerSkillId(skill.id, serverSkillId);
        if (contentUploaded) {
          toast.success(
            reRegistered
              ? t("mySkills.centralUpload.reRegistered")
              : t("mySkills.centralUpload.success"),
            { id: toastId }
          );
        } else {
          toast.success(
            reRegistered
              ? t("mySkills.centralUpload.reRegisteredMetadataOnly")
              : t("mySkills.centralUpload.metadataOnly"),
            { id: toastId }
          );
        }
        await refreshManagedSkills();
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")), { id: toastId });
      } finally {
        setUploadingToCentralId(null);
      }
    },
    [
      isServerMode,
      isAuthenticated,
      user,
      canAssignScope,
      serverApiUrl,
      refreshManagedSkills,
      t,
    ]
  );

  const handleUploadToCentral = useCallback(async () => {
    if (!selectedSkill) return;
    if (isSkillScopeLocked(selectedSkill)) {
      const cat = (selectedSkill.category as SkillCategoryId | null) ?? "other";
      await executeUploadToCentral(selectedSkill, resolveSkillScope(selectedSkill), cat);
      return;
    }
    setCentralUploadDialogOpen(true);
  }, [selectedSkill, executeUploadToCentral]);

  const handleCentralUploadDialogConfirm = useCallback(
    async (scope: SkillScope, category: SkillCategoryId) => {
      if (!selectedSkill) return;
      await executeUploadToCentral(selectedSkill, scope, category);
    },
    [selectedSkill, executeUploadToCentral]
  );

  const handleSetCategory = useCallback(
    async (category: SkillCategoryId | null) => {
      if (!selectedSkill) return;
      if (category === selectedSkill.category) return;
      setSavingCategoryId(selectedSkill.id);
      try {
        const updated = await api.setSkillCategory(selectedSkill.id, category);
        if (
          isServerMode &&
          isAuthenticated &&
          serverApiUrl &&
          updated.server_skill_id
        ) {
          try {
            await syncServerSkillCategory(serverApiUrl, updated);
          } catch (error) {
            if (error instanceof ServerCategoryUnsupportedError) {
              toast.error(t("install.server.categoryServerOutdated"));
            } else {
              toast.message(t("mySkills.categoryUpdatedLocalOnly"));
            }
          }
        }
        await refreshManagedSkills();
        toast.success(t("mySkills.categoryUpdated"));
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setSavingCategoryId(null);
      }
    },
    [
      selectedSkill,
      isServerMode,
      isAuthenticated,
      serverApiUrl,
      refreshManagedSkills,
      t,
    ]
  );

  if (!selectedSkill) return null;

  return (
    <>
      <SkillDetailPanel
        key={selectedSkill.id}
        skill={selectedSkill}
        onClose={handleClose}
        tools={tools}
        toolToggles={toolToggles}
        togglingTool={togglingToolKey}
        onToggleTool={handleToggleSkillTool}
        projects={projects}
        onProjectsChanged={refreshProjects}
        linkedProjectName={linkedProjectName}
        showCentralUpload={isServerMode && isAuthenticated}
        onUploadToCentral={handleUploadToCentral}
        uploadingToCentral={uploadingToCentralId === selectedSkill.id}
        onCategoryChange={handleSetCategory}
        savingCategory={savingCategoryId === selectedSkill.id}
      />

      <CentralUploadDialog
        key={selectedSkill.id}
        open={centralUploadDialogOpen}
        skillName={selectedSkill.name}
        allowedScopes={allowedScopes}
        defaultScope={resolveSkillScope(selectedSkill)}
        defaultCategory={selectedSkill.category ?? null}
        requireCategory={!selectedSkill.category}
        linkedProjectName={linkedProjectName}
        uploading={uploadingToCentralId === selectedSkill.id}
        onClose={() => setCentralUploadDialogOpen(false)}
        onConfirm={handleCentralUploadDialogConfirm}
      />
    </>
  );
}
