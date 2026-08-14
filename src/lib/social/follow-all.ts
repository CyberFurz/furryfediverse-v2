import { createMegalodonClient, type PlatformKey } from "./providers";

export interface FollowAllResult {
  followed: number;
  skipped: number;
  errors: Array<{ acct: string; error: string }>;
  total: number;
}

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
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  try {
    await client.followAccount(resolvedId, { reblog: true });
    return { ok: true };
  } catch (followErr) {
    return { ok: false, error: getErrorReason(followErr) };
  }
}

/**
 * Follow all accounts in a starter pack for a given user.
 *
 * Creates a megalodon client from the user's LinkedProfile, then iterates
 * over every pack account, skipping the user's own profile and recording
 * any errors encountered along the way.
 *
 * @param userProfile   The calling user's LinkedProfile (needs platform,
 *                      instanceDomain, accessToken, id, acct).
 * @param packAccounts  Array of objects, each wrapping a LinkedProfile
 *                      belonging to one account in the pack.
 * @returns             Aggregated follow-all statistics.
 */
export async function followAllAccounts(
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
): Promise<FollowAllResult> {
  const client = createMegalodonClient(
    userProfile.platform as PlatformKey,
    userProfile.instanceDomain,
    userProfile.accessToken,
  );

  let followed = 0;
  const errors: Array<{ acct: string; error: string }> = [];
  let skipped = 0;
  const total = packAccounts.length;

  for (const account of packAccounts) {
    const { linkedProfile: target } = account;

    // Skip the user's own profile
    if (target.id === userProfile.id) {
      skipped++;
      continue;
    }

    const result = await resolveAndFollowAccount(
      client,
      target,
      userProfile.instanceDomain,
    );

    if (result.ok) {
      followed++;
    } else {
      errors.push({ acct: target.acct, error: result.error });
    }
  }

  return { followed, skipped, errors, total };
}
