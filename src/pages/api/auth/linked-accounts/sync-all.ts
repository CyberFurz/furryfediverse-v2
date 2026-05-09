export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { syncLinkedProfileById } from "../../../../lib/social/sync-linked-profile";

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_DELAY_MS = 1200;
const DEFAULT_MIN_PROFILE_SYNC_INTERVAL_MS = 1000 * 60 * 60 * 6;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthorized(request: Request): boolean {
  const configuredSecret = process.env.LINKED_PROFILE_SYNC_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-linked-profile-sync-secret")?.trim() ?? "";

  return bearer === configuredSecret || headerSecret === configuredSecret;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profiles = await prisma.linkedProfile.findMany({
    where: { isActive: true },
    select: { id: true, lastSyncedAt: true },
    orderBy: [
      { lastSyncedAt: "asc" },
      { createdAt: "asc" },
    ],
  });

  if (profiles.length === 0) {
    return new Response(JSON.stringify({ success: true, total: 0, synced: 0, skipped: 0, failed: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ profileId: string; status: "success" | "skipped" | "error"; error?: string }> = [];

  for (let i = 0; i < profiles.length; i += DEFAULT_BATCH_SIZE) {
    const batch = profiles.slice(i, i + DEFAULT_BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (profile) => {
        const result = await syncLinkedProfileById(profile.id, {
          minSyncIntervalMs: DEFAULT_MIN_PROFILE_SYNC_INTERVAL_MS,
        });
        if (result.status === "error") {
          return { profileId: profile.id, status: "error" as const, error: result.error };
        }
        if (result.status === "skipped") {
          return { profileId: profile.id, status: "skipped" as const };
        }
        return { profileId: profile.id, status: "success" as const };
      }),
    );

    results.push(...batchResults);

    if (i + DEFAULT_BATCH_SIZE < profiles.length) {
      await sleep(DEFAULT_BATCH_DELAY_MS);
    }
  }

  const synced = results.filter((r) => r.status === "success").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "error").length;

  return new Response(
    JSON.stringify({
      success: true,
      total: profiles.length,
      synced,
      skipped,
      failed,
      results,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
