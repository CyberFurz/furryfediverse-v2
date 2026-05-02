export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../../../lib/prisma";

export const DELETE: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id, tagId } = params;
  if (!id || !tagId) {
    return new Response(JSON.stringify({ error: "Missing profile ID or tag ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const linkedProfile = await prisma.linkedProfile.findUnique({ where: { id } });
    if (!linkedProfile || linkedProfile.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hashtag = await prisma.linkedProfileHashtag.findUnique({ where: { id: tagId } });
    if (!hashtag || hashtag.linkedProfileId !== id) {
      return new Response(JSON.stringify({ error: "Tag not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await prisma.linkedProfileHashtag.delete({ where: { id: tagId } });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting hashtag:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
