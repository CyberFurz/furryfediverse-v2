import generator, { detector } from "megalodon";

export type PlatformKey = "mastodon" | "pleroma" | "pixelfed" | "firefish" | "gotosocial";

export interface ProviderConfig {
  key: PlatformKey;
  label: string;
  readScope: string;
  megalodonType: PlatformKey;
}

export interface NormalizedProfile {
  username: string;
  acct: string;
  displayName: string | null;
  avatarUrl: string | null;
  headerUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  profileUrl: string | null;
}

export const PROVIDERS: Record<PlatformKey, ProviderConfig> = {
  mastodon: {
    key: "mastodon",
    label: "Mastodon",
    readScope: "profile",
    megalodonType: "mastodon",
  },
  pleroma: {
    key: "pleroma",
    label: "Pleroma / Akkoma",
    readScope: "read:accounts",
    megalodonType: "pleroma",
  },
  pixelfed: {
    key: "pixelfed",
    label: "Pixelfed",
    readScope: "read",
    megalodonType: "pixelfed",
  },
  firefish: {
    key: "firefish",
    label: "Firefish / Iceshrimp",
    readScope: "read:account",
    megalodonType: "firefish",
  },
  gotosocial: {
    key: "gotosocial",
    label: "GoToSocial",
    // "profile" alone is too narrow: account lookup (@user@domain in pack
    // search) and the follow batch need read:accounts / read:search /
    // write:follows. Megalodon joins the scope list with spaces when
    // registering the app and building the authorize URL.
    readScope: "profile read:accounts read:search write:follows",
    megalodonType: "gotosocial",
  },
};

export function getMegalodonType(platform: PlatformKey) {
  return PROVIDERS[platform].megalodonType;
}

export async function detectPlatform(domain: string): Promise<PlatformKey | null> {
  try {
    const detected = await detector(`https://${domain}`);
    if (!detected) return null;
    const match: Record<string, PlatformKey> = {
      mastodon: "mastodon",
      pleroma: "pleroma",
      pixelfed: "pixelfed",
      firefish: "firefish",
      "gotosocial": "gotosocial",
    };
    return match[detected] ?? null;
  } catch {
    return null;
  }
}

export function createMegalodonClient(platform: PlatformKey, domain: string, accessToken: string) {
  const type = getMegalodonType(platform);
  return generator(type, `https://${domain}`, accessToken);
}
