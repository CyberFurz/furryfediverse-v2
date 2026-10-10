export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { requireUser, slugFrom, isAdmin, validatePackTextField } from "../../../../lib/api-helpers";
import { createMegalodonClient, type PlatformKey } from "../../../../lib/social/providers";
import { fetchFollowingHandles } from "../../../../lib/social/following";
import { buildHandle, canonicalHandle } from "../../../../lib/social/handles";

const SITE_URL = process.env.SITE_URL || "https://furryfediverse.org";

type Format = "json" | "activitypub";

interface PackCreatorProfile {
    id: string;
    name: string;
    linkedProfiles: { profileUrl: string | null; acct: string | null }[] | null;
}

interface PackAccountRow {
    linkedProfile: {
        profileUrl: string | null;
        displayName: string | null;
        acct: string | null;
        avatarUrl: string | null;
        followersCount: number | null;
        instanceDomain: string | null;
    } | null;
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
}

interface PackDetail {
    slug: string;
    title: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    splashImage?: string | null;
    createdBy: PackCreatorProfile;
    accounts: PackAccountRow[];
    _count?: { accounts: number } | null;
}

/** Shared include for pack detail: creator profile, accounts, counts. */
const packDetailInclude = {
    createdBy: {
        select: {
            id: true,
            name: true,
            linkedProfiles: {
                where: { isPrimaryProfile: true },
                take: 1,
                select: { profileUrl: true, acct: true },
            },
        },
    },
    accounts: {
        include: {
            linkedProfile: {
                select: {
                    profileUrl: true,
                    displayName: true,
                    acct: true,
                    avatarUrl: true,
                    followersCount: true,
                    instanceDomain: true,
                },
            },
        },
    },
    _count: { select: { accounts: true } },
} as const;

function getPreferredFormat(request: Request): Format {
    const url = new URL(request.url);
    const formatParam = url.searchParams.get("format");

    if (formatParam === "activitypub") return "activitypub";
    if (formatParam === "json") return "json";

    const accept = request.headers.get("Accept") || "";

    if (accept.includes("application/activity+json")) {
        return "activitypub";
    }

    return "json";
}

function stripEmojiShortcodes(text: string): string {
    return text.replaceAll(/:[\w]+:/g, "").trim();
}

/** Build the ActivityPub Collection representation of a pack. */
function buildActivityPubBody(pack: PackDetail, baseUrl: string): object {
    const creatorProfileUrl =
        pack.createdBy.linkedProfiles?.[0]?.profileUrl ||
        `${SITE_URL}/user/${pack.createdBy.name}`;

    return {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Collection",
        id: baseUrl,
        name: stripEmojiShortcodes(pack.title),
        summary: pack.description,
        attributedTo: creatorProfileUrl,
        published: pack.createdAt.toISOString(),
        updated: pack.updatedAt.toISOString(),
        generator: {
            type: "Application",
            name: "Furry Fediverse",
            url: SITE_URL,
        },
        totalItems: pack._count?.accounts || pack.accounts.length,
        items: pack.accounts
            .map((spa) => spa.linkedProfile?.profileUrl || spa.profileUrl)
            .filter((url): url is string => !!url),
    };
}

/**
 * Canonical `username@domain` handle for a pack account row, used to match
 * against the viewer's following set. Linked profiles store acct possibly
 * without a domain; handle-based rows store the full handle.
 */
function accountFollowingHandle(spa: PackAccountRow): string | null {
    if (spa.linkedProfile) {
        const acct = spa.linkedProfile.acct;
        if (!acct) return null;
        return canonicalHandle(buildHandle(acct, spa.linkedProfile.instanceDomain));
    }
    return spa.handle ? canonicalHandle(spa.handle) : null;
}

/** Build the JSON representation of a pack for the share page. */
function buildJsonBody(
    pack: PackDetail,
    opts: { followingKnown: boolean; followingSet: Set<string> } = { followingKnown: false, followingSet: new Set() },
): object {
    const { followingKnown, followingSet } = opts;
    return {
        url: `${SITE_URL}/api/packs/${pack.slug}`,
        title: pack.title,
        description: pack.description,
        created_by: {
            id: pack.createdBy.id,
            name: pack.createdBy.name,
            profileUrl: pack.createdBy.linkedProfiles?.[0]?.profileUrl || null,
            acct: pack.createdBy.linkedProfiles?.[0]?.acct || null,
        },
        created_at: pack.createdAt.toISOString(),
        updated_at: pack.updatedAt.toISOString(),
        published_at: pack.publishedAt?.toISOString() || null,
        splash_image: pack.splashImage ? `/${pack.splashImage}` : null,
        numAccounts: pack._count?.accounts || 0,
        followingKnown,
        accounts: pack.accounts.map((spa) => {
            const following =
                followingKnown && (() => {
                    const handle = accountFollowingHandle(spa);
                    return handle ? followingSet.has(handle) : false;
                })();
            if (spa.linkedProfile) {
                return {
                    name: spa.linkedProfile.displayName || spa.linkedProfile.acct || "",
                    handle: spa.linkedProfile.acct ? `@${spa.linkedProfile.acct}` : "",
                    url: spa.linkedProfile.profileUrl || "",
                    avatar: spa.linkedProfile.avatarUrl || "",
                    followers_count: spa.linkedProfile.followersCount || 0,
                    bot: false,
                    discoverable: true,
                    following,
                };
            }
            return {
                name: spa.displayName || spa.handle || "",
                handle: spa.handle || "",
                url: spa.profileUrl || "",
                avatar: spa.avatarUrl || "",
                followers_count: 0,
                bot: false,
                discoverable: false,
                following,
            };
        }),
    };
}

