import { createMegalodonClient, type PlatformKey } from "./providers";

export interface FollowBatchResult {
  followed: string[]; // handles of accounts followed this run
  requested: string[]; // handles where the follow is pending approval (locked account)
  skippedAlreadyFollowing: number;
  skippedSelf: number;
  errors: Array<{ acct: string; error: string }>;
  total: number;
}

/** How many accounts a single "follow next" action follows at most. */
export const FOLLOW_BATCH_SIZE = 25;

/** Pause between follow requests to avoid tripping rate limits. */
const FOLLOW_DELAY_MS = 750;

/** Backoff (ms) applied after a 429 before the next attempt. */
const RATE_LIMIT_BACKOFF_MS = 5000;

/**
 * Extract a meaningful error reason from a megalodon / axios error.
 * Returns a short human-readable string suitable for the errors array.
 */
function getErrorReason(err: unknown): string {
  if (typeof err !== "object" || err === null) {
    return err instanceof Error ? err.message : "Unknown error";
  }

  const axiosError = err as {
    response?: { status?: number };
    code?: string;
    message?: string;
  };

  // Prefer HTTP status code when available
  if (axiosError.response?.status) {
    switch (axiosError.response.status) {
      case 401:
        return "Unauthorized";
      case 404:
        return "Account not found";
      case 429:
        return "Rate limited";
      case 503:
        return "Service unavailable";
      default:
        return `HTTP ${axiosError.response.status}`;
    }
  }

  // Network-level error codes
  const networkCodes = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENETUNREACH",
    "EAI_AGAIN",
  ]);
  if (axiosError.code && networkCodes.has(axiosError.code)) {
    return "Network error";
  }

  // Fall back to message inspection
  const msg = (axiosError.message ?? "").toLowerCase();
  if (msg.includes("401") || msg.includes("unauthorized")) return "Unauthorized";
  if (msg.includes("429") || msg.includes("rate limit")) return "Rate limited";
  if (msg.includes("404") || msg.includes("not found")) return "Account not found";
  if (networkCodes.has(axiosError.code ?? "")) return "Network error";
  if (
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("socket")
  ) {
    return "Network error";
  }

  return err instanceof Error ? err.message : "Unknown error";
}

/**
 * Resolve a fediverse account and follow it.
 *
 * Mirrors the Python ref's `resolve_and_follow_account()` from
 * Ref/fedidevs/starter_packs/utils.py.
 *
 * @param client        Authenticated megalodon client for the user's instance.
 * @param target        The remote account's LinkedProfile data (id, instanceDomain,
 *                      externalAccountId, username).
 * @param userDomain    The user's instance domain (used for same-instance shortcut).
 * @returns             `{ ok: true }` on success, or `{ ok: false, error: string }`
 *                      on failure.
 */
async function resolveAndFollowAccount(
  client: ReturnType<typeof createMegalodonClient>,
  target: {
    instanceDomain: string;
    externalAccountId: string;
    username: string;
  },
  userDomain: string,
): Promise<{ ok: true; requested?: boolean } | { ok: false; error: string }> {
  // Construct the fediverse handle for lookups
  const acct = `@${target.username}@${target.instanceDomain}`;

  // ---------- resolve the account ID ----------

  let resolvedId: string;

  // 1. Same instance → use the stored externalAccountId directly
  if (target.instanceDomain === userDomain && target.externalAccountId) {
    resolvedId = target.externalAccountId;
  } else {
    // 2. Cross-instance → try lookupAccount first
    try {
      const lookupRes = await client.lookupAccount(acct);
      resolvedId = lookupRes.data.id;
    } catch (lookupErr) {
      // 3. lookupAccount failed → fallback to search with resolve: true
      try {
        const searchRes = await client.search(acct, {
          type: "accounts",
          resolve: true,
          limit: 1,
        });

        if (
          !searchRes.data.accounts ||
          searchRes.data.accounts.length === 0
        ) {
          return { ok: false, error: "Account not found" };
        }

        const found = searchRes.data.accounts[0];

        // 4. Verify the returned account matches the expected handle
        const expected = `${target.username}@${target.instanceDomain}`.toLowerCase();
        if (found.acct.toLowerCase() !== expected) {
          return { ok: false, error: "Account not found" };
        }

        resolvedId = found.id;
      } catch (searchErr) {
        return { ok: false, error: getErrorReason(searchErr) };
      }
    }
  }

  // ---------- follow the resolved account ----------
  //
  // Note on `reblog: false`: we deliberately do not subscribe the user to
  // boosts of the followed account. Following with reblogs enabled is a
  // privacy-affecting default the follower did not ask for, and it is not
  // what a "follow these accounts" action implies.
  //
  // Note on batch following: the Mastodon team explicitly chose NOT to ship
  // a bulk-follow action in Collections (Mastodon 4.6), their version of
  // starter packs. From the "Designing Collections" post
  // (https://blog.joinmastodon.org/2026/04/designing-collections/):
  //   "We're not including a bulk follow action on day one... People on
  //   Bluesky often found themselves mass following accounts from stale
  //   Starter Packs, only to have a subpar feed afterwards."
  // So we keep batches small (FOLLOW_BATCH_SIZE), pace the requests, and
  // skip accounts the user already follows, to limit spam risk to home and
  // target instances.

  try {
    const followRes = await client.followAccount(resolvedId, { reblog: false });
    // A locked target instance/account accepts the follow as a *request*
    // (relationship: following=false, requested=true). Report that honestly
    // instead of claiming the follow went through.
    if (followRes.data?.requested) {
      return { ok: true, requested: true };
    }
    return { ok: true };
  } catch (followErr) {
    return { ok: false, error: getErrorReason(followErr) };
  }
}

