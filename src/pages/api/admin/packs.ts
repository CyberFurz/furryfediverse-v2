import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { APIRoute } from "astro";

export const prerender = false;

function isAdmin(user: any): boolean {
  const roles = (user.role || "user").split(",");
  return roles.includes("admin");
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
    const { action, packId } = body;

        let result;
        switch (action) {
          case "approve":
            result = await prisma.starterPack.update({
              where: { id: packId },
              data: { status: "approved", publishedAt: new Date() },
            });
            break;
          case "reject":
            result = await prisma.starterPack.update({
              where: { id: packId },
              data: { status: "rejected", publishedAt: null },
            });
            break;
          case "delete":
            result = await prisma.starterPack.update({
              where: { id: packId },
              data: { deletedAt: new Date() },
            });
            break;
          case "restore":
            result = await prisma.starterPack.update({
              where: { id: packId },
              data: { deletedAt: null },
            });
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
