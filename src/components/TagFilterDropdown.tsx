import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleSlash, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { getTagActiveColor, getTagColor, UNTAGGED_FILTER } from "../lib/skillTags";

interface TagFilterDropdownProps {
  allTags: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  showUntagged: boolean;
  onTagContextMenu?: (tag: string, x: number, y: number) => void;
}

function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function TagFilterDropdown({
  allTags,
  selected,
  onChange,
  showUntagged,
  onTagContextMenu,
}: TagFilterDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((tag) => tag.toLowerCase().includes(q));
  }, [allTags, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  return (
    <div ref={rootRef} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <span className="app-filter-label">{t("mySkills.filterRow.tags")}</span>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors outline-none",
            open || selected.size > 0
              ? "border-border bg-surface text-secondary"
              : "border-border-subtle bg-surface-hover text-tertiary hover:text-secondary"
          )}
        >
          {selected.size > 0
            ? t("mySkills.tags.filterSelected", { count: selected.size })
            : t("mySkills.tags.filterSelect")}
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>

        {open ? (
          <div className="absolute left-0 top-full z-30 mt-1.5 w-[min(280px,calc(100vw-3rem))] overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-xl">
            <div className="border-b border-border-subtle p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("mySkills.tags.filterSearch")}
                  className="app-input h-8 w-full pl-8 text-[12px]"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-[220px] overflow-y-auto p-1.5 scrollbar-hide">
              {showUntagged && (!query.trim() || t("mySkills.tags.untagged").toLowerCase().includes(query.trim().toLowerCase())) ? (
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={selected.has(UNTAGGED_FILTER)}
                    onChange={() => onChange(toggleInSet(selected, UNTAGGED_FILTER))}
                    className="rounded border-border-subtle"
                  />
                  <CircleSlash className="h-3 w-3 text-muted" />
                  <span className="text-secondary">{t("mySkills.tags.untagged")}</span>
                </label>
              ) : null}

              {filteredTags.length === 0 ? (
                <p className="px-2 py-3 text-center text-[12px] text-muted">
                  {t("mySkills.tags.filterEmpty")}
                </p>
              ) : (
                filteredTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-surface-hover"
                    onContextMenu={
                      onTagContextMenu
                        ? (e) => {
                            e.preventDefault();
                            onTagContextMenu(
                              tag,
                              Math.min(e.clientX, window.innerWidth - 160),
                              Math.min(e.clientY, window.innerHeight - 90)
                            );
                            setOpen(false);
                          }
                        : undefined
                    }
                    title={onTagContextMenu ? t("mySkills.tags.manageHint") : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(tag)}
                      onChange={() => onChange(toggleInSet(selected, tag))}
                      className="rounded border-border-subtle"
                    />
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        selected.has(tag) ? getTagActiveColor(tag, allTags) : getTagColor(tag, allTags)
                      )}
                    >
                      {tag}
                    </span>
                  </label>
                ))
              )}
            </div>

            {selected.size > 0 ? (
              <div className="border-t border-border-subtle px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onChange(new Set())}
                  className="text-[12px] font-medium text-muted transition-colors hover:text-secondary"
                >
                  {t("mySkills.tags.filterClear")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedList.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {selectedList.slice(0, 4).map((item) => {
            const label = item === UNTAGGED_FILTER ? t("mySkills.tags.untagged") : item;
            return (
              <span
                key={item}
                className={cn(
                  "inline-flex max-w-[140px] items-center gap-0.5 rounded-full py-0.5 pl-2 pr-1 text-[11px] font-medium",
                  item === UNTAGGED_FILTER
                    ? "border border-dashed border-border bg-surface text-muted"
                    : getTagActiveColor(item, allTags)
                )}
              >
                <span className="truncate">{label}</span>
                <button
                  type="button"
                  onClick={() => onChange(toggleInSet(selected, item))}
                  className="rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
                  aria-label={t("common.closeLabel")}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
          {selectedList.length > 4 ? (
            <span className="text-[11px] text-muted">+{selectedList.length - 4}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
