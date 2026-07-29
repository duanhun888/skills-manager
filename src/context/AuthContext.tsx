import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "../lib/tauri";
import {
  canPermission,
  fetchMe,
  fetchPermissions,
  getStoredToken,
  login as apiLogin,
  setStoredToken,
  DEFAULT_SERVER_API_URL,
  SERVER_API_URL_FIXED,
  type ServerUser,
} from "../lib/serverApi";

const SERVER_URL_KEY = "server_api_url";
const AUTH_FETCH_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    }),
  ]);
}

interface AuthContextValue {
  loading: boolean;
  serverApiUrl: string;
  isServerMode: boolean;
  isAuthenticated: boolean;
  user: ServerUser | null;
  permissions: string[];
  can: (code: string) => boolean;
  setServerApiUrl: (url: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export { AuthContext };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [serverApiUrl, setServerApiUrlState] = useState("");
  const [user, setUser] = useState<ServerUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const loadPermissions = useCallback(async (url: string, token: string) => {
    try {
      const perms = await fetchPermissions(url, token);
      setPermissions(perms);
    } catch {
      setPermissions([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!serverApiUrl.trim() || !token) {
      setUser(null);
      setPermissions([]);
      return;
    }
    try {
      const me = await fetchMe(serverApiUrl, token);
      setUser(me);
      await loadPermissions(serverApiUrl, token);
    } catch {
      setStoredToken(null);
      setUser(null);
      setPermissions([]);
    }
  }, [serverApiUrl, loadPermissions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let savedUrl = SERVER_API_URL_FIXED
          ? DEFAULT_SERVER_API_URL
          : (await withTimeout(api.getSettings(SERVER_URL_KEY), 5_000, "settings").catch(
              () => null
            ))?.trim() ?? "";
        if (!savedUrl) {
          savedUrl = DEFAULT_SERVER_API_URL;
        }
        if (SERVER_API_URL_FIXED || savedUrl) {
          await api.setSettings(SERVER_URL_KEY, savedUrl).catch(() => {});
        }
        if (cancelled) return;
        setServerApiUrlState(savedUrl);
        const token = getStoredToken();
        if (savedUrl && token) {
          try {
            const me = await withTimeout(fetchMe(savedUrl, token), AUTH_FETCH_TIMEOUT_MS, "fetchMe");
            if (!cancelled) setUser(me);
            if (!cancelled) {
              await withTimeout(
                loadPermissions(savedUrl, token),
                AUTH_FETCH_TIMEOUT_MS,
                "permissions"
              ).catch(() => setPermissions([]));
            }
            void api.syncOpenCodeModelPolicyFromServer(savedUrl);
          } catch {
            setStoredToken(null);
            if (!cancelled) {
              setUser(null);
              setPermissions([]);
            }
          }
        }
      } catch (err) {
        console.error("Auth init failed:", err);
      } finally {
        // Always exit the loading state — leaving it gated on `cancelled` can
        // strand the UI on a spinner under React StrictMode double-mount.
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPermissions]);

  const setServerApiUrl = useCallback(async (url: string) => {
    if (SERVER_API_URL_FIXED) {
      setServerApiUrlState(DEFAULT_SERVER_API_URL);
      return;
    }
    const trimmed = url.trim();
    await api.setSettings(SERVER_URL_KEY, trimmed);
    setServerApiUrlState(trimmed);
    if (!trimmed) {
      setStoredToken(null);
      setUser(null);
      setPermissions([]);
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      if (!serverApiUrl.trim()) {
        throw new Error("server url not configured");
      }
      const result = await apiLogin(serverApiUrl, username, password);
      setStoredToken(result.access_token);
      setUser(result.user);
      await loadPermissions(serverApiUrl, result.access_token);
      void api.syncOpenCodeModelPolicyFromServer(serverApiUrl);
    },
    [serverApiUrl, loadPermissions]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setPermissions([]);
  }, []);

  const can = useCallback(
    (code: string) => canPermission(permissions, user, code),
    [permissions, user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      serverApiUrl,
      isServerMode: serverApiUrl.trim().length > 0,
      isAuthenticated: user !== null,
      user,
      permissions,
      can,
      setServerApiUrl,
      login,
      logout,
      refreshUser,
    }),
    [loading, serverApiUrl, user, permissions, can, setServerApiUrl, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
