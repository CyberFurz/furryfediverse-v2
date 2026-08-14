export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
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

        const existing = await prisma.starterPack.findFirst({
            where: { slug, deletedAt: null },
        });

        if (!existing) {
            return new Response(
                JSON.stringify({ error: "Starter pack not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (existing.createdById !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only publish your own starter packs" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        // If already published (approved), allow unpublishing
        if (existing.status === "approved" && existing.publishedAt) {
            const updated = await prisma.starterPack.update({
                where: { id: existing.id },
                data: { publishedAt: null },
                include: {
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { accounts: true } },
                },
            });
            return new Response(
                JSON.stringify(updated),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // If draft, submit for review
        if (existing.status === "draft") {
            const updated = await prisma.starterPack.update({
                where: { id: existing.id },
                data: {
                    status: "pending",
                    submittedAt: new Date(),
                },
                include: {
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { accounts: true } },
                },
            });
            return new Response(
                JSON.stringify(updated),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // If pending or rejected, allow resubmission
        const updated = await prisma.starterPack.update({
            where: { id: existing.id },
            data: {
                status: "pending",
                submittedAt: new Date(),
            },
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { accounts: true } },
            },
        });

        return new Response(
            JSON.stringify(updated),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error toggling starter pack publish:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
