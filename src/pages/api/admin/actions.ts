import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
    const { action, userId, role, banReason, banExpiresIn, email, password, name, data } = body;

    let result;
    switch (action) {
      case "createUser":
        result = await auth.api.createUser({
          body: { email, password, name, role: role || "user", data },
          headers: context.request.headers,
        });
        break;
      case "updateUser":
        result = await auth.api.adminUpdateUser({
          body: { userId, data },
          headers: context.request.headers,
        });
        break;
      case "ban":
        result = await auth.api.banUser({
          body: { userId, banReason, banExpiresIn },
          headers: context.request.headers,
        });
        break;
      case "unban":
        result = await auth.api.unbanUser({
          body: { userId },
          headers: context.request.headers,
        });
        break;
      case "setRole":
        result = await auth.api.setRole({
          body: { userId, role },
          headers: context.request.headers,
        });
        break;
      case "removeUsers": {
        const ids: unknown = body.userIds;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
          return new Response(
            JSON.stringify({ error: "userIds must be an array of 1-500 IDs" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === "string"))];
        const targets = await prisma.user.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, role: true },
        });
        const deleted: string[] = [];
        const skipped: { id: string; reason: string }[] = [];
        const failed: { id: string; error: string }[] = [];
        const found = new Set(targets.map((t) => t.id));
        for (const id of uniqueIds) {
          if (!found.has(id)) skipped.push({ id, reason: "not found" });
        }
        for (const target of targets) {
          if (target.id === session.user.id) {
            skipped.push({ id: target.id, reason: "cannot delete yourself" });
            continue;
          }
          if (isAdmin(target)) {
            skipped.push({ id: target.id, reason: "is an admin" });
            continue;
          }
          try {
            await auth.api.removeUser({
              body: { userId: target.id },
              headers: context.request.headers,
            });
            deleted.push(target.id);
          } catch (err: unknown) {
            failed.push({ id: target.id, error: err instanceof Error ? err.message : "failed" });
          }
        }
        result = { deleted, skipped, failed };
        break;
      }
      case "removeUser":
        result = await auth.api.removeUser({
          body: { userId },
          headers: context.request.headers,
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
