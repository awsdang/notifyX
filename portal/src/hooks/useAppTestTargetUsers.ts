import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

/**
 * Backend-backed "favourite test users" for an app.
 *
 * Favourites are persisted on the server (User.isTestUser) so they are shared
 * across admins and browsers. This hook fetches the current favourite ids and
 * exposes setters that replace the whole set via the API. It deliberately does
 * NOT load every user — the target pickers paginate users themselves.
 */

interface UsersListResponse {
  users: Array<{ externalUserId: string }>;
  pagination?: { page: number; totalPages: number };
}

interface SetFavouritesResponse {
  appId: string;
  externalUserIds: string[];
}

const toUniqueUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
};

export function useAppTestTargetUsers(appId: string, token: string | null) {
  const [preferredTestTargetIds, setPreferredTestTargetIdsState] = useState<
    string[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFavourites = useCallback(async () => {
    if (!appId || !token) {
      setPreferredTestTargetIdsState([]);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const ids: string[] = [];
      let page = 1;
      let totalPages = 1;
      // Favourite sets are small, but paginate defensively.
      do {
        const response = await apiFetch<UsersListResponse>(
          `/users?appId=${encodeURIComponent(appId)}&isTestUser=true&page=${page}&limit=100`,
          {},
          token,
        );
        for (const user of response.users || []) {
          if (user.externalUserId) ids.push(user.externalUserId);
        }
        totalPages = response.pagination?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);

      if (mountedRef.current) {
        setPreferredTestTargetIdsState(toUniqueUserIds(ids));
      }
    } catch (loadError: any) {
      if (mountedRef.current) {
        setError(loadError?.message || "Failed to load favourite test users.");
        setPreferredTestTargetIdsState([]);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [appId, token]);

  useEffect(() => {
    void loadFavourites();
  }, [loadFavourites]);

  const persist = useCallback(
    async (nextIds: string[]) => {
      if (!appId || !token) return;
      const unique = toUniqueUserIds(nextIds);
      // Optimistic update for snappy UI; reconcile with the server response.
      setPreferredTestTargetIdsState(unique);
      try {
        const response = await apiFetch<SetFavouritesResponse>(
          `/users/test-favourites`,
          {
            method: "PUT",
            body: JSON.stringify({ appId, externalUserIds: unique }),
          },
          token,
        );
        if (mountedRef.current) {
          setPreferredTestTargetIdsState(
            toUniqueUserIds(response.externalUserIds),
          );
        }
      } catch (saveError: any) {
        if (mountedRef.current) {
          setError(saveError?.message || "Failed to save favourite test users.");
        }
        // Re-sync from the server on failure.
        void loadFavourites();
      }
    },
    [appId, token, loadFavourites],
  );

  const setPreferredTestTargetIds = useCallback(
    (userIds: string[]) => {
      void persist(userIds);
    },
    [persist],
  );

  const clearPreferredTestTargetIds = useCallback(() => {
    void persist([]);
  }, [persist]);

  return {
    preferredTestTargetIds,
    hasCustomTestTargetUsers: preferredTestTargetIds.length > 0,
    isLoading,
    error,
    setPreferredTestTargetIds,
    clearPreferredTestTargetIds,
    refresh: loadFavourites,
  };
}
