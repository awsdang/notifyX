import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Check, Loader2, Search, Star, Users, X } from "lucide-react";
import {
  usePaginatedUsers,
  type PaginatedUser,
} from "../../hooks/usePaginatedUsers";
import { getUserDisplayLabel } from "../../lib/userIdentity";

export interface PaginatedUserMultiSelectProps {
  appId: string;
  token: string | null;
  /** Selected externalUserIds (controlled). */
  value: string[];
  onChange: (ids: string[]) => void;
  /**
   * When true, favourite (test) users are loaded and shown first; the rest are
   * loaded only when the user clicks "Load other users".
   */
  favouritesFirst?: boolean;
  /** Restrict to users that have an active device. */
  withDevices?: boolean;
  /** How many rows to reveal per page / scroll. Defaults to 10. */
  pageSize?: number;
  label?: string;
  required?: boolean;
  helpText?: string;
  emptyText?: string;
  loadingText?: string;
  placeholder?: string;
  disabled?: boolean;
  formatLabel?: (user: PaginatedUser) => string;
  /** Label for the favourites section (favouritesFirst mode). */
  favouritesLabel?: string;
  /** Label for the button that reveals the rest of the users. */
  loadOthersLabel?: string;
  className?: string;
}

const defaultFormatLabel = (user: PaginatedUser) =>
  `${getUserDisplayLabel(user)} (${user.devicesCount} devices)`;

export function PaginatedUserMultiSelect({
  appId,
  token,
  value,
  onChange,
  favouritesFirst = false,
  withDevices = false,
  pageSize = 10,
  label,
  required = false,
  helpText,
  emptyText = "No users found",
  loadingText = "Loading users...",
  placeholder = "Search users by ID or nickname...",
  disabled = false,
  formatLabel = defaultFormatLabel,
  favouritesLabel = "Favourite test users",
  loadOthersLabel = "Load other users",
  className,
}: PaginatedUserMultiSelectProps) {
  // Debounced search term.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [showOthers, setShowOthers] = useState(false);

  // Favourites (only used in favouritesFirst mode).
  const favourites = usePaginatedUsers({
    appId,
    token,
    pageSize,
    search,
    withDevices,
    isTestUser: "true",
    enabled: favouritesFirst,
  });

  // Either the "other" (non-favourite) users, or — in plain mode — all users.
  const others = usePaginatedUsers({
    appId,
    token,
    pageSize,
    search,
    withDevices,
    isTestUser: favouritesFirst ? "false" : undefined,
    enabled: favouritesFirst ? showOthers : true,
  });

  const selectedSet = useMemo(() => new Set(value), [value]);
  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };
  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  // Cache labels so selected chips render even when the user is not on a loaded page.
  const labelCacheRef = useRef<Map<string, PaginatedUser>>(new Map());
  useEffect(() => {
    for (const u of favourites.users) labelCacheRef.current.set(u.externalUserId, u);
    for (const u of others.users) labelCacheRef.current.set(u.externalUserId, u);
  }, [favourites.users, others.users]);

  const chipFor = (id: string) => {
    const user = labelCacheRef.current.get(id);
    return user ? getUserDisplayLabel(user) : id;
  };

  // Infinite scroll for whichever list is the "active growing" one: the others
  // list when it is visible, otherwise (plain mode) it is the same `others`.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const othersVisible = favouritesFirst ? showOthers : true;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !othersVisible || !others.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) others.loadMore();
      },
      { root, rootMargin: "120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersVisible, others.hasMore, others.isLoading, others.isLoadingMore, others.users.length]);

  const renderRow = (user: PaginatedUser) => {
    const selected = selectedSet.has(user.externalUserId);
    return (
      <li key={user.externalUserId}>
        <button
          type="button"
          onClick={() => toggle(user.externalUserId)}
          disabled={disabled}
          className={clsx(
            "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
            selected ? "bg-blue-50/60" : "hover:bg-slate-50",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-slate-700">
            {formatLabel(user)}
          </span>
          <span
            className={clsx(
              "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border",
              selected
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-slate-300",
            )}
          >
            {selected && <Check className="h-3 w-3" />}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className={clsx("space-y-2", className)}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
            >
              <span className="max-w-[200px] truncate">{chipFor(id)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="rounded-full p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-700"
                  aria-label={`Remove ${chipFor(id)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Search box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
      </div>

      {/* Results */}
      <div
        ref={scrollRef}
        className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white"
      >
        {favouritesFirst && (
          <>
            <div className="flex items-center gap-1.5 border-b border-slate-100 bg-amber-50/60 px-3 py-1.5 text-xs font-semibold text-amber-700">
              <Star className="h-3.5 w-3.5" />
              {favouritesLabel}
            </div>
            {favourites.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingText}
              </div>
            ) : favourites.error ? (
              <div className="p-3 text-sm text-rose-600">{favourites.error}</div>
            ) : favourites.users.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">
                {search.trim()
                  ? emptyText
                  : "No favourite test users set for this app yet."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {favourites.users.map(renderRow)}
                {favourites.hasMore && (
                  <li className="p-2 text-center">
                    <button
                      type="button"
                      onClick={favourites.loadMore}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {favourites.isLoadingMore ? "Loading…" : "Show more favourites"}
                    </button>
                  </li>
                )}
              </ul>
            )}

            {/* Load other users toggle */}
            {!showOthers ? (
              <button
                type="button"
                onClick={() => setShowOthers(true)}
                className="flex w-full items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                <Users className="h-3.5 w-3.5" />
                {loadOthersLabel}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 border-y border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                <Users className="h-3.5 w-3.5" />
                All other users
              </div>
            )}
          </>
        )}

        {/* Others list (favouritesFirst: only when expanded) / single list (plain) */}
        {othersVisible && (
          <>
            {others.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingText}
              </div>
            ) : others.error ? (
              <div className="p-3 text-sm text-rose-600">{others.error}</div>
            ) : others.users.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-3 text-sm text-slate-500">
                <Users className="h-4 w-4" />
                {emptyText}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {others.users.map(renderRow)}
                {others.hasMore && (
                  <li>
                    <div
                      ref={sentinelRef}
                      className="flex items-center justify-center gap-2 p-2 text-xs text-slate-400"
                    >
                      {others.isLoadingMore ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading more...
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={others.loadMore}
                          className="text-blue-600 hover:underline"
                        >
                          Load more
                        </button>
                      )}
                    </div>
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {value.length > 0
            ? `${value.length} selected`
            : helpText || "Select one or more users"}
        </span>
      </div>
    </div>
  );
}
