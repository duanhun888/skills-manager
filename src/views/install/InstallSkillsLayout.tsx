import { startTransition, useCallback } from "react";
import { Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Box, Cloud, Github, UploadCloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils";
import { useAuth } from "../../context/useAuth";

const TAB_ITEMS: Array<{
  id: string;
  labelKey: string;
  icon: typeof Box;
  serverOnly?: boolean;
}> = [
  { id: "market", labelKey: "install.browseMarket", icon: Box },
  { id: "local", labelKey: "install.localInstall", icon: UploadCloud },
  { id: "git", labelKey: "install.gitInstall", icon: Github },
  { id: "server", labelKey: "install.serverTab", icon: Cloud, serverOnly: true },
] ;

export function InstallSkillsLayout() {
  const { t } = useTranslation();
  const { isServerMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = TAB_ITEMS.filter((tab) => !tab.serverOnly || isServerMode);

  const handleTabClick = useCallback(
    (tabId: string) => {
      const nextPath = `/install/${tabId}`;
      if (location.pathname === nextPath) return;
      startTransition(() => {
        navigate(nextPath);
      });
    },
    [location.pathname, navigate]
  );

  if (location.pathname === "/install" || location.pathname === "/install/") {
    return <Navigate to="/install/market" replace />;
  }

  return (
    <div className="app-page gap-4">
      <div className="app-page-header border-b-0 pb-0">
        <h1 className="app-page-title mb-4">{t("install.title")}</h1>
        <div className="relative z-10 flex gap-1 border-b border-border-subtle">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === `/install/${tab.id}`;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={cn(
                  "mr-4 flex items-center gap-1.5 border-b-2 px-1 pb-1.5 text-[13px] font-medium transition-colors outline-none",
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-tertiary"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <Outlet key={location.pathname} />
    </div>
  );
}
