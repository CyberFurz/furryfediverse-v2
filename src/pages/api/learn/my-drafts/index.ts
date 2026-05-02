export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";

export const GET: APIRoute = async ({ url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const drafts = await prisma.articleDraft.findMany({
        where: { authorId: user.id },
        include: {
            author: {
                select: { name: true }
            },
            article: {
                select: { id: true, createdAt: true }
            }
        },
        orderBy: { createdAt: "desc" }
    });

    return new Response(
        JSON.stringify({ drafts }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
};
