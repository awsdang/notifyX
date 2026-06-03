import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

export interface PaginatedUser {
  externalUserId: string;
  nickname?: string | null;
  phone?: string | null;
  devicesCount: number;
}

interface UsersListResponse {
  users: Array<{
    externalUserId: string;
    nickname?: string | null;
    phone?: string | null;
    _count?: { devices?: number };
  }>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface UsePaginatedUsersOptions {
  appId: string;
  token: string | null;
  /** Page size for each fetch. Defaults to 10. */
  pageSize?: number;
  /** Debounced search term (matched against externalUserId / nickname). */
  search?: string;
  /** Only return users with at least one active device. */
  withDevices?: boolean;
  /**
   * Favourite filter. "true" -> only favourite (test) users; "false" -> only
   * non-favourites; undefined -> all users.
   */
  isTestUser?: "true" | "false";
  /** When false, the hook stays idle (no fetching). Useful while a dropdown is closed. */
  enabled?: boolean;
}

interface UsePaginatedUsersResult {
  users: PaginatedUser[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  loadMore: () => void;
}

/**
 * Server-paginated user fetcher with search and incremental ("infinite scroll")
 * loading. Each call to {@link loadMore} fetches the next page and appends it.
 * Changing `search`/`appId`/`withDevices` resets back to page 1.
 *
 * This replaces the previous approach of loading every user up-front, which did
 * not scale for apps with many users.
 */
export function usePaginatedUsers({
  appId,
  token,
  pageSize = 10,
  search = "",
  withDevices = false,
  isTestUser,
  enabled = true,
}: UsePaginatedUsersOptions): UsePaginatedUsersResult {
  const [users, setUsers] = useState<PaginatedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identifies the active query; lets in-flight responses for stale queries be
  // discarded (e.g. when the search term changes mid-request).
  const requestKey = `${appId}|${search}|${withDevices}|${isTestUser ?? "all"}|${pageSize}`;
  const activeKeyRef = useRef(requestKey);

  const fetchPage = useCallback(
    async (targetPage: number, key: string) => {
      if (!appId || !token) return;

      const params = new URLSearchParams({
        appId,
        page: String(targetPage),
        limit: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (withDevices) params.set("withDevices", "true");
      if (isTestUser) params.set("isTestUser", isTestUser);

      if (targetPage === 1) setIsLoading(true);
      else setIsLoadingMore(true);
      setError(null);

      try {
        const response = await apiFetch<UsersListResponse>(
          `/users?${params.toString()}`,
          {},
          token,
        );

        // Drop responses for a query that is no longer active.
        if (activeKeyRef.current !== key) return;

        const mapped: PaginatedUser[] = (response.users || []).map((u) => ({
          externalUserId: u.externalUserId,
          nickname: u.nickname ?? null,
          phone: u.phone ?? null,
          devicesCount: u._count?.devices ?? 0,
        }));

        const totalCount = response.pagination?.total ?? 0;
        const totalPages = response.pagination?.totalPages ?? 1;

        setTotal(totalCount);
        setPage(targetPage);
        setHasMore(targetPage < totalPages);
        setUsers((prev) => {
          if (targetPage === 1) return mapped;
          // De-dupe in case of overlapping pages.
          const seen = new Set(prev.map((u) => u.externalUserId));
          return [...prev, ...mapped.filter((u) => !seen.has(u.externalUserId))];
        });
      } catch (err: any) {
        if (activeKeyRef.current !== key) return;
        setError(err?.message || "Failed to load users.");
        if (targetPage === 1) {
          setUsers([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (activeKeyRef.current === key) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [appId, token, pageSize, search, withDevices, isTestUser],
  );

  // Reset and load page 1 whenever the query identity changes.
  useEffect(() => {
    activeKeyRef.current = requestKey;
    if (!enabled || !appId || !token) {
      setUsers([]);
      setTotal(0);
      setPage(1);
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return;
    }
    setUsers([]);
    setPage(1);
    setHasMore(false);
    void fetchPage(1, requestKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled, appId, token]);

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore || !hasMore) return;
    void fetchPage(page + 1, activeKeyRef.current);
  }, [fetchPage, hasMore, isLoading, isLoadingMore, page]);

  return { users, total, hasMore, isLoading, isLoadingMore, error, loadMore };
}
