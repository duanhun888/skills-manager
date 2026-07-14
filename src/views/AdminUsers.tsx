import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "../context/useAuth";
import { isAppError } from "../lib/error";
import {
  createUser,
  deleteUser,
  fetchUsers,
  getStoredToken,
  parseRolePermissions,
  type RoleDto,
  type ServerUserListItem,
  updateUser,
} from "../lib/serverApi";

interface Props {
  roles: RoleDto[];
}

interface UserDraft {
  display_name: string;
  status: "active" | "disabled";
  roles: string[];
  password: string;
}

function rolesFromUser(u: ServerUserListItem): string[] {
  const list = parseRolePermissions(u.roles);
  return list.length > 0 ? list : ["member"];
}

export function AdminUsers({ roles }: Props) {
  const { t } = useTranslation();
  const { serverApiUrl, can, user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ServerUserListItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["member"]);

  const token = getStoredToken();
  const canRead = can("user.read");
  const canCreate = can("user.create");
  const canManage = can("user.manage");

  const load = useCallback(async () => {
    if (!token || !serverApiUrl || !canRead) return;
    setLoading(true);
    try {
      const rows = await fetchUsers(serverApiUrl, token);
      setUsers(rows);
      const nextDrafts: Record<string, UserDraft> = {};
      const nextExpanded: Record<string, boolean> = {};
      for (const u of rows) {
        nextDrafts[u.id] = {
          display_name: u.display_name,
          status: u.status === "disabled" ? "disabled" : "active",
          roles: rolesFromUser(u),
          password: "",
        };
        nextExpanded[u.id] = false;
      }
      setDrafts(nextDrafts);
      setExpanded(nextExpanded);
    } catch (err) {
      toast.error(isAppError(err) ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [serverApiUrl, token, canRead, t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCreateRole = (code: string) => {
    setSelectedRoles((prev) => {
      const set = new Set(prev);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      const next = [...set];
      return next.length > 0 ? next : ["member"];
    });
  };

  const toggleDraftRole = (userId: string, code: string) => {
    setDrafts((prev) => {
      const draft = prev[userId];
      if (!draft) return prev;
      const set = new Set(draft.roles);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      const rolesList = [...set];
      return {
        ...prev,
        [userId]: { ...draft, roles: rolesList.length > 0 ? rolesList : ["member"] },
      };
    });
  };

  const handleCreate = async () => {
    if (!token || !username.trim() || !displayName.trim() || password.length < 6) return;
    setCreating(true);
    try {
      await createUser(serverApiUrl, token, {
        username: username.trim(),
        password,
        display_name: displayName.trim(),
        roles: selectedRoles,
      });
      toast.success(t("admin.users.created"));
      setUsername("");
      setPassword("");
      setDisplayName("");
      setSelectedRoles(["member"]);
      await load();
    } catch (err) {
      toast.error(isAppError(err) ? err.message : t("common.error"));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (userId: string) => {
    if (!token) return;
    const draft = drafts[userId];
    if (!draft) return;
    setSavingId(userId);
    try {
      const body: {
        display_name: string;
        status: "active" | "disabled";
        roles: string[];
        password?: string;
      } = {
        display_name: draft.display_name.trim(),
        status: draft.status,
        roles: draft.roles,
      };
      if (draft.password.length >= 6) {
        body.password = draft.password;
      }
      await updateUser(serverApiUrl, token, userId, body);
      toast.success(t("admin.users.updated"));
      await load();
    } catch (err) {
      toast.error(isAppError(err) ? err.message : t("common.error"));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (u: ServerUserListItem) => {
    if (!token) return;
    if (!window.confirm(t("admin.users.deleteConfirm", { name: u.username }))) return;
    try {
      await deleteUser(serverApiUrl, token, u.id);
      toast.success(t("admin.users.deleted"));
      await load();
    } catch (err) {
      toast.error(isAppError(err) ? err.message : t("common.error"));
    }
  };

  if (!canRead) {
    return <p className="text-muted text-sm">{t("admin.users.noAccess")}</p>;
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="app-panel p-4 space-y-3">
          <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t("admin.users.create")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              placeholder={t("admin.users.username")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
            <input
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              placeholder={t("admin.users.displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <input
              type="password"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm sm:col-span-2"
              placeholder={t("admin.users.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <p className="text-xs text-muted mb-2">{t("admin.users.assignRoles")}</p>
            <div className="flex flex-wrap gap-3">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-1.5 text-sm text-secondary">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.code)}
                    onChange={() => toggleCreateRole(role.code)}
                    className="rounded border-border"
                  />
                  {role.name}
                  <span className="font-mono text-xs text-muted">{role.code}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={
              creating || !username.trim() || !displayName.trim() || password.length < 6
            }
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t("admin.users.add")}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isOpen = expanded[u.id] ?? false;
            const draft = drafts[u.id];
            const isSelf = currentUser?.id === u.id;

            return (
              <div key={u.id} className="app-panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [u.id]: !isOpen }))}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0 text-muted" />
                  )}
                  <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <span className="font-mono text-primary truncate">{u.username}</span>
                    <span className="text-secondary truncate">{u.display_name}</span>
                    <span className="text-muted font-mono text-xs truncate">
                      {u.roles || "member"}
                    </span>
                    <span
                      className={
                        u.status === "disabled" ? "text-amber-500" : "text-muted"
                      }
                    >
                      {u.status === "disabled"
                        ? t("admin.users.statusDisabled")
                        : t("admin.users.statusActive")}
                    </span>
                  </div>
                  {canManage && !isSelf && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(u);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          handleDelete(u);
                        }
                      }}
                      className="p-1.5 rounded text-muted hover:text-red-400 hover:bg-surface-active"
                      title={t("admin.users.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </span>
                  )}
                </button>

                {isOpen && draft && canManage && (
                  <div className="border-t border-border-subtle px-4 py-3 space-y-3">
                    <label className="block max-w-md">
                      <span className="text-xs text-muted">{t("admin.users.displayName")}</span>
                      <input
                        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
                        value={draft.display_name}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [u.id]: { ...draft, display_name: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <div>
                      <span className="text-xs text-muted">{t("admin.users.status")}</span>
                      <div className="app-segmented inline-flex mt-1">
                        {(["active", "disabled"] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={isSelf && status === "disabled"}
                            onClick={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [u.id]: { ...draft, status },
                              }))
                            }
                            className={`app-segmented-button ${
                              draft.status === status ? "app-segmented-button-active" : ""
                            } ${isSelf && status === "disabled" ? "opacity-40 cursor-not-allowed" : ""}`}
                          >
                            {status === "active"
                              ? t("admin.users.statusActive")
                              : t("admin.users.statusDisabled")}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted mb-2">{t("admin.users.assignRoles")}</p>
                      <div className="flex flex-wrap gap-3">
                        {roles.map((role) => (
                          <label
                            key={role.id}
                            className="flex items-center gap-1.5 text-sm text-secondary"
                          >
                            <input
                              type="checkbox"
                              checked={draft.roles.includes(role.code)}
                              onChange={() => toggleDraftRole(u.id, role.code)}
                              className="rounded border-border"
                            />
                            {role.name}
                            <span className="font-mono text-xs text-muted">{role.code}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="block max-w-md">
                      <span className="text-xs text-muted">{t("admin.users.newPassword")}</span>
                      <input
                        type="password"
                        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
                        placeholder={t("admin.users.passwordOptional")}
                        value={draft.password}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [u.id]: { ...draft, password: e.target.value },
                          }))
                        }
                        autoComplete="new-password"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSave(u.id)}
                      disabled={savingId === u.id || !draft.display_name.trim()}
                      className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      {savingId === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      {t("common.save")}
                    </button>
                  </div>
                )}
                {isOpen && !canManage && (
                  <div className="border-t border-border-subtle px-4 py-3 text-sm text-muted">
                    {t("admin.users.readOnly")}
                  </div>
                )}
              </div>
            );
          })}
          {users.length === 0 && (
            <p className="text-center text-muted text-sm py-8">{t("admin.users.empty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
