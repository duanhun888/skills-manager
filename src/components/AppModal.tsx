import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../utils";
import {
  CONTENT_OVERLAY_Z_INDEX,
  MODAL_Z_INDEX,
  contentOverlayBoundsStyle,
} from "../lib/layoutChrome";

export type AppModalScope = "fullscreen" | "content";

interface AppModalProps {
  open: boolean;
  scope?: AppModalScope;
  onBackdropClick?: () => void;
  backdropClassName?: string;
  className?: string;
  children: ReactNode;
}

/** Portaled modal shell — always above the sidebar (fullscreen) or content-only. */
export function AppModal({
  open,
  scope = "fullscreen",
  onBackdropClick,
  backdropClassName = "bg-black/70 backdrop-blur-sm",
  className,
  children,
}: AppModalProps) {
  if (!open) return null;

  const style: CSSProperties =
    scope === "content"
      ? { ...contentOverlayBoundsStyle, zIndex: CONTENT_OVERLAY_Z_INDEX }
      : { inset: 0, zIndex: MODAL_Z_INDEX };

  return createPortal(
    <div
      className={cn("fixed flex items-center justify-center", className)}
      style={style}
    >
      {onBackdropClick ? (
        <div
          className={cn("absolute inset-0", backdropClassName)}
          onClick={onBackdropClick}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </div>,
    document.body
  );
}
