import { prisma } from "../prisma";
import generator from "megalodon";
import type { PlatformKey } from "./providers";
import { buildHandle, normalizeHandle } from "./handles";

/**
 * Remote fediverse account operations: exact lookup, partial search, and
 * normalization of remote account entities into the pack UI shape.
 *
 * All functions need the caller's linked profile (its instance + token) to
 * talk to the home instance. The token must carry a lookup/search scope
 * (gotosocial: "read:accounts" + "read:search").
 */

/**
 * A remote fediverse account normalized for the pack UI: what the search
 * endpoint returns and what the accounts page renders for @user@domain /
 * partial-search results. Shared by the API route and the client.
 */
export interface RemoteAccount {
  handle: string;
  displayName: string;
  avatar: string;
  profileUrl: string;
  followersCount: number;
  inStarterPack: boolean;
}

/**
 * Normalize a fediverse account entity into the handle/displayName/avatar
 * shape the pack UI renders. `acct` is "user@domain" for remote accounts
 * and a bare "user" for accounts local to the caller's instance.
 */
export function normalizeRemoteAccount(
  data: {
    username?: string;
    acct?: string;
    display_name?: string;
    avatar?: string;
    url?: string;
    followers_count?: number;
  },
  userInstanceDomain: string,
): RemoteAccount | null {
  if (!data || !data.username) return null;
  const acct = data.acct || data.username;
  return {
    handle: normalizeHandle(buildHandle(acct, userInstanceDomain)),
    displayName: data.display_name || data.username,
    avatar: data.avatar || "",
    profileUrl: data.url || "",
    followersCount: data.followers_count || 0,
    inStarterPack: false, // filled in by the caller when pack context is known
  };
}

/** Get the caller's linked profile used for remote lookups. */
async function getLinkedProfileForRemote(userId: string) {
  return prisma.linkedProfile.findFirst({
    where: { userId, isActive: true },
    orderBy: { isPrimaryProfile: "desc" },
    select: { instanceDomain: true, platform: true, accessToken: true },
  });
}

/** Look up one exact @user@instance handle on the caller's home instance. */
export async function lookupRemoteAccount(q: string, userId: string): Promise<RemoteAccount | null> {
  if (!q.match(/^@?([^@]+)@(.+)$/)) return null;

  const fullAcct = q.startsWith("@") ? q : `@${q}`;
  const userProfile = await getLinkedProfileForRemote(userId);
  if (!userProfile) return null;

  try {
    const client = generator(
      userProfile.platform as PlatformKey,
      `https://${userProfile.instanceDomain}`,
      userProfile.accessToken,
    );
    const result = await client.lookupAccount(fullAcct);
    return normalizeRemoteAccount(result.data as Record<string, unknown>, userProfile.instanceDomain);
  } catch {
    // Remote lookup failed, continue with local search only
    return null;
  }
}

/**
 * Search the caller's home instance for accounts matching a partial query
 * (e.g. "agumon" or "gabum"). Only used for non-handle queries; exact
 * @user@domain queries go through lookupRemoteAccount instead. Needs the
 * linked token to have a read:search scope (gotosocial: "read:search").
 *
 * Queries shorter than MIN_REMOTE_SEARCH_LENGTH are ignored — a one-char
 * query would otherwise hit the whole instance (and with resolve, the
 * fediverse) on every keystroke.
 */
export const MIN_REMOTE_SEARCH_LENGTH = 3;

export async function searchRemoteAccounts(q: string, userId: string, limit = 8): Promise<RemoteAccount[]> {
  if (q.match(/^@?([^@]+)@(.+)$/)) return [];

  const query = q.trim();
  if (query.length < MIN_REMOTE_SEARCH_LENGTH) return [];

  const userProfile = await getLinkedProfileForRemote(userId);
  if (!userProfile) return [];

  try {
    const client = generator(
      userProfile.platform as PlatformKey,
      `https://${userProfile.instanceDomain}`,
      userProfile.accessToken,
    );
    const result = await client.search(query, { type: "accounts", resolve: false, limit });
    return (result.data.accounts || [])
      .map((a) => normalizeRemoteAccount(a as Record<string, unknown>, userProfile.instanceDomain))
      .filter((a): a is RemoteAccount => a !== null);
  } catch {
    // Remote search failed, continue with local search only
    return [];
  }
}