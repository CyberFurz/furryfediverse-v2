export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";

export const DELETE: APIRoute = async ({ url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const roles = (user.role || "user").split(",");
    const isAdmin = roles.includes("admin");
    if (!isAdmin) {
        return new Response(
            JSON.stringify({ error: "Insufficient permissions" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
        );
    }

    const draftId = url.searchParams.get("id");

    if (!draftId) {
        return new Response(
            JSON.stringify({ error: "Draft ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const draft = await prisma.articleDraft.findUnique({
            where: { id: draftId },
        });

        if (!draft) {
            return new Response(
                JSON.stringify({ error: "Draft not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        await prisma.articleDraft.delete({
            where: { id: draftId },
        });

        return new Response(
            JSON.stringify({ success: true, message: `Article draft "${draft.title}" deleted` }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error deleting draft:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