export const GET: APIRoute = async ({ url, request, locals }) => {
    try {
        const pathSegments = url.pathname.split("/");
        const slug = pathSegments[pathSegments.length - 1];

        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Slug is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const pack = await prisma.starterPack.findFirst({
            where: { slug, deletedAt: null },
            include: packDetailInclude,
        });

        if (!pack) {
            return new Response(
                JSON.stringify({ error: "Starter pack not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Unreviewed packs (draft/pending/rejected) must not be publicly
        // viewable, even with a leaked slug. Only the owner or an admin
        // may see them before approval.
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

        const format = getPreferredFormat(request);
        const baseUrl = `${SITE_URL}/api/packs/${pack.slug}`;

        if (format === "activitypub") {
            return new Response(JSON.stringify(buildActivityPubBody(pack, baseUrl)), {
                status: 200,
                headers: { "Content-Type": "application/activity+json" },
            });
        }

        // For a logged-in viewer with a linked profile, annotate each
        // account with whether they already follow it. Skipped when the
        // caller passes ?following=0 (management pages don't need it) or
        // the viewer has no linked profile / the fetch fails.
        let followingKnown = false;
        let followingSet = new Set<string>();
        const wantFollowing = url.searchParams.get("following") !== "0";
        if (wantFollowing && locals?.user) {
            const viewerProfile = await prisma.linkedProfile.findFirst({
                where: { userId: locals.user.id, isActive: true },
                orderBy: { isPrimaryProfile: "desc" },
                select: { platform: true, instanceDomain: true, accessToken: true },
            });
            if (viewerProfile) {
                try {
                    const client = createMegalodonClient(
                        viewerProfile.platform as PlatformKey,
                        viewerProfile.instanceDomain,
                        viewerProfile.accessToken,
                    );
                    const creds = await client.verifyAccountCredentials();
                    followingSet = await fetchFollowingHandles(
                        client,
                        creds.data.id,
                        viewerProfile.instanceDomain,
                        2, // cap: fast page loads; the follow batch uses the full list
                    );
                    followingKnown = true;
                } catch (err) {
                    console.error("Failed to fetch viewer following for pack:", err);
                }
            }
        }

        return new Response(JSON.stringify(buildJsonBody(pack, { followingKnown, followingSet })), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error fetching starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const PUT: APIRoute = async ({ request, url, locals }) => {
    const { user, error: authError } = requireUser(locals);
    if (authError || !user) return authError!;

    try {
        const slug = slugFrom(url);
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
                JSON.stringify({ error: "You can only edit your own starter packs" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await request.json();
        const { title, description } = body;

        // Validate each provided field; trim and enforce the same length
        // caps as creation.
        const data: { title?: string; description?: string } = {};
        if (title !== undefined) {
            const res = validatePackTextField(title, "Title", 120);
            if (!res.ok) {
                return new Response(
                    JSON.stringify({ error: res.error }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
            data.title = res.value;
        }
        if (description !== undefined) {
            const res = validatePackTextField(description, "Description", 2000);
            if (!res.ok) {
                return new Response(
                    JSON.stringify({ error: res.error }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
            data.description = res.value;
        }
        if (Object.keys(data).length === 0) {
            return new Response(
                JSON.stringify({ error: "Nothing to update" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Editing an approved pack must trigger re-review: reset the
        // status to pending and unpublish, so the change can't slip out
        // under the previously-approved content.
        const wasApproved = existing.status === "approved" && existing.publishedAt;
        const updated = await prisma.starterPack.update({
            where: { id: existing.id },
            data: {
                ...data,
                ...(wasApproved
                    ? { status: "pending", publishedAt: null }
                    : {}),
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
        console.error("Error updating starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
    const { user, error: authError } = requireUser(locals);
    if (authError || !user) return authError!;

    try {
        const slug = slugFrom(url);
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
                JSON.stringify({ error: "You can only delete your own starter packs" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        await prisma.starterPack.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() },
        });

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error deleting starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
