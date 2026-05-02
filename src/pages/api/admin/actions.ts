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
