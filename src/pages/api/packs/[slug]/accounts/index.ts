export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../../lib/prisma";
import generator from "megalodon";
import { requireUser } from "../../../../../lib/api-helpers";

/** Look up a @user@instance handle on the caller's home instance. */
async function lookupRemoteAccount(q: string, userId: string): Promise<Record<string, unknown> | null> {
    if (!q.match(/^@?([^@]+)@(.+)$/)) return null;

    const fullAcct = q.startsWith("@") ? q : `@${q}`;
    const userProfile = await prisma.linkedProfile.findFirst({
        where: { userId, isActive: true },
        select: { instanceDomain: true, platform: true, accessToken: true },
    });
    if (!userProfile) return null;

    try {
        const client = generator(
            userProfile.platform as "mastodon" | "pleroma" | "pixelfed" | "firefish" | "gotosocial",
            `https://${userProfile.instanceDomain}`,
            userProfile.accessToken
        );
        const result = await client.lookupAccount(fullAcct);
        return result.data as Record<string, unknown>;
    } catch {
        // Remote lookup failed, continue with local search only
        return null;
    }
}

export const GET: APIRoute = async ({ url, locals }) => {
    const { user, error: authError } = requireUser(locals);
    if (authError || !user) return authError!;

    try {
        const slug = url.pathname.split("/")[3];
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
                JSON.stringify({ error: "You can only manage your own starter packs" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const q = url.searchParams.get("q") || "";
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = 50;
        const skip = (page - 1) * limit;

        const remoteAccount = await lookupRemoteAccount(q, user.id);

        // Search LinkedProfiles
        const where: Record<string, unknown> = {};
        if (q) {
            where.OR = [
                { username: { contains: q, mode: "insensitive" } },
                { displayName: { contains: q, mode: "insensitive" } },
                { acct: { contains: q, mode: "insensitive" } },
            ];
        }

        const [profiles, totalCount, handleAccounts] = await Promise.all([
            prisma.linkedProfile.findMany({
                where,
                skip,
                take: limit,
                orderBy: { followersCount: "desc" },
            }),
            prisma.linkedProfile.count({ where }),
            // Always fetch handle-based accounts in this pack
            prisma.starterPackAccount.findMany({
                where: { starterPackId: pack.id, linkedProfileId: null, handle: { not: null } },
                select: { id: true, handle: true },
                orderBy: { createdAt: "asc" },
            }),
        ]);

        // Annotate profiles with inStarterPack
        const existingAccountIds = await prisma.starterPackAccount.findMany({
            where: { starterPackId: pack.id, linkedProfileId: { not: null } },
            select: { linkedProfileId: true },
        });
        const existingSet = new Set(existingAccountIds.map((a) => a.linkedProfileId));

        const results = profiles.map((p) => ({
            id: p.id,
            platform: p.platform,
            instanceDomain: p.instanceDomain,
            username: p.username,
            acct: p.acct,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl,
            profileUrl: p.profileUrl,
            followersCount: p.followersCount,
            isActive: p.isActive,
            inStarterPack: existingSet.has(p.id),
        }));

        return new Response(
            JSON.stringify({
                accounts: results,
                handleAccounts,
                remoteAccount,
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
                packAccountCount: pack.numAccounts,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error searching accounts for starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const POST: APIRoute = async ({ request, url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

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
                JSON.stringify({ error: "You can only manage your own starter packs" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await request.json();
        const { linkedProfileId, handle } = body;

        if (!linkedProfileId && !handle) {
            return new Response(
                JSON.stringify({ error: "linkedProfileId or handle is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        let inStarterPack: boolean;

        if (handle) {
            // Remove handle-based account from pack
            const existing = await prisma.starterPackAccount.findFirst({
                where: { starterPackId: pack.id, handle },
            });
            if (existing) {
                await prisma.starterPackAccount.delete({ where: { id: existing.id } });
                inStarterPack = false;
            } else {
                return new Response(
                    JSON.stringify({ error: "Handle not found in pack" }),
                    { status: 404, headers: { "Content-Type": "application/json" } }
                );
            }
        } else {
            // Check if account is already in the pack
            const existing = await prisma.starterPackAccount.findUnique({
                where: {
                    starterPackId_linkedProfileId: {
                        starterPackId: pack.id,
                        linkedProfileId,
                    },
                },
            });

            if (existing) {
                // Remove from pack
                await prisma.starterPackAccount.delete({
                    where: { id: existing.id },
                });
                inStarterPack = false;
            } else {
                // Check max accounts limit
                const accountCount = await prisma.starterPackAccount.count({
                    where: { starterPackId: pack.id },
                });

                if (accountCount >= 150) {
                    return new Response(
                        JSON.stringify({ error: "Maximum of 150 accounts per pack" }),
                        { status: 400, headers: { "Content-Type": "application/json" } }
                    );
                }

                // Check account is discoverable
                const profile = await prisma.linkedProfile.findUnique({
                    where: { id: linkedProfileId },
                    select: { isActive: true },
                });

                if (!profile) {
                    return new Response(
                        JSON.stringify({ error: "Linked profile not found" }),
                        { status: 404, headers: { "Content-Type": "application/json" } }
                    );
                }

                if (!profile.isActive) {
                    return new Response(
                        JSON.stringify({ error: "Account is not discoverable" }),
                        { status: 400, headers: { "Content-Type": "application/json" } }
                    );
                }

                // Add to pack
                await prisma.starterPackAccount.create({
                    data: {
                        starterPackId: pack.id,
                        linkedProfileId,
                        createdById: user.id,
                    },
                });
                inStarterPack = true;
            }
        }

        // Update numAccounts on the pack
        const newCount = await prisma.starterPackAccount.count({
            where: { starterPackId: pack.id },
        });

        await prisma.starterPack.update({
            where: { id: pack.id },
            data: { numAccounts: newCount },
        });

        return new Response(
            JSON.stringify({ inStarterPack, numAccounts: newCount }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error toggling account in starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
