/**
 * Device Health — server-side fallback probing.
 *
 * NOT the primary mechanism. Liveness is reported by the SDKs themselves via
 * `POST /devices/heartbeat` (see `deviceHeartbeat` in `controllers/users.ts`),
 * which costs no provider quota and cannot be rate-limited by Google or Apple.
 * Any app that gets opened keeps its own `lastSeenAt` accurate for free.
 *
 * What the heartbeat cannot do is tell you about a device whose app is *never*
 * opened — silence is ambiguous between "quiet user" and "uninstalled". This
 * module exists only to resolve that ambiguity, and only if you ask for it:
 *
 *  1. **Validation** — ask the provider whether a token still resolves, with no
 *     delivery at all. Only FCM offers a true dry run (`validate_only`), so only
 *     FCM devices can be checked this way. Free of side effects on the handset.
 *
 *  2. **Re-subscribe ping** — a silent, data-only push carrying
 *     `notifyx_action=resubscribe`. Devices still alive wake up and re-register.
 *     Dead ones are rejected at the provider gateway. This touches the device,
 *     so it is separately gated.
 *
 * Both are off unless explicitly enabled, and only ever look at devices that
 * have gone quiet past `DEVICE_HEALTH_STALE_DAYS` — i.e. the ones the heartbeat
 * has already failed to account for.
 *
 * Nothing here deletes a user or a device. A device that fails is flagged
 * (`isActive:false`, `tokenInvalidAt`, `deactivationReason`) and stays put, so
 * the row is still there to be revived the moment the app re-registers — see
 * the reactivation block in `controllers/users.ts`.
 */

import { prisma } from "./database";
import { getRedisClient } from "./redis";
import { getAppProvider } from "./push-providers";
import { decryptToken } from "../utils/crypto";
import type { ProviderType } from "./push-providers/types";

/** Devices quiet for longer than this are considered worth re-checking. */
const STALE_AFTER_DAYS = Number(process.env.DEVICE_HEALTH_STALE_DAYS || 30);

/** Ceiling on how many devices one sweep touches. */
const BATCH_SIZE = Number(process.env.DEVICE_HEALTH_BATCH_SIZE || 200);

/**
 * How many provider probes run at once. Sequential probing made a 200-device
 * sweep take ~30s of wall clock, which is longer than the scheduler's lock TTL
 * — hence this job now lives on its own queue with bounded parallelism instead.
 */
const CONCURRENCY = Number(process.env.DEVICE_HEALTH_CONCURRENCY || 8);

/** Don't re-probe the same device more often than this. */
const COOLDOWN_HOURS = Number(process.env.DEVICE_HEALTH_COOLDOWN_HOURS || 168);

/**
 * Master switch. Off by default: the SDK heartbeat covers the common case
 * without spending a single provider request, so this should only be turned on
 * if you specifically need a verdict on devices that never phone home.
 */
export function isDeviceHealthEnabled(): boolean {
  return process.env.DEVICE_HEALTH_ENABLED === "true";
}

/**
 * Whether to also probe providers that have no dry-run API (APNs, HMS) using a
 * silent background push. The push is rejected at the gateway for dead tokens
 * without ever reaching the device, but live devices do get woken.
 *
 * Web push is excluded regardless: browsers require a visible notification for
 * most push events, so a "silent" web probe risks showing users a spurious
 * "site updated in the background" banner. Web self-heals through the service
 * worker's `pushsubscriptionchange` handler instead.
 */
function pingProvidersWithoutDryRun(): boolean {
  return process.env.DEVICE_HEALTH_PING_ENABLED === "true";
}

const COOLDOWN_KEY = (deviceId: string) => `devhealth:probed:${deviceId}`;
const CURSOR_KEY = "devhealth:cursor";

