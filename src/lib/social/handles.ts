/**
 * Fediverse handle utilities: normalize, validate, parse, and build
 * `user@domain` handles. Pure string helpers — no prisma/megalodon — shared
 * by the pack account routes, remote lookup, and the follow batch.
 */

/** Max length of a stored handle (accounts POST cap). */
export const MAX_HANDLE_LENGTH = 254;

/** Trim and strip a leading "@" (accepts "@user@domain" or "user@domain"). */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/** Full fediverse handle shape: exactly one user@domain, no whitespace. */
export function isValidHandle(handle: string): boolean {
  return /^[^@\s]+@[^@\s]+$/.test(handle);
}

/** Split a `user@domain` handle into username + domain, or null. */
export function parseHandle(handle: string): { username: string; domain: string } | null {
  const match = handle.match(/^([^@]+)@(.+)$/);
  return match ? { username: match[1], domain: match[2] } : null;
}

/**
 * Build a full `user@domain` handle from an acct that may already include the
 * domain (remote accounts) or be bare (accounts local to the same instance).
 */
export function buildHandle(acct: string, instanceDomain: string | null): string {
  if (acct.includes("@")) return acct;
  return instanceDomain ? `${acct}@${instanceDomain}` : acct;
}

/** Case-insensitive form for comparing handles. */
export function canonicalHandle(handle: string): string {
  return handle.toLowerCase();
}