import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { StatusBanner } from "./StatusBanner";
import { CommandPalette } from "./CommandPalette";
import { useApp } from "../context/AppContext";
import { useTranslation } from "react-i18next";
import { useDragWindow } from "../hooks/useDragWindow";
import { TOP_BAR_HEIGHT_PX, SIDEBAR_WIDTH_PX } from "../lib/layoutChrome";
import { ThemeToggle } from "./ThemeToggle";
import { GlobalSkillDetail } from "./GlobalSkillDetail";

export function Layout() {
  const { t } = useTranslation();
  const { appError, refreshAppData } = useApp();
  const onDrag = useDragWindow();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        navigate("/settings");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        refreshAppData();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, refreshAppData]);

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background text-primary">
      <div
        onMouseDown={onDrag}
        className="absolute top-0 z-[210] h-[28px] border-b border-border-subtle bg-bg-secondary"
        style={{ left: 0, right: 0 }}
      />
      <div
        className="pointer-events-auto absolute top-0 z-[220] flex h-[28px] items-center justify-end pr-2"
        style={{ left: SIDEBAR_WIDTH_PX, right: 0 }}
      >
        <ThemeToggle compact />
      </div>
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex-1 overflow-x-hidden overflow-y-auto px-5 pb-5 scrollbar-hide"
          style={{ paddingTop: TOP_BAR_HEIGHT_PX + 16 }}
        >
          <div className="mx-auto flex min-h-full max-w-[1200px] flex-col gap-4">
            {appError ? (
              <StatusBanner
                compact
                title={t("common.dataOutOfDate")}
                description={appError}
                actionLabel={t("common.retry")}
                onAction={refreshAppData}
                tone="danger"
              />
            ) : null}
            <Outlet />
          </div>
        </div>
      </main>
      <CommandPalette />
      <GlobalSkillDetail />
    </div>
  );
}
