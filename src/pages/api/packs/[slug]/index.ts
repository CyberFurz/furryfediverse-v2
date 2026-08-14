export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { requireUser, slugFrom } from "../../../../lib/api-helpers";

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
    } | null;
    handle: string | null;
}

interface PackDetail {
    slug: string;
    title: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
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
            .map((spa) => spa.linkedProfile?.profileUrl)
            .filter((url): url is string => !!url),
    };
}

/** Build the JSON representation of a pack for the share page. */
function buildJsonBody(pack: PackDetail): object {
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
        numAccounts: pack._count?.accounts || 0,
        accounts: pack.accounts.map((spa) => {
            if (spa.linkedProfile) {
                return {
                    name: spa.linkedProfile.displayName || spa.linkedProfile.acct || "",
                    handle: spa.linkedProfile.acct ? `@${spa.linkedProfile.acct}` : "",
                    url: spa.linkedProfile.profileUrl || "",
                    avatar: spa.linkedProfile.avatarUrl || "",
                    followers_count: spa.linkedProfile.followersCount || 0,
                    bot: false,
                    discoverable: true,
                };
            }
            return {
                name: spa.handle || "",
                handle: spa.handle || "",
                url: "",
                avatar: "",
                followers_count: 0,
                bot: false,
                discoverable: false,
            };
        }),
    };
}

export const GET: APIRoute = async ({ url, request }) => {
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

        const format = getPreferredFormat(request);
        const baseUrl = `${SITE_URL}/api/packs/${pack.slug}`;

        if (format === "activitypub") {
            return new Response(JSON.stringify(buildActivityPubBody(pack, baseUrl)), {
                status: 200,
                headers: { "Content-Type": "application/activity+json" },
            });
        }

        return new Response(JSON.stringify(buildJsonBody(pack)), {
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

        const updated = await prisma.starterPack.update({
            where: { id: existing.id },
            data: {
                ...(title !== undefined ? { title } : {}),
                ...(description !== undefined ? { description } : {}),
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
