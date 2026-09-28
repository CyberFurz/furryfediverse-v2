export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../../lib/prisma";
import { requireUser } from "../../../../../lib/api-helpers";
import {
    lookupRemoteAccount,
    searchRemoteAccounts,
    type RemoteAccount,
} from "../../../../../lib/social/remote-accounts";
import { normalizeHandle, isValidHandle, MAX_HANDLE_LENGTH } from "../../../../../lib/social/handles";

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
                select: { id: true, handle: true, displayName: true, avatarUrl: true },
                orderBy: { createdAt: "asc" },
            }),
        ]);

        // Remote results for the query: an exact @user@instance lookup when
        // the query is a full handle, plus a partial-match search of the
        // caller's home instance otherwise. Returned separately so the UI
        // can offer to add them as handle-based accounts.
        const remoteAccounts: RemoteAccount[] = [];
        const exactRemote = await lookupRemoteAccount(q, user.id);
        if (exactRemote) remoteAccounts.push(exactRemote);
        else remoteAccounts.push(...(await searchRemoteAccounts(q, user.id)));

        const handleSet = new Set(handleAccounts.map((h) => h.handle));
        for (const ra of remoteAccounts) {
            ra.inStarterPack = handleSet.has(ra.handle);
        }

        // Annotate profiles with inStarterPack
        const existingAccountIds = await prisma.starterPackAccount.findMany({
            where: { starterPackId: pack.id, linkedProfileId: { not: null } },
            select: { linkedProfileId: true },
        });
        const existingSet = new Set(existingAccountIds.map((a) => a.linkedProfileId));

        const results = profiles.map((p) => ({
            id: p.id,
            // The UI toggles on linkedProfileId + avatar; keep the raw
            // fields too for any other consumers.
            linkedProfileId: p.id,
            platform: p.platform,
            instanceDomain: p.instanceDomain,
            username: p.username,
            acct: p.acct,
            handle: p.acct.includes("@") ? p.acct : `${p.acct}@${p.instanceDomain}`,
            displayName: p.displayName,
            avatar: p.avatarUrl,
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
                remoteAccounts,
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
        const { linkedProfileId, handle, displayName, avatarUrl, profileUrl } = body;

        if (!linkedProfileId && !handle) {
            return new Response(
                JSON.stringify({ error: "linkedProfileId or handle is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Normalize and validate a handle-based account. Accepts
        // "@user@domain" or "user@domain"; stored without the leading @.
        let normalizedHandle: string | null = null;
        if (handle !== undefined && handle !== null) {
            if (typeof handle !== "string") {
                return new Response(
                    JSON.stringify({ error: "Handle must be a string" }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
            normalizedHandle = normalizeHandle(handle);
            if (!isValidHandle(normalizedHandle)) {
                return new Response(
                    JSON.stringify({ error: "Handle must be in the form user@domain" }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
            if (normalizedHandle.length > MAX_HANDLE_LENGTH) {
                return new Response(
                    JSON.stringify({ error: "Handle is too long" }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
        }

        let inStarterPack: boolean;

        if (normalizedHandle) {
            // Toggle a handle-based account: create it when it's not in
            // the pack yet, remove it when it is. This is what lets users
            // add accounts that have no LinkedProfile on this site (e.g.
            // remote accounts found via @user@domain lookup).
            const existing = await prisma.starterPackAccount.findFirst({
                where: { starterPackId: pack.id, handle: normalizedHandle },
            });
            if (existing) {
                await prisma.starterPackAccount.delete({ where: { id: existing.id } });
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

                await prisma.starterPackAccount.create({
                    data: {
                        starterPackId: pack.id,
                        handle: normalizedHandle,
                        createdById: user.id,
                        // Optional display metadata captured from the remote
                        // search/lookup result at add time, so the published
                        // pack page can render name/avatar instead of a bare
                        // handle. Display-only; the handle is the resolution key.
                        displayName: typeof displayName === "string" ? displayName.trim().slice(0, 200) || null : null,
                        avatarUrl: typeof avatarUrl === "string" ? avatarUrl.trim().slice(0, 500) || null : null,
                        profileUrl: typeof profileUrl === "string" ? profileUrl.trim().slice(0, 500) || null : null,
                    },
                });
                inStarterPack = true;
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

        // Update numAccounts atomically (+/- 1) instead of count-then-write,
        // so concurrent toggles can't clobber the counter with a stale value.
        // Changing the account list of an approved pack must trigger
        // re-review, same as editing metadata.
        const updatedPack = await prisma.starterPack.update({
            where: { id: pack.id },
            data: {
                numAccounts: { increment: inStarterPack ? 1 : -1 },
                ...(pack.status === "approved" && pack.publishedAt
                    ? { status: "pending", publishedAt: null }
                    : {}),
            },
        });

        return new Response(
            JSON.stringify({ inStarterPack, numAccounts: updatedPack.numAccounts }),
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
