import type { APIRoute } from "astro";

/**
 * Require a logged-in user for a route handler.
 *
 * Returns `{ user, error: null }` when authenticated, or
 * `{ user: null, error: Response }` with a 401 when not. Callers should
 * return the error immediately:
 *
 * ```ts
 * const { user, error } = requireUser(locals);
 * if (error || !user) return error!;
 * ```
 */
export function requireUser(locals: Record<string, any>): { user: any; error: Response | null } {
    if (!locals.session || !locals.user) {
        return {
            user: null,
            error: new Response(
                JSON.stringify({ error: "Authentication required" }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            ),
        };
    }
    return { user: locals.user, error: null };
}

/** Return the last path segment of a URL as the resource slug. */
export function slugFrom(url: URL): string | null {
    const segments = url.pathname.split("/");
    return segments[segments.length - 1] || null;
}

/** Check a user's comma-separated role list for admin. */
export function isAdmin(user: { role?: string | null }): boolean {
    return (user.role || "user").split(",").includes("admin");
}

export type { APIRoute };
