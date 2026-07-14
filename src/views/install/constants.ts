export const MARKET_PAGE_SIZE = 24;
export const MARKET_SEARCH_STEP = 60;
export const MARKET_SEARCH_DEBOUNCE_MS = 450;
export const MARKET_SEARCH_CACHE_TTL_MS = 120_000;
export const MARKET_SEARCH_CACHE_MAX_ENTRIES = 150;
export const MARKET_SOURCE_PILL_LIMIT = 10;

export type MarketBoard = "hot" | "trending" | "alltime";

export function marketSnapshotKey(
  query: string,
  tab: MarketBoard,
  limit: number
): string {
  const trimmed = query.trim().toLowerCase();
  return trimmed ? `q:${trimmed}|${limit}` : `tab:${tab}`;
}
