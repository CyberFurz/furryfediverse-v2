export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "@/lib/prisma";
import { followAllAccounts } from "@/lib/social/follow-all";
import { requireUser } from "@/lib/api-helpers";

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

        const pack = await prisma.starterPack.findFirst({
            where: { slug, deletedAt: null },
        });

        if (!pack) {
            return new Response(
                JSON.stringify({ error: "Starter pack not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const linkedProfile = await prisma.linkedProfile.findFirst({
            where: {
                userId: user.id,
                isActive: true,
            },
            orderBy: { isPrimaryProfile: "desc" },
        });

        if (!linkedProfile) {
            return new Response(
                JSON.stringify({ error: "No active Mastodon linked profile found. Link an account first." }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const packLinks = await prisma.starterPackAccount.findMany({
            where: { starterPackId: pack.id },
            select: { linkedProfileId: true },
        });

        const profileIds = packLinks
            .map((pl) => pl.linkedProfileId)
            .filter((id): id is string => id !== null);
        const packProfiles = await prisma.linkedProfile.findMany({
            where: { id: { in: profileIds } },
        });

        // Build the packAccounts array in the order of the original query
        const profileMap = new Map(packProfiles.map((p) => [p.id, p]));
        const packAccounts = packLinks
            .map((pl) => (pl.linkedProfileId ? profileMap.get(pl.linkedProfileId) : undefined))
            .filter(Boolean)
            .map((profile) => ({ linkedProfile: profile! }));

        // Execute follows
        const result = await followAllAccounts(linkedProfile, packAccounts);

        // Record the follow-all click for popularity tracking
        await prisma.followAllClick.create({
            data: {
                userId: user.id,
                starterPackId: pack.id,
            },
        });

        return new Response(
            JSON.stringify({
                ...result,
                backgroundStarted: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error following all accounts in starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
