export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";

export const POST: APIRoute = async ({ url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const roles = (user.role || "user").split(",");
    const canReject = roles.includes("admin") || roles.includes("reviewer");
    if (!canReject) {
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
            include: { author: { select: { name: true } } }
        });

        if (!draft) {
            return new Response(
                JSON.stringify({ error: "Draft not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        await prisma.articleDraft.update({
            where: { id: draftId },
            data: { status: "rejected" }
        });

        return new Response(
            JSON.stringify({ success: true, message: `Draft "${draft.title}" rejected` }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error rejecting draft:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
