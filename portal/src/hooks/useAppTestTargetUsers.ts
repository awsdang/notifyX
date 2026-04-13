import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { compareUsersByIdentity } from "../lib/userIdentity";

interface UsersListResponse {
  users: Array<{
    externalUserId: string;
    nickname?: string | null;
    _count?: {
      devices?: number;
    };
  }>;
  pagination?: {
    page: number;
    totalPages: number;
  };
}

export interface AppTargetUser {
  externalUserId: string;
  nickname?: string | null;
  devicesCount: number;
}

const STORAGE_KEY = "notifyx_test_target_users_v1";

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

const areArraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const readStoredTargets = (): Record<string, string[]> => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const normalized: Record<string, string[]> = {};
    for (const [appId, userIds] of Object.entries(parsed)) {
      if (typeof appId !== "string") continue;
      normalized[appId] = toUniqueUserIds(userIds);
    }
    return normalized;
  } catch {
    return {};
  }
};

const writeStoredTargets = (value: Record<string, string[]>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const hasOwnKey = (value: Record<string, string[]>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const getStoredTargetsForApp = (
  appId: string,
): { hasCustomEntry: boolean; userIds: string[] } => {
  if (!appId) return { hasCustomEntry: false, userIds: [] };
  const map = readStoredTargets();
  return {
    hasCustomEntry: hasOwnKey(map, appId),
    userIds: toUniqueUserIds(map[appId]),
  };
};

const setStoredTargetsForApp = (
  appId: string,
  userIds: string[],
  keepEntry: boolean,
) => {
  if (!appId) return;
  const map = readStoredTargets();
  const normalized = toUniqueUserIds(userIds);
  if (!keepEntry) {
    delete map[appId];
  } else {
    map[appId] = normalized;
  }
  writeStoredTargets(map);
};

export function useAppTestTargetUsers(appId: string, token: string | null) {
  const [allUsers, setAllUsers] = useState<AppTargetUser[]>([]);
  const [hasCustomTestTargetUsers, setHasCustomTestTargetUsers] = useState(false);
  const [preferredTestTargetIds, setPreferredTestTargetIdsState] = useState<
    string[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPreferredTestTargetIds = useCallback(
    (userIds: string[]) => {
      const allowedUserIds = new Set(allUsers.map((user) => user.externalUserId));
      const next = toUniqueUserIds(userIds).filter((id) => allowedUserIds.has(id));
      const hasPreferredTargets = next.length > 0;
      setStoredTargetsForApp(appId, next, hasPreferredTargets);
      setHasCustomTestTargetUsers(hasPreferredTargets);
      setPreferredTestTargetIdsState(next);
    },
    [allUsers, appId],
  );
  const clearPreferredTestTargetIds = useCallback(() => {
    setStoredTargetsForApp(appId, [], false);
    setHasCustomTestTargetUsers(false);
    setPreferredTestTargetIdsState([]);
  }, [appId]);

  useEffect(() => {
    if (!appId || !token) {
      setAllUsers([]);
      setHasCustomTestTargetUsers(false);
      setPreferredTestTargetIdsState([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let mounted = true;

    const loadUsers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const usersMap = new Map<string, AppTargetUser>();
        let page = 1;
        let totalPages = 1;

        do {
          const response = await apiFetch<UsersListResponse>(
            `/users?appId=${encodeURIComponent(appId)}&page=${page}&limit=100`,
            {},
            token,
          );

          for (const user of response.users || []) {
            const devicesCount = user._count?.devices || 0;
            if (devicesCount <= 0) continue;

            usersMap.set(user.externalUserId, {
              externalUserId: user.externalUserId,
              nickname: user.nickname ?? null,
              devicesCount,
            });
          }

          totalPages = response.pagination?.totalPages || 1;
          page += 1;
        } while (page <= totalPages);

        if (!mounted) return;

        const users = Array.from(usersMap.values()).sort(compareUsersByIdentity);
        const allowedUserIds = new Set(users.map((user) => user.externalUserId));
        const storedTargets = getStoredTargetsForApp(appId);
        const sanitizedTargets = storedTargets.userIds.filter((id) =>
          allowedUserIds.has(id),
        );

        const hasPreferredTargets = sanitizedTargets.length > 0;

        if (
          !areArraysEqual(storedTargets.userIds, sanitizedTargets) ||
          storedTargets.hasCustomEntry !== hasPreferredTargets
        ) {
          setStoredTargetsForApp(appId, sanitizedTargets, hasPreferredTargets);
        }

        setAllUsers(users);
        setHasCustomTestTargetUsers(hasPreferredTargets);
        setPreferredTestTargetIdsState(sanitizedTargets);
      } catch (loadError: any) {
        if (!mounted) return;
        setAllUsers([]);
        setHasCustomTestTargetUsers(false);
        setPreferredTestTargetIdsState([]);
        setError(loadError?.message || "Failed to load app users.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadUsers();

    return () => {
      mounted = false;
    };
  }, [appId, token]);

  const testTargetUsers = useMemo(() => {
    if (!hasCustomTestTargetUsers) return allUsers;
    const preferredSet = new Set(preferredTestTargetIds);
    return allUsers.filter((user) => preferredSet.has(user.externalUserId));
  }, [allUsers, hasCustomTestTargetUsers, preferredTestTargetIds]);

  return {
    allUsers,
    testTargetUsers,
    preferredTestTargetIds,
    hasCustomTestTargetUsers,
    isLoading,
    error,
    setPreferredTestTargetIds,
    clearPreferredTestTargetIds,
  };
}
