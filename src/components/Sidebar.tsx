import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Layers,
  Globe,
  Store,
  Settings,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  LogIn,
  Shield,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/useAuth";
import { CreatePresetDialog } from "./CreatePresetDialog";
import { RenamePresetDialog } from "./RenamePresetDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { AgentIcon } from "./AgentIcon";
import * as api from "../lib/tauri";
import type { ToolCategory, ToolInfo } from "../lib/tauri";
import { getPresetIconOption } from "../lib/presetIcons";
import { isWeakPresetName } from "../lib/presetNaming";
import { SIDEBAR_Z_INDEX } from "../lib/layoutChrome";

function SidebarSectionToggle({
  open,
  onToggle,
  label,
  hint,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button type="button" onClick={onToggle} title={hint} className="sidebar-section-toggle">
      {open ? (
        <ChevronDown className="h-3 w-3 shrink-0 text-faint" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0 text-faint" />
      )}
      <span className="sidebar-section-toggle-label">{label}</span>
    </button>
  );
}

function SidebarNested({ children }: { children: ReactNode }) {
  return <div className="sidebar-nested">{children}</div>;
}

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { presets, viewedPreset, setViewedPresetId, refreshPresets, refreshManagedSkills, tools, managedSkills, closeSkillDetail } = useApp();
  const { isServerMode, isAuthenticated, user, logout, can } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; icon?: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const installedTools = useMemo(() => tools.filter((t) => t.installed && t.enabled), [tools]);
  const installedCodingTools = useMemo(
    () => installedTools.filter((t) => t.category === "coding"),
    [installedTools]
  );
  const installedLobsterTools = useMemo(
    () => installedTools.filter((t) => t.category === "lobster"),
    [installedTools]
  );
  const [orderedPresets, setOrderedPresets] = useState(presets);
  const [orderedCodingTools, setOrderedCodingTools] = useState(installedCodingTools);
  const [orderedLobsterTools, setOrderedLobsterTools] = useState(installedLobsterTools);
  const presetReorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [presetsOpen, setPresetsOpen] = useState(true);
  const [globalWorkspaceOpen, setGlobalWorkspaceOpen] = useState(true);
  const [lobsterWorkspaceOpen, setLobsterWorkspaceOpen] = useState(true);
  const isMySkillsRoute = location.pathname === "/my-skills";

  const globalSkillsByAgent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tool of installedTools) {
      map[tool.key] = managedSkills.filter((skill) =>
        skill.targets.some((target) => target.tool === tool.key)
      ).length;
    }
    return map;
  }, [installedTools, managedSkills]);

  useEffect(() => { setOrderedPresets(presets); }, [presets]);
  useEffect(() => {
    const stored = localStorage.getItem("skills-manager:tool-order");
    const storedOrder: string[] = stored ? JSON.parse(stored) : [];
    const sorted = [
      ...storedOrder.flatMap((key) => {
        const t = installedCodingTools.find((t) => t.key === key);
        return t ? [t] : [];
      }),
      ...installedCodingTools.filter((t) => !storedOrder.includes(t.key)),
    ];
    setOrderedCodingTools(sorted);
  }, [installedCodingTools]);
  useEffect(() => {
    const stored = localStorage.getItem("skills-manager:lobster-tool-order");
    const storedOrder: string[] = stored ? JSON.parse(stored) : [];
    const sorted = [
      ...storedOrder.flatMap((key) => {
        const t = installedLobsterTools.find((t) => t.key === key);
        return t ? [t] : [];
      }),
      ...installedLobsterTools.filter((t) => !storedOrder.includes(t.key)),
    ];
    setOrderedLobsterTools(sorted);
  }, [installedLobsterTools]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = [...orderedPresets];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setOrderedPresets(reordered);

    presetReorderQueueRef.current = presetReorderQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.reorderPresets(reordered.map((s) => s.id));
        } catch {
          await refreshPresets();
          toast.error(t("common.error"));
        }
      });
  };

  const handleToolDragEnd = (category: ToolCategory) => (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const current = category === "lobster" ? orderedLobsterTools : orderedCodingTools;
    const reordered = [...current];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    if (category === "lobster") {
      setOrderedLobsterTools(reordered);
      localStorage.setItem("skills-manager:lobster-tool-order", JSON.stringify(reordered.map((t) => t.key)));
    } else {
      setOrderedCodingTools(reordered);
      localStorage.setItem("skills-manager:tool-order", JSON.stringify(reordered.map((t) => t.key)));
    }
  };

  const NAV_ITEMS = [
    { name: t("sidebar.dashboard"), path: "/", icon: LayoutDashboard },
    { name: t("sidebar.mySkills"), path: "/my-skills", icon: Layers },
    { name: t("sidebar.installSkills"), path: "/install", icon: Store },
  ];

  const handleSwitchPreset = (id: string) => {
    closeSkillDetail();
    setViewedPresetId(id);
    if (location.pathname !== "/my-skills") {
      navigate("/my-skills");
    }
  };

  const handleCreatePreset = async (name: string, description?: string, icon?: string) => {
    await api.createPreset(name, description, icon);
    await Promise.all([refreshPresets(), refreshManagedSkills()]);
    if (location.pathname === "/settings") {
      navigate("/my-skills");
    }
    toast.success(t("preset.created"));
  };

  const handleRenamePreset = async (newName: string, icon?: string) => {
    if (!renameTarget) return;
    const preset = presets.find((s) => s.id === renameTarget.id);
    if (!preset) return;
    await api.updatePreset(
      renameTarget.id,
      newName,
      preset.description || undefined,
      icon || preset.icon || undefined
    );
    await refreshPresets();
    toast.success(t("preset.renamed"));
  };

  const handleDeletePreset = async () => {
    if (!deleteTarget) return;
    await api.deletePreset(deleteTarget.id);
    await Promise.all([refreshPresets(), refreshManagedSkills()]);
    if (location.pathname === "/settings") {
      navigate("/my-skills");
    }
    toast.success(t("preset.deleted"));
  };

  const handleRenameClick = (
    event: React.MouseEvent,
    preset: { id: string; name: string; icon?: string | null }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setRenameTarget(preset);
  };

  const handleDeleteClick = (event: React.MouseEvent, preset: { id: string; name: string }) => {
    event.preventDefault();
    event.stopPropagation();
    setDeleteTarget(preset);
  };

  // Renders one workspace category section
  // Lobster Agents for lobster agents). Both sections share identical UX —
  // collapsible heading, "All Agents" overview entry, and a drag-orderable list.
  const renderToolGroup = (group: {
    category: ToolCategory;
    headingLabel: string;
    headingHint?: string;
    allAgentsLabel: string;
    emptyLabel: string;
    basePath: string;
    droppableId: string;
    tools: ToolInfo[];
    isOpen: boolean;
    onToggle: () => void;
    hideWhenEmpty: boolean;
  }) => {
    if (group.hideWhenEmpty && group.tools.length === 0) return null;
    return (
      <section className="sidebar-section">
        <SidebarSectionToggle
          open={group.isOpen}
          onToggle={group.onToggle}
          label={group.headingLabel}
          hint={group.headingHint}
        />
        {group.isOpen && (
          <SidebarNested>
            {/* Pinned overview item */}
            {(() => {
              const isActive = location.pathname === group.basePath;
              return (
                <Link
                  to={group.basePath}
                  onClick={() => closeSkillDetail()}
                  className={cn(
                    "mb-0.5 flex items-center gap-2 rounded-[5px] px-2 py-[6px] text-[13px] transition-colors outline-none",
                    isActive
                      ? "bg-surface-active font-medium text-primary"
                      : "text-tertiary hover:bg-surface-hover hover:text-secondary"
                  )}
                >
                  <span className={cn(
                    "flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded border",
                    isActive
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted"
                  )}>
                    <Globe className="h-3 w-3" />
                  </span>
                  <span className="flex-1 truncate">{group.allAgentsLabel}</span>
                </Link>
              );
            })()}
            {group.tools.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-faint">{group.emptyLabel}</p>
            ) : (
              <DragDropContext onDragEnd={handleToolDragEnd(group.category)}>
                <Droppable droppableId={group.droppableId}>
                  {(droppableProvided) => (
                    <div
                      className="space-y-0.5"
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                    >
                      {group.tools.map((tool, index) => {
                        const skillCount = globalSkillsByAgent[tool.key] ?? 0;
                        const isActive = location.pathname === `${group.basePath}/${tool.key}`;
                        return (
                          <Draggable key={tool.key} draggableId={tool.key} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "group relative flex items-center rounded-[5px] transition-colors",
                                  isActive ? "bg-surface-active" : "hover:bg-surface-hover"
                                )}
                              >
                                <button
                                  onClick={() => {
                                    closeSkillDetail();
                                    navigate(`${group.basePath}/${tool.key}`);
                                  }}
                                  className={cn(
                                    "flex min-w-0 flex-1 items-center gap-2 px-2 py-[6px] text-left text-[13px] leading-5 outline-none",
                                    isActive ? "font-medium text-primary" : "text-tertiary group-hover:text-secondary"
                                  )}
                                >
                                  <AgentIcon
                                    agentKey={tool.key}
                                    displayName={tool.display_name}
                                    className={cn(
                                      "h-[20px] w-[20px] rounded border transition-colors",
                                      isActive ? "border-accent/30 bg-accent/10" : "group-hover:border-border"
                                    )}
                                  />
                                  <span className="flex-1 truncate">{tool.display_name}</span>
                                  <span className="ml-auto flex h-[18px] w-[32px] shrink-0 items-center justify-end group-hover:hidden">
                                    {skillCount > 0 && (
                                      <span className={cn(
                                        "min-w-[18px] rounded-full px-1.5 text-center text-[12px] font-medium leading-[18px] tabular-nums",
                                        isActive ? "bg-accent-bg text-accent-light" : "bg-surface-hover text-muted"
                                      )}>
                                        {skillCount}
                                      </span>
                                    )}
                                  </span>
                                </button>
                                <div className={cn(
                                  "absolute right-1 flex items-center rounded-[3px] invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100",
                                  isActive ? "bg-surface-active" : "bg-surface-hover"
                                )}>
                                  <div
                                    {...provided.dragHandleProps}
                                    className="rounded p-1 text-faint cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {droppableProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </SidebarNested>
        )}
      </section>
    );
  };

  const handleNavClick = (path: string) => {
    closeSkillDetail();
    navigate(path);
  };

  return (
    <>
      <aside
        className="relative flex h-full w-[220px] shrink-0 flex-col border-r border-border-subtle bg-bg-secondary select-none pointer-events-auto"
        style={{ zIndex: SIDEBAR_Z_INDEX }}
      >
        {/* Traffic-light safe zone */}
        <div className="h-[38px] shrink-0" />
        {/* App logo — sits below macOS window controls */}
        <div className="flex items-center px-3 gap-3 pb-2.5 shrink-0">
          <img
            src="/logo.png"
            alt="logo"
            className="w-[24px] h-[24px] shrink-0 rounded-full object-cover"
          />
          <span className="text-[16px] font-semibold text-secondary tracking-tight truncate leading-[22px]">
            {t("app.name")}
          </span>
        </div>

        {/* Primary navigation */}
        <div className="sidebar-primary-nav mx-2.5 shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/install"
                ? location.pathname.startsWith("/install")
                : location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => handleNavClick(item.path === "/install" ? "/install/market" : item.path)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-[7px] text-sm font-medium transition-colors outline-none text-left",
                  isActive
                    ? "bg-surface-active text-primary shadow-sm"
                    : "text-tertiary hover:bg-surface-hover hover:text-secondary"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-accent" : "text-muted")} />
                {item.name}
              </button>
            );
          })}
        </div>

        {/* Scrollable sections */}
        <div className="mt-3 flex-1 overflow-y-auto px-2.5 pb-2 scrollbar-hide min-h-0">

          {/* Presets */}
          <section className="sidebar-section">
            <SidebarSectionToggle
              open={presetsOpen}
              onToggle={() => setPresetsOpen((v) => !v)}
              label={t("sidebar.presets")}
              hint={t("sidebar.presetsHint")}
            />
          {presetsOpen && (
            <SidebarNested>
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="presets">
                  {(droppableProvided) => (
                    <div
                      className="space-y-0.5"
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                    >
                      {orderedPresets.map((preset, index) => {
                        const isActive = viewedPreset?.id === preset.id;
                        const presetIcon = getPresetIconOption(preset);
                        const PresetIcon = presetIcon.icon;
                        const weakName = isWeakPresetName(preset.name);
                        const presetRowActive = isActive && isMySkillsRoute;
                        const presetRowSelected = isActive && !isMySkillsRoute;
                        return (
                          <Draggable key={preset.id} draggableId={preset.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "group relative flex items-center rounded-[5px] transition-colors",
                                  presetRowActive && "bg-surface-active",
                                  presetRowSelected && "bg-accent/5 ring-1 ring-inset ring-accent/20",
                                  !isActive && "hover:bg-surface-hover"
                                )}
                              >
                                <button
                                  onClick={() => handleSwitchPreset(preset.id)}
                                  className={cn(
                                    "flex min-w-0 flex-1 items-center gap-2 px-2 py-[6px] text-left text-[13px] leading-5 outline-none",
                                    isActive ? "font-medium text-primary" : "text-tertiary group-hover:text-secondary"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded border",
                                      isActive
                                        ? `${presetIcon.activeClass} ${presetIcon.colorClass}`
                                        : "border-border bg-surface text-muted group-hover:border-border group-hover:text-tertiary"
                                    )}
                                  >
                                    <PresetIcon className="h-3 w-3" />
                                  </span>
                                  <span
                                    className={cn("flex-1 truncate", weakName && "text-amber-500/90")}
                                    title={weakName ? t("preset.weakNameBadge") : undefined}
                                  >
                                    {preset.name}
                                  </span>
                                  <span className="ml-auto flex h-[18px] w-[32px] shrink-0 items-center justify-end group-hover:hidden">
                                    {preset.skill_count > 0 && (
                                      <span
                                        className={cn(
                                          "min-w-[18px] rounded-full px-1.5 text-center text-[12px] font-medium leading-[18px] tabular-nums",
                                          isActive
                                            ? "bg-accent-bg text-accent-light"
                                            : "bg-surface-hover text-muted"
                                        )}
                                      >
                                        {preset.skill_count}
                                      </span>
                                    )}
                                  </span>
                                </button>
                                <div className={cn(
                                  "absolute right-1 flex items-center rounded-[3px] invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100",
                                  isActive ? "bg-surface-active" : "bg-surface-hover"
                                )}>
                                  <div
                                    {...provided.dragHandleProps}
                                    className="rounded p-1 text-faint cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </div>
                                  <button
                                    onClick={(event) => handleRenameClick(event, preset)}
                                    className="rounded p-1 text-faint transition hover:text-secondary"
                                    title={t("common.rename")}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={(event) => handleDeleteClick(event, preset)}
                                    className="rounded p-1 text-faint transition hover:text-red-400"
                                    title={t("common.delete")}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {droppableProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-0.5 flex w-full items-center gap-2 rounded-[5px] px-2 py-[6px] text-[13px] text-muted transition-colors outline-none hover:bg-surface-hover hover:text-secondary"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("sidebar.newPreset")}
              </button>
            </SidebarNested>
          )}
          </section>

          {renderToolGroup({
            category: "coding",
            headingLabel: t("sidebar.globalWorkspace"),
            headingHint: t("sidebar.globalWorkspaceHint"),
            allAgentsLabel: t("globalWorkspace.allAgents"),
            emptyLabel: t("globalWorkspace.noAgents"),
            basePath: "/global-workspace",
            droppableId: "global-workspace-tools",
            tools: orderedCodingTools,
            isOpen: globalWorkspaceOpen,
            onToggle: () => setGlobalWorkspaceOpen((v) => !v),
            // Always show the Global Workspace section (even when empty) so users
            // with no detected coding agents still see the "All Agents" entry.
            hideWhenEmpty: false,
          })}

          {installedLobsterTools.length > 0 && (
            renderToolGroup({
                category: "lobster",
                headingLabel: t("sidebar.lobsterAgents"),
                allAgentsLabel: t("lobsterWorkspace.allAgents"),
                emptyLabel: t("lobsterWorkspace.noAgents"),
                basePath: "/lobster-workspace",
                droppableId: "lobster-workspace-tools",
                tools: orderedLobsterTools,
                isOpen: lobsterWorkspaceOpen,
                onToggle: () => setLobsterWorkspaceOpen((v) => !v),
                hideWhenEmpty: true,
              })
          )}

        </div>

        {/* Account + system */}
        <div className="sidebar-footer">
          {isServerMode && (
            isAuthenticated && user ? (
              <div className="sidebar-account-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                      <User className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-primary">
                        {user.display_name || user.username}
                      </p>
                      <p className="truncate text-[11px] text-muted">@{user.username}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate("/login");
                    }}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
                  >
                    {t("sidebar.signOut")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent/15"
              >
                <LogIn className="h-4 w-4 shrink-0" />
                {t("sidebar.signIn")}
              </button>
            )
          )}

          <p className="sidebar-scroll-label mb-1">{t("sidebar.sectionSystem")}</p>
          <div className="sidebar-system-nav">
            {isServerMode && isAuthenticated && (can("role.read") || can("user.read")) && (
              <Link
                to="/admin"
                onClick={() => closeSkillDetail()}
                className={cn(
                  "flex items-center gap-2.5 rounded-[5px] px-2.5 py-[7px] text-[13px] font-medium transition-colors outline-none",
                  location.pathname === "/admin"
                    ? "bg-surface-active text-primary"
                    : "text-tertiary hover:bg-surface hover:text-secondary"
                )}
              >
                <Shield
                  className={cn(
                    "h-4 w-4 shrink-0",
                    location.pathname === "/admin" ? "text-accent" : "text-muted"
                  )}
                />
                {t("sidebar.admin")}
              </Link>
            )}
            <Link
              to="/settings"
              onClick={() => closeSkillDetail()}
              className={cn(
                "flex items-center gap-2.5 rounded-[5px] px-2.5 py-[7px] text-[13px] font-medium transition-colors outline-none",
                location.pathname === "/settings"
                  ? "bg-surface-active text-primary"
                  : "text-tertiary hover:bg-surface hover:text-secondary"
              )}
            >
              <Settings
                className={cn(
                  "h-4 w-4 shrink-0",
                  location.pathname === "/settings" ? "text-accent" : "text-muted"
                )}
              />
              {t("sidebar.settings")}
            </Link>
          </div>
        </div>
      </aside>

      <CreatePresetDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreatePreset}
      />

      <RenamePresetDialog
        open={renameTarget !== null}
        currentName={renameTarget?.name || ""}
        currentIcon={renameTarget?.icon}
        onClose={() => setRenameTarget(null)}
        onRename={handleRenamePreset}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        message={t("preset.deleteConfirm", { name: deleteTarget?.name || "" })}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeletePreset}
      />

    </>
  );
}
