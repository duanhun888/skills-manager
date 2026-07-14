import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "../context/useAuth";
import { isAppError } from "../lib/error";
import { ServerApiError, SERVER_API_URL_FIXED } from "../lib/serverApi";

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isServerMode, isAuthenticated, serverApiUrl } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, from, navigate]);

  if (!isServerMode) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-6">
        <div className="app-panel max-w-md w-full p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-primary">{t("auth.serverNotConfigured")}</h1>
          <p className="text-sm text-muted">{t("auth.serverNotConfiguredHint")}</p>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            {t("auth.openSettings")}
          </button>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      toast.success(t("auth.loginSuccess"));
      navigate(from, { replace: true });
    } catch (err) {
      let message = t("common.error");
      if (isAppError(err)) {
        if (err.message === "unauthorized") {
          message = t("auth.invalidCredentials");
        } else if (err.message === "forbidden") {
          message = t("auth.forbidden");
        } else if (err.kind === "network") {
          message = err.message || t("auth.networkError");
        } else {
          message = err.message;
        }
      } else if (err instanceof ServerApiError) {
        message =
          err.status === 401
            ? t("auth.invalidCredentials")
            : t("auth.serverError", { detail: err.message });
      } else if (err instanceof TypeError || (err instanceof Error && /fetch|network|Failed/i.test(err.message))) {
        message = t("auth.networkError");
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <div className="app-panel max-w-md w-full p-6 space-y-5">
        <div className="space-y-1 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-bg">
            <LogIn className="h-5 w-5 text-accent" />
          </div>
          <h1 className="text-lg font-semibold text-primary">{t("auth.title")}</h1>
          <p className="text-sm text-muted">
            {SERVER_API_URL_FIXED ? t("auth.subtitleCentral") : t("auth.subtitle")}
          </p>
          {serverApiUrl && !SERVER_API_URL_FIXED && (
            <p className="text-xs text-muted font-mono truncate">{serverApiUrl}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="username" className="mb-1 block text-xs text-muted">
              {t("auth.username")}
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent"
              placeholder={t("auth.usernamePlaceholder")}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs text-muted">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("auth.signIn")}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate("/install/market")}
          className="w-full text-center text-sm text-muted hover:text-secondary transition-colors"
        >
          {t("auth.browseSkillsPlaza")}
        </button>
      </div>
    </div>
  );
}
