import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Shield, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "../context/useAuth";
import { getStoredToken } from "../lib/serverApi";
import type { PermissionDto, RoleDto } from "../lib/serverApi";
import { parseRolePermissions, serverRequest } from "../lib/serverApi";
import { isAppError } from "../lib/error";
import { AdminUsers } from "./AdminUsers";
import { AdminModelPolicy } from "./AdminModelPolicy";
import { userIsOps } from "../lib/serverApi";

function permsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export function AdminPanel() {
  const { t } = useTranslation();
  const { serverApiUrl, can, refreshUser, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<PermissionDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [draftPerms, setDraftPerms] = useState<Record<number, string[]>>({});
  const [savedPerms, setSavedPerms] = useState<Record<number, string[]>>({});
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const [savedNames, setSavedNames] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [tab, setTab] = useState<"roles" | "users" | "policy">("roles");

  const token = getStoredToken();
  const canManage = can("role.manage");
  const canReadRoles = can("role.read");
  const canReadUsers = can("user.read");
  const isOps = userIsOps(user);
  const canAccess = canReadRoles || canReadUsers || isOps;

  const groupedPermissions = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of permissions) {
      const list = map.get(p.group_name) ?? [];
      list.push(p);
      map.set(p.group_name, list);
    }
    return map;
  }, [permissions]);

  const load = useCallback(async () => {
    if (!token || !serverApiUrl || !canAccess) return;
    setLoading(true);
    try {
      const needRoles = canReadRoles || can("user.create") || can("user.manage");
      const [permRows, roleRows] = await Promise.all([
        canReadRoles
          ? serverRequest<PermissionDto[]>(serverApiUrl, token, "GET", "/api/v1/permissions")
          : Promise.resolve([] as PermissionDto[]),
        needRoles
          ? serverRequest<RoleDto[]>(serverApiUrl, token, "GET", "/api/v1/roles")
          : Promise.resolve([] as RoleDto[]),
      ]);
      setPermissions(permRows);
      setRoles(roleRows);

      const drafts: Record<number, string[]> = {};
      const names: Record<number, string> = {};
      const expandedInit: Record<number, boolean> = {};
      for (const role of roleRows) {
        drafts[role.id] = parseRolePermissions(role.permissions);
        names[role.id] = role.name;
        expandedInit[role.id] = !role.is_system;
      }
      setDraftPerms(drafts);
      setSavedPerms(structuredClone(drafts));
      setDraftNames(names);
      setSavedNames(structuredClone(names));
      setExpanded(expandedInit);
    } catch (err) {
      const msg = isAppError(err) ? err.message : t("common.error");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [serverApiUrl, token, t, canAccess, canReadRoles, can]);

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess, load]);

  useEffect(() => {
    if (!canReadRoles && canReadUsers) setTab("users");
    else if (!canReadRoles && !canReadUsers && isOps) setTab("policy");
  }, [canReadRoles, canReadUsers, isOps]);

  const isDirty = (roleId: number) =>
    !permsEqual(draftPerms[roleId] ?? [], savedPerms[roleId] ?? []) ||
    (draftNames[roleId] ?? "") !== (savedNames[roleId] ?? "");

  const togglePerm = (roleId: number, code: string) => {
    setDraftPerms((prev) => {
      const set = new Set(prev[roleId] ?? []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...prev, [roleId]: [...set] };
    });
  };

  const setGroupPerms = (roleId: number, codes: string[], selected: boolean) => {
    setDraftPerms((prev) => {
      const set = new Set(prev[roleId] ?? []);
      for (const code of codes) {
        if (selected) set.add(code);
        else set.delete(code);
      }
      return { ...prev, [roleId]: [...set] };
    });
  };

  const saveRole = async (roleId: number) => {
    if (!token) return;
    setSavingId(roleId);
    try {
      const name = draftNames[roleId]?.trim();
      await serverRequest(serverApiUrl, token, "PATCH", `/api/v1/roles/${roleId}`, {
        name: name || undefined,
        permissions: draftPerms[roleId] ?? [],
      });
      toast.success(t("admin.roleSaved"));
      await load();
      await refreshUser();
    } catch (err) {
      toast.error(isAppError(err) ? err.message : t("common.error"));
    } finally {
      setSavingId(null);
    }
  };

  const createRole = async () => {
    if (!token || !newCode.trim() || !newName.trim()) return;
    try {
      await serverRequest(serverApiUrl, token, "POST", "/api/v1/roles", {
        code: newCode.trim(),
        name: newName.trim(),
        permissions: [],
      });
      toast.success(t("admin.roleCreated"));
      setNewCode("");
      setNewName("");
      await load();
    } catch (err) {
      toast.error(isAppError(err) ? err.message : t("common.error"));
    }
  };

  const deleteRole = async (role: RoleDto) => {
    if (!token || role.is_system) return;
    if (!window.confirm(t("admin.deleteRoleConfirm", { name: role.name }))) return;
    try {
      await serverRequest(serverApiUrl, token, "DELETE", `/api/v1/roles/${role.id}`);
      toast.success(t("admin.roleDeleted"));
      await load();
    } catch (err) {
      toast.error(isAppError(err) ? err.message : t("common.error"));
    }
  };

  if (!canAccess) {
    return (
      <div className="app-page app-page-narrow">
        <p className="text-muted text-sm">{t("admin.noAccess")}</p>
      </div>
    );
  }

  const showTabs = [canReadRoles, canReadUsers, isOps].filter(Boolean).length > 1;

  return (
    <div className="app-page">
      <div className="app-page-header mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          <h1 className="app-page-title">{t("admin.title")}</h1>
        </div>
        <p className="app-page-subtitle text-tertiary">{t("admin.subtitle")}</p>
        {showTabs && (
          <div className="app-segmented inline-flex mt-3">
            {canReadRoles && (
              <button
                type="button"
                onClick={() => setTab("roles")}
                className={`app-segmented-button ${tab === "roles" ? "app-segmented-button-active" : ""}`}
              >
                {t("admin.tabRoles")}
              </button>
            )}
            {canReadUsers && (
              <button
                type="button"
                onClick={() => setTab("users")}
                className={`app-segmented-button ${tab === "users" ? "app-segmented-button-active" : ""}`}
              >
                {t("admin.tabUsers")}
              </button>
            )}
            {isOps && (
              <button
                type="button"
                onClick={() => setTab("policy")}
                className={`app-segmented-button ${tab === "policy" ? "app-segmented-button-active" : ""}`}
              >
                {t("admin.tabPolicy")}
              </button>
            )}
          </div>
        )}
      </div>

      {tab === "policy" && isOps ? (
        <AdminModelPolicy />
      ) : tab === "users" && canReadUsers ? (
        loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : (
          <div className="max-w-4xl">
            <AdminUsers roles={roles} />
          </div>
        )
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-3 max-w-4xl">
          {canManage && (
            <div className="app-panel p-4 space-y-3">
              <h2 className="text-sm font-semibold text-primary">{t("admin.createRole")}</h2>
              <div className="flex flex-wrap gap-2">
                <input
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm min-w-[120px]"
                  placeholder={t("admin.roleCode")}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
                <input
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm flex-1 min-w-[160px]"
                  placeholder={t("admin.roleName")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button
                  type="button"
                  onClick={createRole}
                  disabled={!newCode.trim() || !newName.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {t("admin.addRole")}
                </button>
              </div>
            </div>
          )}

          {roles.map((role) => {
            const isOps = role.code === "ops";
            const isOpen = expanded[role.id] ?? true;
            const dirty = isDirty(role.id);
            const rolePerms = draftPerms[role.id] ?? [];

            return (
              <div key={role.id} className="app-panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [role.id]: !isOpen }))}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0 text-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {canManage && !role.is_system ? (
                        <input
                          className="rounded-md border border-border bg-surface px-2 py-0.5 text-sm font-semibold text-primary max-w-[200px]"
                          value={draftNames[role.id] ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setDraftNames((prev) => ({ ...prev, [role.id]: e.target.value }))
                          }
                          placeholder={t("admin.roleName")}
                        />
                      ) : (
                        <span className="text-sm font-semibold text-primary truncate">
                          {draftNames[role.id] ?? role.name}
                        </span>
                      )}
                      <span className="font-mono text-xs text-muted">{role.code}</span>
                      {role.is_system ? (
                        <span className="text-xs text-amber-500">{t("admin.systemRole")}</span>
                      ) : null}
                      {isOps ? (
                        <>
                          <span className="text-xs text-violet-400">{t("admin.opsSuperAdmin")}</span>
                          <span className="text-xs text-accent">{t("admin.opsFullAccess")}</span>
                        </>
                      ) : null}
                      {dirty ? (
                        <span className="text-xs text-amber-400">{t("admin.unsaved")}</span>
                      ) : null}
                    </div>
                    {!isOpen && (
                      <p className="text-xs text-muted mt-0.5">
                        {t("admin.permCount", { count: rolePerms.length })}
                      </p>
                    )}
                    {role.code === "admin" && !role.is_system ? (
                      <p className="text-xs text-amber-500 mt-0.5">{t("admin.confusingAdminRole")}</p>
                    ) : null}
                  </div>
                  {canManage && !role.is_system && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRole(role);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          deleteRole(role);
                        }
                      }}
                      className="p-1.5 rounded text-muted hover:text-red-400 hover:bg-surface-active"
                      title={t("admin.deleteRole")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-border-subtle px-4 py-3 space-y-3">
                    {isOps ? (
                      <p className="text-sm text-secondary rounded-md bg-surface-hover border border-border-subtle px-3 py-2">
                        {t("admin.opsHint")}
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[...groupedPermissions.entries()].map(([group, perms]) => {
                          const codes = perms.map((p) => p.code);
                          const allSelected = codes.every((c) => rolePerms.includes(c));
                          const someSelected = codes.some((c) => rolePerms.includes(c));

                          return (
                            <div
                              key={group}
                              className="rounded-md border border-border-subtle bg-surface/50 p-3"
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-xs font-semibold text-primary">{group}</p>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setGroupPerms(role.id, codes, !allSelected)
                                    }
                                    className="text-[11px] text-accent hover:underline"
                                  >
                                    {allSelected
                                      ? t("admin.deselectAll")
                                      : someSelected
                                        ? t("admin.selectAll")
                                        : t("admin.selectAll")}
                                  </button>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                {perms.map((p) => (
                                  <label
                                    key={p.id}
                                    className="flex items-start gap-2 text-sm text-secondary cursor-pointer"
                                    title={p.description ?? undefined}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!canManage}
                                      checked={rolePerms.includes(p.code)}
                                      onChange={() => togglePerm(role.id, p.code)}
                                      className="mt-0.5 rounded border-border"
                                    />
                                    <span>
                                      {p.name}
                                      {p.description ? (
                                        <span className="block text-[11px] text-muted leading-tight">
                                          {p.description}
                                        </span>
                                      ) : null}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {canManage && !isOps && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => saveRole(role.id)}
                          disabled={savingId === role.id || !dirty}
                          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                        >
                          {savingId === role.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : null}
                          {t("common.save")}
                        </button>
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraftPerms((prev) => ({
                                ...prev,
                                [role.id]: [...(savedPerms[role.id] ?? [])],
                              }));
                              setDraftNames((prev) => ({
                                ...prev,
                                [role.id]: savedNames[role.id] ?? "",
                              }));
                            }}
                            className="text-sm text-muted hover:text-secondary"
                          >
                            {t("admin.discard")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
