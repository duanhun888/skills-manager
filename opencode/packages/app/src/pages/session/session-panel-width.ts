// The review pane has no width of its own: it takes whatever the chat panel
// leaves behind. Instead of capping the chat panel at a fraction of the window
// (which forces the review pane to grow with the monitor), reserve a fixed
// minimum for the review pane and let the chat panel take everything else.
export const SESSION_PANEL_WIDTH_MIN = 450
export const REVIEW_PANE_WIDTH_MIN = 480
export const REVIEW_PANE_WIDTH_MIN_SPLIT = 800

export function sessionPanelWidthMax(input: {
  available: number
  split: boolean
  fileTree?: number
}) {
  const pane = input.split ? REVIEW_PANE_WIDTH_MIN_SPLIT : REVIEW_PANE_WIDTH_MIN
  const tree = input.fileTree ?? 0
  return Math.max(SESSION_PANEL_WIDTH_MIN, input.available - pane - tree)
}

// `available` is undefined until the layout row is first measured; render the
// stored width untouched until then to avoid a first-frame snap.
export function clampSessionPanelWidth(input: {
  width: number
  available: number | undefined
  split: boolean
  fileTree?: number
}) {
  if (input.available === undefined) return input.width
  return Math.min(
    input.width,
    sessionPanelWidthMax({
      available: input.available,
      split: input.split,
      fileTree: input.fileTree,
    }),
  )
}
