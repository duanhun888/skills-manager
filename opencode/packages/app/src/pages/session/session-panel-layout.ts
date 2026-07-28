export function sessionPanelLayout(input: { review: boolean; terminal: boolean }) {
  return {
    visible: input.review || input.terminal,
    stacked: input.review && input.terminal,
  }
}
