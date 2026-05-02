export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";

export const GET: APIRoute = async ({ params, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const draftId = params.id;

    if (!draftId) {
        return new Response(
            JSON.stringify({ error: "Draft ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const draft = await prisma.articleDraft.findUnique({
            where: { id: draftId },
            include: {
                author: {
                    select: { name: true }
                }
            }
        });

        if (!draft) {
            return new Response(
                JSON.stringify({ error: "Draft not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (draft.authorId !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only edit your own drafts" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ draft }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error fetching draft:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const draftId = params.id;

    if (!draftId) {
        return new Response(
            JSON.stringify({ error: "Draft ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const existingDraft = await prisma.articleDraft.findUnique({
            where: { id: draftId }
        });

        if (!existingDraft) {
            return new Response(
                JSON.stringify({ error: "Draft not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (existingDraft.authorId !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only edit your own drafts" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await request.json();
        const { title, content, category } = body;

        if (!title || !content || !category) {
            return new Response(
                JSON.stringify({ error: "Title, content, and category are required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const validCategories = ["self-hosting", "how-to", "other"];
        if (!validCategories.includes(category)) {
            return new Response(
                JSON.stringify({ error: "Invalid category" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const updatedDraft = await prisma.articleDraft.update({
            where: { id: draftId },
            data: {
                title,
                content,
                category,
                status: "pending",
            },
            include: {
                author: {
                    select: { name: true }
                }
            }
        });

        return new Response(
            JSON.stringify({ success: true, draft: updatedDraft }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error updating draft:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const draftId = params.id;

    if (!draftId) {
        return new Response(
            JSON.stringify({ error: "Draft ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const draft = await prisma.articleDraft.findUnique({
            where: { id: draftId }
        });

        if (!draft) {
            return new Response(
                JSON.stringify({ error: "Draft not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (draft.authorId !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only delete your own drafts" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        await prisma.articleDraft.delete({
            where: { id: draftId }
        });

        return new Response(
            JSON.stringify({ success: true }),
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
