export function warnRejected(results: PromiseSettledResult<unknown>[], label: string) {
  for (const r of results) {
    if (r.status === "rejected") console.warn(`${label} failed:`, r.reason);
  }
}
