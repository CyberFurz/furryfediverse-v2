import { auth } from "../../../lib/auth";
import type { APIRoute } from "astro";

export const prerender = false;

// Public email/password registration is disabled. New accounts must be
// created through the fediverse signup flow (/api/auth/fediverse-signup/complete),
// or by an admin (/api/admin/actions). Both call auth.api directly, so
// they are not affected by this block. Legacy email/password sign-in still works.
const BLOCKED_PATHS = new Set(["/api/auth/sign-up/email"]);

export const ALL: APIRoute = (context) => {
  const pathname = new URL(context.request.url).pathname.replace(/\/+$/, "");
  if (BLOCKED_PATHS.has(pathname)) {
    return new Response(
      JSON.stringify({
        message: "Email registration is disabled. Please sign up with your fediverse account.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return auth.handler(context.request);
};
