/** Shared layout dimensions and stacking for sidebar + overlays. */
export const SIDEBAR_WIDTH_PX = 220;
export const TOP_BAR_HEIGHT_PX = 28;

export const SIDEBAR_Z_INDEX = 10002;
export const COMMAND_PALETTE_Z_INDEX = 10000;
/** Full-screen dialogs (cover sidebar). */
export const MODAL_Z_INDEX = 10001;
/** Content-area overlays (DetailSheet, upload dialog, drawers). */
export const CONTENT_OVERLAY_Z_INDEX = 10001;

/** Bounds for overlays that should cover the main content area only (not the sidebar). */
export const contentOverlayBoundsStyle = {
  top: TOP_BAR_HEIGHT_PX,
  left: SIDEBAR_WIDTH_PX,
  right: 0,
  bottom: 0,
} as const;
