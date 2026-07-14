import { createPortal } from "react-dom";
import { useEffect } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { contentOverlayBoundsStyle, CONTENT_OVERLAY_Z_INDEX } from "../lib/layoutChrome";

const IS_MACOS = navigator.userAgent.includes("Mac");

interface DetailSheetProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function DetailSheet({
  open,
  title,
  description,
  meta,
  onClose,
  children,
}: DetailSheetProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed pointer-events-none"
      style={{ ...contentOverlayBoundsStyle, zIndex: CONTENT_OVERLAY_Z_INDEX }}
      role="presentation"
    >
      <div
        className={
          IS_MACOS
            ? "absolute inset-0 bg-black/65 pointer-events-auto"
            : "absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        }
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-0 flex min-h-0 flex-col overflow-hidden border-l border-border-subtle bg-bg-secondary shadow-2xl pointer-events-auto"
      >
        <div className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
            aria-label={t("common.closeLabel")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4 scrollbar-hide">
          <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-primary">
            {title}
          </h2>
          {description ? (
            <div className="mt-2 text-[15px] leading-7 text-secondary">{description}</div>
          ) : null}
          {meta ? <div className="mt-4">{meta}</div> : null}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
