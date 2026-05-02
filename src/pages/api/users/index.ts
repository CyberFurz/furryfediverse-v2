export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";

export const GET: APIRoute = async ({ url }) => {
  try {
    const search = (url.searchParams.get("search") || "").trim();

    const profiles = await prisma.linkedProfile.findMany({
      where: {
        isActive: true,
        OR: search
          ? [
              { displayName: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
              { acct: { contains: search, mode: "insensitive" } },
              { bio: { contains: search, mode: "insensitive" } },
              {
                hashtags: {
                  some: {
                    OR: [
                      { tag: { contains: search, mode: "insensitive" } },
                      { normalizedTag: { contains: search, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ]
          : undefined,
      },
      include: {
        hashtags: {
          orderBy: { normalizedTag: "asc" },
          select: { id: true, normalizedTag: true },
        },
      },
      orderBy: [{ followersCount: "desc" }, { createdAt: "desc" }],
      take: 120,
    });

    const data = profiles.map((p) => ({
      id: p.id,
      platform: p.platform,
      instanceDomain: p.instanceDomain,
      displayName: p.displayName,
      username: p.username,
      acct: p.acct,
      avatarUrl: p.avatarUrl,
      headerUrl: p.headerUrl,
      bio: p.bio,
      followersCount: p.followersCount,
      followingCount: p.followingCount,
      statusesCount: p.statusesCount,
      profileUrl: p.profileUrl,
      isPrimaryNsfw: p.isPrimaryNsfw,
      hashtags: p.hashtags,
    }));

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching user directory:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
