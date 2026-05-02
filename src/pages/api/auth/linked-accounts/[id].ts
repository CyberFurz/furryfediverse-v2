export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";

export const PATCH: APIRoute = async ({ locals, request, params }) => {
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
    const updates: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (typeof body.isPrimaryNsfw === "boolean") updates.isPrimaryNsfw = body.isPrimaryNsfw;

    if (typeof body.isPrimaryProfile === "boolean") {
      if (body.isPrimaryProfile) {
        await prisma.$transaction([
          prisma.linkedProfile.updateMany({
            where: { userId: user.id, isPrimaryProfile: true },
            data: { isPrimaryProfile: false },
          }),
          prisma.linkedProfile.update({
            where: { id },
            data: { isPrimaryProfile: true },
          }),
          prisma.user.update({
            where: { id: user.id },
            data: { image: existing.avatarUrl ?? null },
          }),
        ]);

        const refreshed = await prisma.linkedProfile.findUnique({ where: { id } });
        return new Response(JSON.stringify({
          success: true,
          data: {
            id: refreshed?.id,
            isActive: refreshed?.isActive,
            isPrimaryNsfw: refreshed?.isPrimaryNsfw,
            isPrimaryProfile: refreshed?.isPrimaryProfile,
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      updates.isPrimaryProfile = false;
      await prisma.user.update({
        where: { id: user.id },
        data: { image: null },
      });
    }

    const updated = await prisma.linkedProfile.update({
      where: { id },
      data: updates,
    });

    return new Response(JSON.stringify({ success: true, data: { id: updated.id, isActive: updated.isActive, isPrimaryNsfw: updated.isPrimaryNsfw, isPrimaryProfile: updated.isPrimaryProfile } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating linked profile:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
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

    if (existing.isPrimaryProfile) {
      await prisma.user.update({
        where: { id: user.id },
        data: { image: null },
      });
    }

    await prisma.linkedProfile.delete({ where: { id } });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting linked profile:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
