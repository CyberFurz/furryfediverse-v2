import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { APIRoute } from "astro";

export const prerender = false;

function isAdmin(user: any): boolean {
  const roles = (user.role || "user").split(",");
  return roles.includes("admin");
}

/** Record an admin action against a pack for the audit trail. */
async function writeAuditLog(packId: string, actorId: string, action: string, reason?: string) {
  await prisma.packAuditLog.create({
    data: { packId, actorId, action, reason: reason || null },
  });
}

export const POST: APIRoute = async (context) => {
  const session = await auth.api
    .getSession({
      headers: context.request.headers,
    })
    .catch(() => null);

  if (!session || !isAdmin(session.user)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await context.request.json();
    const { action, packId, reason, confirm } = body;

    if (!packId) {
      return new Response(
        JSON.stringify({ error: "packId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const pack = await prisma.starterPack.findUnique({ where: { id: packId } });
    if (!pack) {
      return new Response(
        JSON.stringify({ error: "Pack not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    let result;
    switch (action) {
      case "approve":
        if (pack.status === "approved" && pack.publishedAt) {
          return new Response(
            JSON.stringify({ error: "Pack is already approved and published" }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        result = await prisma.starterPack.update({
          where: { id: packId },
          data: { status: "approved", publishedAt: new Date(), deletedAt: null },
        });
        await writeAuditLog(packId, session.user.id, "approve", reason);
        break;
      case "reject":
        if (pack.status === "rejected") {
          return new Response(
            JSON.stringify({ error: "Pack is already rejected" }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        result = await prisma.starterPack.update({
          where: { id: packId },
          data: { status: "rejected", publishedAt: null },
        });
        await writeAuditLog(packId, session.user.id, "reject", reason);
        break;
      case "delete":
        // Destructive action: require explicit confirmation from the API
        // caller, since the browser-side confirm() dialog is bypassable.
        if (confirm !== true) {
          return new Response(
            JSON.stringify({ error: "Deletion requires confirm: true" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (pack.deletedAt) {
          return new Response(
            JSON.stringify({ error: "Pack is already deleted" }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        result = await prisma.starterPack.update({
          where: { id: packId },
          data: { deletedAt: new Date(), status: "rejected", publishedAt: null },
        });
        await writeAuditLog(packId, session.user.id, "delete", reason);
        break;
      case "restore":
        if (!pack.deletedAt) {
          return new Response(
            JSON.stringify({ error: "Pack is not deleted" }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        result = await prisma.starterPack.update({
          where: { id: packId },
          data: { deletedAt: null, status: "draft", publishedAt: null },
        });
        await writeAuditLog(packId, session.user.id, "restore", reason);
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Action failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
