export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../../lib/prisma";
import { requireUser } from "../../../../../lib/api-helpers";

export const GET: APIRoute = async ({ url, locals }) => {
    const { user, error: authError } = requireUser(locals);
    if (authError || !user) return authError!;

    try {
        const pathSegments = url.pathname.split("/");
        const slug = pathSegments[3];

        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Slug is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const pack = await prisma.starterPack.findFirst({
            where: { slug, deletedAt: null },
        });

        if (!pack) {
            return new Response(
                JSON.stringify({ error: "Starter pack not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (pack.createdById !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only review your own starter packs" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = 50;
        const skip = (page - 1) * limit;

        const [accounts, totalCount] = await Promise.all([
            prisma.starterPackAccount.findMany({
                where: { starterPackId: pack.id },
                skip,
                take: limit,
                include: {
                    linkedProfile: {
                        select: {
                            id: true,
                            username: true,
                            acct: true,
                            displayName: true,
                            avatarUrl: true,
                            profileUrl: true,
                            followersCount: true,
                            isActive: true,
                            platform: true,
                            instanceDomain: true,
                            bio: true,
                        },
                    },
                },
                orderBy: { createdAt: "asc" },
            }),
            prisma.starterPackAccount.count({
                where: { starterPackId: pack.id },
            }),
        ]);

        const results = accounts.map((a) => ({
            id: a.id,
            addedAt: a.createdAt,
            linkedProfile: a.linkedProfile,
            discoverable: a.linkedProfile?.isActive ?? false,
        }));

        return new Response(
            JSON.stringify({
                accounts: results,
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error reviewing starter pack accounts:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
