export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../../../lib/prisma";

const MAX_TAGS = 20;
const TAG_REGEX = /^[a-z0-9_]+$/;

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, "");
}

export const POST: APIRoute = async ({ locals, request, params }) => {
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

    const body = await request.json();
    const rawTag = body.tag as string | undefined;

    if (!rawTag || !rawTag.trim()) {
      return new Response(JSON.stringify({ error: "Tag cannot be empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const normalized = normalizeTag(rawTag);

    if (normalized.length > 50) {
      return new Response(JSON.stringify({ error: "Tag too long (max 50 characters)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!TAG_REGEX.test(normalized)) {
      return new Response(JSON.stringify({ error: "Tag contains invalid characters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const currentCount = await prisma.linkedProfileHashtag.count({
      where: { linkedProfileId: id },
    });

    if (currentCount >= MAX_TAGS) {
      return new Response(JSON.stringify({ error: `Maximum ${MAX_TAGS} tags per account` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tag = await prisma.linkedProfileHashtag.create({
      data: {
        linkedProfileId: id,
        tag: rawTag.trim(),
        normalizedTag: normalized,
      },
    });

    return new Response(JSON.stringify({ success: true, data: { id: tag.id, tag: tag.tag, normalizedTag: tag.normalizedTag } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return new Response(JSON.stringify({ error: "Tag already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Error adding hashtag:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
