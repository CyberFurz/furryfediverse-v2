export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { persistInlineArticleImages } from "../../../lib/article-image-storage";

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
    const canApprove = roles.includes("admin") || roles.includes("reviewer");
    if (!canApprove) {
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

        const processedContent = await persistInlineArticleImages(draft.content);

        if (draft.articleId) {
            const updatedArticle = await prisma.article.update({
                where: { id: draft.articleId },
                data: {
                    title: draft.title,
                    content: processedContent,
                    category: draft.category,
                }
            });

            await prisma.articleDraft.update({
                where: { id: draftId },
                data: { status: "approved", content: processedContent }
            });

            return new Response(
                JSON.stringify({ success: true, message: `Article "${draft.title}" updated`, article: updatedArticle }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        } else {
            const newArticle = await prisma.article.create({
                data: {
                    title: draft.title,
                    content: processedContent,
                    category: draft.category,
                    authorId: draft.authorId,
                }
            });

            await prisma.articleDraft.update({
                where: { id: draftId },
                data: {
                    status: "approved",
                    articleId: newArticle.id,
                    content: processedContent,
                }
            });

            return new Response(
                JSON.stringify({ success: true, message: `Article "${draft.title}" published`, article: newArticle }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }
    } catch (error) {
        console.error("Error approving article:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
