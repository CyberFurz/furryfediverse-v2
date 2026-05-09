export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profiles = await prisma.linkedProfile.findMany({
    where: { userId: user.id },
    include: { hashtags: { orderBy: { tag: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  const sanitized = profiles.map((p) => ({
    id: p.id,
    platform: p.platform,
    instanceDomain: p.instanceDomain,
    username: p.username,
    acct: p.acct,
    displayName: p.displayName,
    bio: p.bio,
    avatarUrl: p.avatarUrl,
    profileUrl: p.profileUrl,
    followersCount: p.followersCount,
    followingCount: p.followingCount,
    statusesCount: p.statusesCount,
    lastSyncedAt: p.lastSyncedAt,
    customEmojiMap: p.customEmojiMap,
    isActive: p.isActive,
    isPrimaryNsfw: p.isPrimaryNsfw,
    isPrimaryProfile: p.isPrimaryProfile,
    createdAt: p.createdAt,
    hashtags: p.hashtags.map((h) => ({ id: h.id, tag: h.tag, normalizedTag: h.normalizedTag })),
  }));

  return new Response(JSON.stringify({ success: true, data: sanitized }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
