export interface UserIdentity {
  externalUserId: string;
  nickname?: string | null;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

export const normalizeNickname = (nickname?: string | null) => {
  const trimmed = nickname?.trim();
  return trimmed ? trimmed : null;
};

export const getPreferredUserName = (user: UserIdentity) =>
  normalizeNickname(user.nickname) || user.externalUserId;

export const getUserIdentityLabel = (user: UserIdentity) => {
  const nickname = normalizeNickname(user.nickname);
  if (!nickname) return user.externalUserId;
  return `${nickname} (${user.externalUserId})`;
};

export const compareUsersByIdentity = <T extends UserIdentity>(a: T, b: T) => {
  const preferredCompare = collator.compare(
    getPreferredUserName(a),
    getPreferredUserName(b),
  );
  if (preferredCompare !== 0) return preferredCompare;
  return collator.compare(a.externalUserId, b.externalUserId);
};
