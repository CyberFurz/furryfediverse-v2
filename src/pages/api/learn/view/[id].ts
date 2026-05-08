export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { sanitizeArticleHtml } from "../../../../lib/html-sanitizer";

export const GET: APIRoute = async ({ params }) => {
    const articleId = params.id;

    if (!articleId) {
        return new Response(
            JSON.stringify({ error: "Article ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            include: {
                author: {
                    select: { name: true }
                }
            }
        });

        if (!article) {
            return new Response(
                JSON.stringify({ error: "Article not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({
                article: {
                    ...article,
                    content: sanitizeArticleHtml(article.content),
                },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error fetching article:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