/** Simple sleep helper to pace follow requests. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Follow the next `batchSize` accounts in the pack that the user does not
 * already follow.
 *
 * Fetches nothing itself; the caller is expected to supply the set of
 * handles the user already follows (from their home instance) so we never
 * re-follow. Requests are paced and stop early on repeated rate limits.
 *
 * @param userProfile   The calling user's LinkedProfile (needs platform,
 *                      instanceDomain, accessToken, id, acct).
 * @param packAccounts  Array of objects, each wrapping a LinkedProfile
 *                      belonging to one account in the pack.
 * @param alreadyFollowing  Set of `username@domain` handles the user
 *                      already follows on their home instance.
 * @returns             Batch follow statistics, including the handles
 *                      that were followed this run.
 */
export async function followNextBatch(
  userProfile: {
    id: string;
    platform: string;
    instanceDomain: string;
    accessToken: string;
    acct: string;
  },
  packAccounts: Array<{
    linkedProfile: {
      id: string;
      instanceDomain: string;
      externalAccountId: string;
      username: string;
      acct: string;
    };
  }>,
  alreadyFollowing: Set<string>,
): Promise<FollowBatchResult> {
  const client = createMegalodonClient(
    userProfile.platform as PlatformKey,
    userProfile.instanceDomain,
    userProfile.accessToken,
  );

  const followed: string[] = [];
  const requested: string[] = [];
  const errors: Array<{ acct: string; error: string }> = [];
  let skippedAlreadyFollowing = 0;
  let skippedSelf = 0;

  const candidates: typeof packAccounts = [];

  // Dedupe by linkedProfileId so a misconfigured pack can't follow the
  // same account twice, and drop self/already-followed accounts up front.
  const seen = new Set<string>();
  for (const account of packAccounts) {
    const target = account.linkedProfile;
    if (!target) continue;
    if (target.id === userProfile.id) {
      skippedSelf++;
      continue;
    }
    const handle = `${target.username}@${target.instanceDomain}`.toLowerCase();
    if (seen.has(handle)) continue; // duplicate in pack
    seen.add(handle);
    if (alreadyFollowing.has(handle)) {
      skippedAlreadyFollowing++;
      continue;
    }
    candidates.push(account);
  }

  const total = candidates.length;
  const batch = candidates.slice(0, FOLLOW_BATCH_SIZE);
  let consecutiveRateLimits = 0;

  for (const account of batch) {
    const target = account.linkedProfile;
    const result = await resolveAndFollowAccount(
      client,
      target,
      userProfile.instanceDomain,
    );

    if (result.ok) {
      if (result.requested) {
        requested.push(target.acct);
      } else {
        followed.push(target.acct);
      }
      consecutiveRateLimits = 0;
    } else {
      errors.push({ acct: target.acct, error: result.error });
      if (result.error === "Rate limited") {
        consecutiveRateLimits++;
        // Back off and keep going; if the instance keeps rejecting us,
        // stop early rather than hammering it.
        await sleep(RATE_LIMIT_BACKOFF_MS);
        if (consecutiveRateLimits >= 3) break;
      }
    }

    // Pace requests between follows (also respects 1 req/sec-ish limits).
    await sleep(FOLLOW_DELAY_MS);
  }

  return {
    followed,
    requested,
    skippedAlreadyFollowing,
    skippedSelf,
    errors,
    total,
  };
}
