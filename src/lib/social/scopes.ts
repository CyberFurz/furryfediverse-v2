/**
 * OAuth scope definitions for linked fediverse accounts. Pure data/helpers
 * (no megalodon/prisma) so both server routes and client components can use
 * them to explain what each permission is for.
 */

export type ScopePlatform = "mastodon" | "pleroma" | "pixelfed" | "firefish" | "gotosocial";

export interface ScopeInfo {
  scope: string;
  /** Short human label. */
  label: string;
  /** What we use it for, in plain language. */
  purpose: string;
}

/** Plain-language explanations shown to users before re-authorizing. */
export const SCOPE_INFO: Record<string, ScopeInfo> = {
  "read:accounts": {
    scope: "read:accounts",
    label: "Look up accounts",
    purpose:
      "Lets us look up a fediverse account by its handle (like @user@instance) through your server when you add it to a starter pack, and check who you already follow so packs can show “Following”.",
  },
  "read:search": {
    scope: "read:search",
    label: "Find accounts on other servers",
    purpose:
      "Lets your server fetch accounts it hasn't seen before — including Bluesky accounts bridged via Bridgy Fed — when you search for them while building a starter pack. We only search for accounts; we never read your posts or messages.",
  },
  "write:follows": {
    scope: "write:follows",
    label: "Follow accounts for you",
    purpose:
      "Lets the “Follow all” button on a starter pack follow those accounts from your account. We only follow when you click the button — we never unfollow or follow anyone on our own.",
  },
};

/** Scopes needed for the base link (sign-in / directory profile sync). */
const BASE_SCOPES: Record<ScopePlatform, string[]> = {
  mastodon: ["profile"],
  pleroma: ["read:accounts"],
  pixelfed: ["read"],
  firefish: ["read:account"],
  gotosocial: ["profile"],
};

/**
 * Extended scopes needed for starter pack features (lookup, remote search,
 * follow-all). Firefish uses Misskey-style scope names and does not support
 * the Mastodon search/follow scopes through our client, so it has none.
 */
const EXTENDED_SCOPES: Record<ScopePlatform, string[]> = {
  mastodon: ["read:accounts", "read:search", "write:follows"],
  pleroma: ["read:search", "write:follows"],
  pixelfed: ["write:follows"],
  firefish: [],
  gotosocial: ["read:accounts", "read:search", "write:follows"],
};

/** Every scope we request when linking or re-authorizing. */
export function requestedScopes(platform: ScopePlatform): string[] {
  return [...BASE_SCOPES[platform], ...EXTENDED_SCOPES[platform]];
}

/** Scopes the starter pack features need for this platform. */
export function requiredExtendedScopes(platform: string): string[] {
  return EXTENDED_SCOPES[platform as ScopePlatform] ?? [];
}

/** Parse a stored scope string ("a b,c") into a set. */
export function parseScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope || "").split(/[\s,]+/).filter(Boolean));
}

/**
 * True when `granted` covers `needed`. A top-level scope ("read", "write")
 * implies all of its sub-scopes ("read:search", "write:follows").
 */
function covers(granted: Set<string>, needed: string): boolean {
  if (granted.has(needed)) return true;
  const parent = needed.split(":")[0];
  return parent !== needed && granted.has(parent);
}

/** The extended scopes a linked profile still needs to grant. */
export function missingScopes(platform: string, grantedScope: string | null | undefined): string[] {
  const granted = parseScopes(grantedScope);
  return requiredExtendedScopes(platform).filter((s) => !covers(granted, s));
}

/** Missing scopes with their explanations, for API responses / UI. */
export function describeScopes(scopes: string[]): ScopeInfo[] {
  return scopes.map((s) => SCOPE_INFO[s] ?? { scope: s, label: s, purpose: "" });
}
