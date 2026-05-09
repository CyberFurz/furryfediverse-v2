export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../../lib/prisma";
import { syncLinkedProfileById } from "../../../../../lib/social/sync-linked-profile";

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

    const result = await syncLinkedProfileById(id);
    if (result.status !== "success") {
      return new Response(JSON.stringify({ error: result.status === "error" ? result.error : "Sync skipped" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: { id, lastSyncedAt: result.lastSyncedAt } }), {
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
