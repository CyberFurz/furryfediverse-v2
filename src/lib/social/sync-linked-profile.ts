import { prisma } from "../prisma";
import { deleteCachedProfileImageByUrl, downloadAndCacheProfileEmoji, downloadAndCacheProfileImage } from "../image-cache";
import { createMegalodonClient } from "./providers";

interface RemoteCustomEmoji {
  shortcode?: string;
  url?: string;
  static_url?: string;
}

async function buildCustomEmojiMap(existing: {
  platform: string;
  instanceDomain: string;
  externalAccountId: string;
}, rawEmojis: unknown): Promise<Record<string, string>> {
  const emojis = Array.isArray(rawEmojis) ? (rawEmojis as RemoteCustomEmoji[]) : [];
  const mapEntries = await Promise.all(
    emojis.slice(0, 100).map(async (emoji) => {
      const shortcode = (emoji.shortcode ?? "").trim().toLowerCase();
      if (!shortcode) return null;

      const sourceUrl = emoji.static_url ?? emoji.url;
      if (!sourceUrl) return null;

      const cachedUrl = await downloadAndCacheProfileEmoji(
        sourceUrl,
        `${existing.platform}-${existing.instanceDomain}-${existing.externalAccountId}-emoji-${shortcode}`,
        true,
      );

      if (!cachedUrl) return null;
      return [shortcode, cachedUrl] as const;
    }),
  );

  return Object.fromEntries(mapEntries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
}

export interface SyncLinkedProfileOptions {
  minSyncIntervalMs?: number;
}

export type SyncLinkedProfileResult =
  | { status: "success"; profileId: string; lastSyncedAt: Date }
  | { status: "skipped"; profileId: string; reason: "recently-synced" }
  | { status: "error"; profileId: string; error: string };

export async function syncLinkedProfileById(
  profileId: string,
  options: SyncLinkedProfileOptions = {},
): Promise<SyncLinkedProfileResult> {
  const existing = await prisma.linkedProfile.findUnique({ where: { id: profileId } });

  if (!existing || !existing.isActive) {
    return { status: "error", profileId, error: "Profile not found or inactive" };
  }

  const minSyncIntervalMs = options.minSyncIntervalMs ?? 0;
  if (minSyncIntervalMs > 0 && existing.lastSyncedAt) {
    const ageMs = Date.now() - existing.lastSyncedAt.getTime();
    if (ageMs < minSyncIntervalMs) {
      return { status: "skipped", profileId, reason: "recently-synced" };
    }
  }

  try {
    const profileClient = createMegalodonClient(
      existing.platform as any,
      existing.instanceDomain,
      existing.accessToken,
    );

    const accountRes = await profileClient.verifyAccountCredentials();
    if (accountRes.status !== 200 || !accountRes.data) {
      const err = "Profile fetch failed";
      await prisma.linkedProfile.update({
        where: { id: profileId },
        data: { syncError: err, lastSyncedAt: new Date() },
      });
      return { status: "error", profileId, error: err };
    }

    const account = accountRes.data;

    const cachedAvatarUrl = account.avatar
      ? await downloadAndCacheProfileImage(
          account.avatar,
          `${existing.platform}-${existing.instanceDomain}-${existing.externalAccountId}-avatar`,
          true,
        )
      : null;
    const cachedHeaderUrl = account.header
      ? await downloadAndCacheProfileImage(
          account.header,
          `${existing.platform}-${existing.instanceDomain}-${existing.externalAccountId}-header`,
          true,
        )
      : null;
    const customEmojiMap = await buildCustomEmojiMap(existing, (account as { emojis?: unknown }).emojis);

    const updated = await prisma.linkedProfile.update({
      where: { id: profileId },
      data: {
        username: account.username,
        acct: account.acct,
        displayName: account.display_name ?? null,
        avatarUrl: cachedAvatarUrl ?? account.avatar ?? null,
        headerUrl: cachedHeaderUrl ?? account.header ?? null,
        bio: account.note ?? null,
        followersCount: account.followers_count ?? 0,
        followingCount: account.following_count ?? 0,
        statusesCount: account.statuses_count ?? 0,
        profileUrl: account.url ?? null,
        customEmojiMap,
        customEmojiUpdatedAt: new Date(),
        lastSyncedAt: new Date(),
        syncError: null,
      },
    });

    if (updated.avatarUrl && existing.avatarUrl && updated.avatarUrl !== existing.avatarUrl) {
      deleteCachedProfileImageByUrl(existing.avatarUrl);
    }

    if (updated.headerUrl && existing.headerUrl && updated.headerUrl !== existing.headerUrl) {
      deleteCachedProfileImageByUrl(existing.headerUrl);
    }

    if (updated.isPrimaryProfile) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { image: updated.avatarUrl ?? null },
      });
    }

    return { status: "success", profileId, lastSyncedAt: updated.lastSyncedAt ?? new Date() };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "unknown";
    await prisma.linkedProfile.update({
      where: { id: profileId },
      data: { syncError: errMsg, lastSyncedAt: new Date() },
    });
    return { status: "error", profileId, error: errMsg };
  }
}
