import generator, { detector } from "megalodon";

export type PlatformKey = "mastodon" | "pleroma" | "pixelfed" | "firefish" | "gotosocial";

export interface ProviderConfig {
  key: PlatformKey;
  label: string;
  readScope: string;
  megadonType: "mastodon" | "pleroma" | "pixelfed" | "firefish" | "gotosocial";
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
    readScope: "read",
    megadonType: "mastodon",
  },
  pleroma: {
    key: "pleroma",
    label: "Pleroma / Akkoma",
    readScope: "read",
    megadonType: "pleroma",
  },
  pixelfed: {
    key: "pixelfed",
    label: "Pixelfed",
    readScope: "read",
    megadonType: "pixelfed",
  },
  firefish: {
    key: "firefish",
    label: "Firefish / Iceshrimp",
    readScope: "read:account",
    megadonType: "firefish",
  },
  gotosocial: {
    key: "gotosocial",
    label: "GoToSocial",
    readScope: "read",
    megadonType: "gotosocial",
  },
};

export function getMegalodonType(platform: PlatformKey) {
  return PROVIDERS[platform].megadonType;
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
