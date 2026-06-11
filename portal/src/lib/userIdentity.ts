export interface UserIdentity {
  externalUserId: string;
  nickname?: string | null;
  phone?: string | null;
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

/**
 * Human-friendly label that never exposes the raw external user id when a
 * nicer identifier (nickname / phone) is available. Used in the target pickers,
 * where the underlying id is the selected value but should not be shown.
 * Falls back to the external id only when nothing else is known.
 */
export const getUserDisplayLabel = (user: UserIdentity) => {
  const nickname = normalizeNickname(user.nickname);
  const phone = user.phone?.trim() || null;
  if (nickname && phone) return `${nickname} (${phone})`;
  if (nickname) return nickname;
  if (phone) return phone;
  return user.externalUserId;
};

export const compareUsersByIdentity = <T extends UserIdentity>(a: T, b: T) => {
  const preferredCompare = collator.compare(
    getPreferredUserName(a),
    getPreferredUserName(b),
  );
  if (preferredCompare !== 0) return preferredCompare;
  return collator.compare(a.externalUserId, b.externalUserId);
};
