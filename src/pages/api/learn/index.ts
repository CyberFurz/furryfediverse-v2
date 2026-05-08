export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { persistInlineArticleImages } from "../../../lib/article-image-storage";

export const GET: APIRoute = async ({ url }) => {
    const search = url.searchParams.get("search") || "";
    const category = url.searchParams.get("category") || "";

    const where: any = {};

    if (search) {
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { content: { contains: search, mode: "insensitive" } },
        ];
    }

    if (category && category !== "all") {
        where.category = category;
    }

    const articles = await prisma.article.findMany({
        where,
        include: {
            author: {
                select: {
                    name: true,
                }
            }
        },
        orderBy: { createdAt: "desc" }
    });

    return new Response(
        JSON.stringify({ articles }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
};

export const POST: APIRoute = async ({ request, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
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
                JSON.stringify({ error: "Invalid category. Must be self-hosting, how-to, or other" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const processedContent = await persistInlineArticleImages(content);

        const draft = await prisma.articleDraft.create({
            data: {
                title,
                content: processedContent,
                category,
                authorId: user.id,
                status: "pending",
            },
            include: {
                author: {
                    select: { name: true }
                }
            }
        });

        return new Response(
            JSON.stringify({ success: true, draft }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error creating article draft:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