/** Where the last sweep stopped, so the next one picks up after it. */
async function readCursor(): Promise<string | null> {
  try {
    return await getRedisClient().get(CURSOR_KEY);
  } catch {
    // No Redis: start from the top. Combined with the cooldown miss this makes
    // the sweep less effective, not incorrect.
    return null;
  }
}

async function writeCursor(deviceId: string): Promise<void> {
  try {
    // Expire well past a full cycle so a stalled sweep resumes rather than
    // silently restarting from zero.
    await getRedisClient().setex(CURSOR_KEY, 30 * 86400, deviceId);
  } catch {
    /* best effort */
  }
}

async function clearCursor(): Promise<void> {
  try {
    await getRedisClient().del(CURSOR_KEY);
  } catch {
    /* best effort */
  }
}

async function isOnCooldown(deviceId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    return (await redis.exists(COOLDOWN_KEY(deviceId))) === 1;
  } catch {
    // Redis down: probe anyway rather than stalling the sweep entirely.
    return false;
  }
}

async function markProbed(deviceId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.setex(COOLDOWN_KEY(deviceId), COOLDOWN_HOURS * 3600, "1");
  } catch {
    /* best effort */
  }
}

export interface SweepResult {
  examined: number;
  validated: number;
  pinged: number;
  markedDead: number;
  skipped: number;
}

/**
 * Flag a device whose token the provider has confirmed is gone.
 * Deliberately an update, never a delete.
 */
async function markDead(deviceId: string, reason: string): Promise<void> {
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      isActive: false,
      tokenInvalidAt: new Date(),
      deactivationReason: reason,
    },
  });
}

/**
 * Check the tokens of devices that have gone quiet, and give the live ones a
 * chance to re-register.
 *
 * @param appId  Restrict to one app; omit to sweep every app.
 */
export async function sweepStaleDevices(appId?: string): Promise<SweepResult> {
  const result: SweepResult = {
    examined: 0,
    validated: 0,
    pinged: 0,
    markedDead: 0,
    skipped: 0,
  };

  if (!isDeviceHealthEnabled()) return result;

  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 86400000);

  // Keyset pagination over the primary key, with the position kept in Redis.
  //
  // Ordering by `lastSeenAt` instead looks natural but does not work: probing a
  // device does not change its `lastSeenAt`, so every run would re-fetch the
  // same oldest N rows, find them all on cooldown, skip them, and never reach
  // the rest of the table. Walking by id guarantees the sweep advances, and
  // ordering on the primary key means no sort and no extra index.
  const cursor = await readCursor();

  const devices = await prisma.device.findMany({
    where: {
      isActive: true,
      tokenInvalidAt: null,
      lastSeenAt: { lt: staleBefore },
      ...(cursor ? { id: { gt: cursor } } : {}),
      ...(appId ? { user: { appId } } : {}),
    },
    select: {
      id: true,
      pushToken: true,
      provider: true,
      platform: true,
      user: { select: { appId: true } },
    },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  // A short batch means we reached the end of the table — wrap around so the
  // next run starts a fresh pass from the beginning.
  if (devices.length < BATCH_SIZE) {
    await clearCursor();
  } else {
    await writeCursor(devices[devices.length - 1]!.id);
  }

  result.examined = devices.length;

  // Bounded worker pool: each slot pulls the next device off a shared index.
  let next = 0;
  const runners = Array.from(
    { length: Math.min(CONCURRENCY, devices.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= devices.length) return;
        await probeDevice(devices[index]!, result);
      }
    },
  );
  await Promise.all(runners);

  return result;
}

type ProbeTarget = {
  id: string;
  pushToken: string;
  provider: string;
  platform: string;
  user: { appId: string };
};

