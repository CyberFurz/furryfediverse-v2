export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../../lib/prisma";
import { createMegalodonClient } from "../../../../../lib/social/providers";
import { deleteCachedProfileImageByUrl, downloadAndCacheProfileImage } from "../../../../../lib/image-cache";

export const POST: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing profile ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const existing = await prisma.linkedProfile.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!existing.isActive) {
      return new Response(JSON.stringify({ error: "Profile is not active" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const profileClient = createMegalodonClient(
      existing.platform as any,
      existing.instanceDomain,
      existing.accessToken,
    );

    const accountRes = await profileClient.verifyAccountCredentials();

    if (accountRes.status !== 200 || !accountRes.data) {
      return new Response(JSON.stringify({ error: "Profile fetch failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const account = accountRes.data;
    const refreshToken = Date.now();

    const cachedAvatarUrl = account.avatar
      ? await downloadAndCacheProfileImage(
          account.avatar,
          `${existing.platform}-${existing.instanceDomain}-${existing.externalAccountId}-avatar-${refreshToken}`,
          true,
        )
      : null;
    const cachedHeaderUrl = account.header
      ? await downloadAndCacheProfileImage(
          account.header,
          `${existing.platform}-${existing.instanceDomain}-${existing.externalAccountId}-header-${refreshToken}`,
          true,
        )
      : null;

    const updated = await prisma.linkedProfile.update({
      where: { id },
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
        where: { id: user.id },
        data: { image: updated.avatarUrl ?? null },
      });
    }

    return new Response(JSON.stringify({ success: true, data: { id: updated.id, lastSyncedAt: updated.lastSyncedAt } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error syncing linked profile:", error);
    const errMsg = error instanceof Error ? error.message : "unknown";
    await prisma.linkedProfile.update({
      where: { id },
      data: { syncError: errMsg, lastSyncedAt: new Date() },
    });
    return new Response(JSON.stringify({ error: "Sync failed", details: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
