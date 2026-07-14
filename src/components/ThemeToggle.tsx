import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeContext } from "../context/ThemeContext";
import type { Theme } from "../hooks/useTheme";
import { cn } from "../utils";

const themeOptions: Array<{
  value: Theme;
  labelKey: "settings.themeLight" | "settings.themeDark" | "settings.themeSystem";
  icon: typeof Sun;
}> = [
  { value: "light", labelKey: "settings.themeLight", icon: Sun },
  { value: "dark", labelKey: "settings.themeDark", icon: Moon },
  { value: "system", labelKey: "settings.themeSystem", icon: Monitor },
];

interface ThemeToggleProps {
  /** Compact icon-only layout for the title bar. */
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeContext();

  const buttonClass = compact
    ? "flex h-6 w-6 items-center justify-center rounded-[3px] transition-colors outline-none"
    : "flex h-7 items-center gap-1 rounded-[3px] px-2 text-[12px] font-medium transition-colors outline-none";

  return (
    <div
      role="group"
      aria-label={t("settings.theme")}
      className={cn(
        "flex rounded-[4px] border border-border-subtle bg-background p-px",
        compact ? "shadow-none" : "shadow-sm"
      )}
    >
      {themeOptions.map((opt) => {
        const Icon = opt.icon;
        const label = t(opt.labelKey);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-label={label}
            aria-pressed={theme === opt.value}
            title={label}
            className={cn(
              buttonClass,
              theme === opt.value
                ? "bg-surface-active text-secondary"
                : "text-muted hover:text-tertiary"
            )}
          >
            <Icon className={cn("shrink-0", compact ? "h-3 w-3" : "h-3 w-3")} aria-hidden />
            {!compact ? <span className="hidden sm:inline">{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