/** Check one device and fold the outcome into `result`. Never throws. */
async function probeDevice(
  device: ProbeTarget,
  result: SweepResult,
): Promise<void> {
  try {
    if (await isOnCooldown(device.id)) {
      result.skipped += 1;
      return;
    }

    const providerType = device.provider as ProviderType;

    // Web relies on the service worker's pushsubscriptionchange event, not on
    // us poking it — see the note on pingProvidersWithoutDryRun().
    if (providerType === "web") {
      result.skipped += 1;
      return;
    }

    let token: string;
    try {
      token = decryptToken(device.pushToken);
    } catch {
      result.skipped += 1;
      return;
    }

    const provider = await getAppProvider(
      device.user.appId,
      providerType,
    ).catch(() => null);

    if (!provider) {
      result.skipped += 1;
      return;
    }

    await markProbed(device.id);

    // Preferred path: a dry run that never reaches the device.
    if (typeof provider.validateToken === "function") {
      const check = await provider.validateToken(token);
      result.validated += 1;
      if (check.invalidToken) {
        await markDead(device.id, "INVALID_TOKEN_SWEEP");
        result.markedDead += 1;
      }
      return;
    }

    if (!pingProvidersWithoutDryRun()) {
      result.skipped += 1;
      return;
    }

    // Fallback: silent background push. Dead tokens are rejected at the
    // gateway; live ones wake the app, which re-registers itself.
    const ping = await provider.send({
      token,
      silent: true,
      title: "",
      body: "",
      data: { notifyx_action: "resubscribe" },
      ttl: 3600,
      collapseKey: "notifyx_resubscribe",
    });
    result.pinged += 1;

    if (ping.invalidToken) {
      await markDead(device.id, "INVALID_TOKEN_SWEEP");
      result.markedDead += 1;
    }
  } catch {
    // One bad device must not abort the sweep for the other 199.
    result.skipped += 1;
  }
}

export interface UnreachableBreakdown {
  neverRegistered: number;
  tokenWentDead: number;
  byReason: { reason: string; count: number }[];
  byPlatform: { platform: string; count: number }[];
  contactable: number;
}

/**
 * Why an app's users are unreachable, split by cause — the two groups need
 * completely different remedies:
 *
 *  - `neverRegistered`: the user row exists but no device was ever created.
 *    Push cannot reach them at all; recovery has to happen in-app or over
 *    another channel (`contactable` counts the ones with a phone number on
 *    file).
 *  - `tokenWentDead`: they had a working device that the provider later
 *    rejected — usually an uninstall. Re-registering on next launch revives it.
 */
export async function getUnreachableBreakdown(
  appId: string,
): Promise<UnreachableBreakdown> {
  const [neverRegistered, deadUsers, deadDevices, contactable] =
    await Promise.all([
      prisma.user.count({
        where: { appId, deletedAt: null, devices: { none: {} } },
      }),
      prisma.user.count({
        where: {
          appId,
          deletedAt: null,
          devices: {
            some: {},
            none: { isActive: true, tokenInvalidAt: null },
          },
        },
      }),
      prisma.device.groupBy({
        by: ["deactivationReason", "platform"],
        where: { user: { appId }, tokenInvalidAt: { not: null } },
        _count: { _all: true },
      }),
      prisma.user.count({
        where: {
          appId,
          deletedAt: null,
          phone: { not: null },
          devices: { none: { isActive: true, tokenInvalidAt: null } },
        },
      }),
    ]);

  const reasons = new Map<string, number>();
  const platforms = new Map<string, number>();
  for (const row of deadDevices) {
    const reason = row.deactivationReason || "UNKNOWN";
    reasons.set(reason, (reasons.get(reason) || 0) + row._count._all);
    platforms.set(
      row.platform,
      (platforms.get(row.platform) || 0) + row._count._all,
    );
  }

  return {
    neverRegistered,
    tokenWentDead: deadUsers,
    byReason: Array.from(reasons, ([reason, count]) => ({ reason, count })).sort(
      (a, b) => b.count - a.count,
    ),
    byPlatform: Array.from(platforms, ([platform, count]) => ({
      platform,
      count,
    })).sort((a, b) => b.count - a.count),
    contactable,
  };
}
