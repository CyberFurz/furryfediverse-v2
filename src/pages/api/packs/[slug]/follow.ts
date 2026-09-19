export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "@/lib/prisma";
import { followNextBatch, FOLLOW_BATCH_SIZE } from "@/lib/social/follow-all";
import { fetchFollowingHandles } from "@/lib/social/following";
import { buildHandle, canonicalHandle, parseHandle } from "@/lib/social/handles";
import { requireUser, isAdmin } from "@/lib/api-helpers";
import { createMegalodonClient, type PlatformKey } from "@/lib/social/providers";

/** Minimum time (ms) between follow-batch actions per user. */
const FOLLOW_COOLDOWN_MS = 60_000;

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

        // Only approved, published packs may be followed. Drafts, pending
        // reviews, and rejected packs are not followable even with a slug.
        if (pack.status !== "approved" || !pack.publishedAt) {
            return new Response(
                JSON.stringify({ error: "This pack is not yet available to follow" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
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

        // Cooldown: only one follow-batch per user per minute (across all
        // packs), so a misbehaving client can't hammer home or target
        // instances by cycling through packs.
        const recentClick = await prisma.followAllClick.findFirst({
            where: {
                userId: user.id,
                createdAt: { gte: new Date(Date.now() - FOLLOW_COOLDOWN_MS) },
            },
            orderBy: { createdAt: "desc" },
        });
        if (recentClick) {
            const waitSec = Math.ceil(
                (recentClick.createdAt.getTime() + FOLLOW_COOLDOWN_MS - Date.now()) / 1000,
            );
            return new Response(
                JSON.stringify({ error: `Please wait ${waitSec}s before following more accounts from this pack` }),
                { status: 429, headers: { "Content-Type": "application/json" } }
            );
        }

        // Reserve the cooldown slot BEFORE running the batch, so two
        // concurrent clicks can't both pass the check above. If the batch
        // fails hard below, the slot is released so the user isn't locked
        // out.
        await prisma.followAllClick.create({
            data: {
                userId: user.id,
                starterPackId: pack.id,
            },
        });

        try {
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
            const packAccounts: Array<{
                linkedProfile: {
                    id: string;
                    instanceDomain: string;
                    externalAccountId: string;
                    username: string;
                    acct: string;
                };
            }> = packLinks
                .map((pl) => (pl.linkedProfileId ? profileMap.get(pl.linkedProfileId) : undefined))
                .filter(Boolean)
                .map((profile) => ({ linkedProfile: profile! }));

            // Also include handle-based accounts (added via @user@domain
            // search or CSV import). They have no LinkedProfile row, so the
            // handle is resolved through lookup at follow time instead.
            const handleLinks = await prisma.starterPackAccount.findMany({
                where: { starterPackId: pack.id, linkedProfileId: null, handle: { not: null } },
                select: { handle: true },
            });
            const callerHandle = canonicalHandle(
                buildHandle(linkedProfile.username, linkedProfile.instanceDomain),
            );
            for (const { handle } of handleLinks) {
                if (!handle) continue;
                if (canonicalHandle(handle) === callerHandle) continue; // don't follow yourself
                const parsed = parseHandle(handle);
                if (!parsed) continue;
                const { username, domain } = parsed;
                packAccounts.push({
                    linkedProfile: {
                        id: handle,
                        instanceDomain: domain,
                        externalAccountId: "", // forces the lookup path
                        username,
                        acct: handle,
                    },
                });
            }

            // Fetch the set of accounts the user already follows on their
            // home instance (paginated past the first 200, which is
            // incomplete for heavy users), so we only follow accounts they
            // don't already follow.
            const client = createMegalodonClient(
                linkedProfile.platform as PlatformKey,
                linkedProfile.instanceDomain,
                linkedProfile.accessToken,
            );
            const alreadyFollowing = new Set<string>();
            try {
                const creds = await client.verifyAccountCredentials();
                for (const handle of await fetchFollowingHandles(
                    client,
                    creds.data.id,
                    linkedProfile.instanceDomain,
                )) {
                    alreadyFollowing.add(handle);
                }
            } catch (err) {
                // If we can't read the following list, fall back to an empty
                // set rather than failing the whole request.
                console.error("Failed to fetch following list:", err);
            }

            // Execute the batch follow (max FOLLOW_BATCH_SIZE, paced, deduped).
            const result = await followNextBatch(linkedProfile, packAccounts, alreadyFollowing);

            return new Response(
                JSON.stringify({
                    ...result,
                    batchSize: FOLLOW_BATCH_SIZE,
                    backgroundStarted: false,
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        } catch (error) {
            // Release the cooldown slot so a hard failure doesn't lock the
            // user out for the full cooldown window.
            await prisma.followAllClick.deleteMany({ where: { userId: user.id } });
            console.error("Error following accounts in starter pack:", error);
            return new Response(
                JSON.stringify({ error: "Internal server error" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }
    } catch (error) {
        console.error("Error following accounts in starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

/**
 * GET /api/packs/:slug/follow?format=csv
 *
 * Download the pack's full account list as a Mastodon-takeout-style CSV,
 * so users can import it on their own server instead of following here.
 * Public for approved packs (the share page links it).
 */
export const GET: APIRoute = async ({ url, locals }) => {
    try {
        const slug = url.pathname.split("/").slice(-2)[0];
        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Slug is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const pack = await prisma.starterPack.findFirst({
            where: { slug, deletedAt: null },
            include: {
                accounts: {
                    include: {
                        linkedProfile: { select: { acct: true, instanceDomain: true } },
                    },
                },
            },
        });

        if (!pack) {
            return new Response(
                JSON.stringify({ error: "Starter pack not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Only approved packs are downloadable publicly; drafts/pending/
        // rejected are visible to owner and admins only.
        if (pack.status !== "approved") {
            const viewer = locals?.user ?? null;
            const isOwner = viewer ? viewer.id === pack.createdById : false;
            if (!isOwner && !(viewer && isAdmin(viewer))) {
                return new Response(
                    JSON.stringify({ error: "Starter pack not found" }),
                    { status: 404, headers: { "Content-Type": "application/json" } }
                );
            }
        }

        const rows = pack.accounts.map((spa) => {
            const acct = spa.linkedProfile?.acct;
            const domain = spa.linkedProfile?.instanceDomain;
            if (acct && domain) return `${acct}@${domain}`;
            if (spa.handle) return spa.handle.replace(/^@/, "");
            return "";
        }).filter(Boolean);

        const csv = ["Account address", ...rows].join("\n");

        return new Response(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${pack.slug}.csv"`,
            },
        });
    } catch (error) {
        console.error("Error exporting starter pack accounts:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
