import type { createMegalodonClient } from "./providers";

/**
 * Fetch the accounts a user already follows on their home instance, as a
 * set of lowercased `username@domain` handles. Paginated past the first
 * page (one page is incomplete for heavy users).
 *
 * @param client      Authenticated megalodon client for the user's instance.
 * @param accountId   The user's account id on that instance.
 * @param homeDomain  The user's instance domain (used to fill in the domain
 *                    for local accounts, whose `acct` has no "@domain").
 * @param maxPages    Cap on pages of 200; keeps page-load annotations fast.
 * @returns           Set of `username@domain` handles (lowercased).
 */
export async function fetchFollowingHandles(
  client: ReturnType<typeof createMegalodonClient>,
  accountId: string,
  homeDomain: string,
  maxPages = 5,
): Promise<Set<string>> {
  const handles = new Set<string>();
  let maxId: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const res = await client.getAccountFollowing(accountId, {
      limit: 200,
      ...(maxId ? { max_id: maxId } : {}),
    });
    if (!res.data.length) break;
    for (const acc of res.data) {
      const domain = acc.acct.includes("@") ? acc.acct.split("@").pop()! : homeDomain;
      handles.add(`${acc.username}@${domain}`.toLowerCase());
    }
    maxId = res.data[res.data.length - 1].id;
  }

  return handles;
}