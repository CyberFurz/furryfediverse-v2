export const prerender = false;

import type { APIRoute } from "astro";
import { indexEvent } from "../../../../lib/events/indexer";
import { requireUser } from "../../../../lib/api-helpers";

export const POST: APIRoute = async ({ url, locals }) => {
    const { user, error: authError } = requireUser(locals);
    if (authError || !user) return authError!;

    try {
        const pathSegments = url.pathname.split("/");
        const slug = pathSegments[pathSegments.length - 2];

        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Slug is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Check admin or owner
        const { prisma } = await import("../../../../lib/prisma");
        const event = await prisma.event.findFirst({ where: { slug } });
        if (!event) {
            return new Response(
                JSON.stringify({ error: "Event not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const roles = (user.role || "user").split(",");
        const isAdmin = roles.includes("admin");
        if (event.createdById !== user.id && !isAdmin) {
            return new Response(
                JSON.stringify({ error: "Only the event owner or admin can index posts" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const result = await indexEvent(slug, user.id);

        return new Response(
            JSON.stringify({
                success: true,
                ...result,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error indexing event:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
