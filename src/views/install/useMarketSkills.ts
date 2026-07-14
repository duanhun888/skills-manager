import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../../lib/tauri";
import type { SkillsShSkill } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import {
  MARKET_SEARCH_CACHE_MAX_ENTRIES,
  MARKET_SEARCH_CACHE_TTL_MS,
  MARKET_SEARCH_DEBOUNCE_MS,
  MARKET_SEARCH_STEP,
  marketSnapshotKey,
  type MarketBoard,
} from "./constants";

export function useMarketSkills() {
  const { t } = useTranslation();

  const [marketTab, setMarketTab] = useState<MarketBoard>("alltime");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showAllSources, setShowAllSources] = useState(false);
  const [skills, setSkills] = useState<SkillsShSkill[]>([]);
  const [page, setPage] = useState(1);
  const [searchLimit, setSearchLimit] = useState(MARKET_SEARCH_STEP);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const searchCacheRef = useRef<Map<string, { timestamp: number; data: SkillsShSkill[] }>>(
    new Map()
  );
  const snapshotRef = useRef<Map<string, SkillsShSkill[]>>(new Map());
  const skillsLengthRef = useRef(0);

  useEffect(() => {
    skillsLengthRef.current = skills.length;
  }, [skills.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, MARKET_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const pruneSearchCache = useCallback(() => {
    const now = Date.now();
    for (const [key, value] of searchCacheRef.current.entries()) {
      if (now - value.timestamp >= MARKET_SEARCH_CACHE_TTL_MS) {
        searchCacheRef.current.delete(key);
      }
    }
    if (searchCacheRef.current.size <= MARKET_SEARCH_CACHE_MAX_ENTRIES) return;
    const sorted = Array.from(searchCacheRef.current.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const removeCount = searchCacheRef.current.size - MARKET_SEARCH_CACHE_MAX_ENTRIES;
    for (const [key] of sorted.slice(0, removeCount)) {
      searchCacheRef.current.delete(key);
    }
  }, []);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const snapshotKey = marketSnapshotKey(trimmed, marketTab, searchLimit);
    const isLoadingMore =
      trimmed.length > 0 &&
      skillsLengthRef.current > 0 &&
      searchLimit > skillsLengthRef.current;

    if (trimmed.length > 0 && !isLoadingMore) {
      const cacheKey = `${trimmed.toLowerCase()}|${searchLimit}`;
      const cached = searchCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < MARKET_SEARCH_CACHE_TTL_MS) {
        setSkills(cached.data);
        snapshotRef.current.set(snapshotKey, cached.data);
        setLoading(false);
        setLoadingMore(false);
        setPage(1);
        setError(null);
        return;
      }
    }

    if (!isLoadingMore) {
      const snapshot = snapshotRef.current.get(snapshotKey);
      if (snapshot?.length) {
        setSkills(snapshot);
      }
    }

    setLoadingMore(isLoadingMore);
    setLoading(true);
    if (!isLoadingMore) {
      setPage(1);
    }
    setError(null);

    let cancelled = false;
    const request = trimmed
      ? api.searchSkillssh(trimmed, searchLimit)
      : api.fetchLeaderboard(marketTab);

    request
      .then((result) => {
        if (cancelled) return;
        setSkills(result);
        snapshotRef.current.set(snapshotKey, result);
        if (trimmed.length > 0 && !isLoadingMore) {
          const cacheKey = `${trimmed.toLowerCase()}|${searchLimit}`;
          searchCacheRef.current.set(cacheKey, { timestamp: Date.now(), data: result });
          pruneSearchCache();
        }
        if (!isLoadingMore) {
          setSourceFilter("all");
          setShowAllSources(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        const message = getErrorMessage(err, t("common.error"));
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoadingMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, marketTab, reloadKey, searchLimit, pruneSearchCache, t]);

  const changeBoard = useCallback(
    (board: MarketBoard) => {
      setMarketTab(board);
      setPage(1);
      setSourceFilter("all");
      setShowAllSources(false);
      const snapshot = snapshotRef.current.get(
        marketSnapshotKey("", board, searchLimit)
      );
      if (snapshot?.length) {
        setSkills(snapshot);
      }
    },
    [searchLimit]
  );

  const retry = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  return {
    marketTab,
    changeBoard,
    query,
    setQuery,
    debouncedQuery,
    sourceFilter,
    setSourceFilter,
    showAllSources,
    setShowAllSources,
    skills,
    page,
    setPage,
    searchLimit,
    setSearchLimit,
    loading,
    loadingMore,
    error,
    retry,
  };
}
