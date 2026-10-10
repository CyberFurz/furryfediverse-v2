export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { requireUser, validatePackTextField } from "../../../lib/api-helpers";

export const GET: APIRoute = async ({ url, locals }) => {
    try {
        const session = locals.session;
        const user = locals.user;

        const tab = url.searchParams.get("tab") || "community";
        const q = url.searchParams.get("q") || "";
        const orderBy = url.searchParams.get("order_by") || "latest";
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = 30;
        const skip = (page - 1) * limit;

        // Revisions (pending edits of a live pack) are never listed on their
        // own; owners reach them through the live pack.
        const where: any = { deletedAt: null, revisionOfId: null };

        if (tab === "community") {
            where.status = "approved";
            where.publishedAt = { not: null };
        } else if (tab === "your") {
            if (!session || !user) {
                return new Response(
                    JSON.stringify({ error: "Authentication required" }),
                    { status: 401, headers: { "Content-Type": "application/json" } }
                );
            }
            where.createdById = user.id;
        } else if (tab === "containing") {
            const username = url.searchParams.get("username");
            let linkedProfileIds: string[] = [];

            if (session && user) {
                const profiles = await prisma.linkedProfile.findMany({
                    where: { userId: user.id, isActive: true },
                    select: { id: true },
                });
                linkedProfileIds = profiles.map((p) => p.id);
            } else if (username) {
                const profile = await prisma.linkedProfile.findFirst({
                    where: { acct: { contains: username, mode: "insensitive" }, isActive: true },
                    select: { id: true },
                });
                if (profile) {
                    linkedProfileIds = [profile.id];
                }
            }

            if (linkedProfileIds.length === 0) {
                return new Response(
                    JSON.stringify({ packs: [], pagination: { page, limit, totalCount: 0, totalPages: 0 } }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }

            where.accounts = {
                some: {
                    linkedProfileId: { in: linkedProfileIds },
                },
            };

            // Only approved, published packs may be discovered via
            // "containing" — same gate as the community tab, so draft /
            // pending / rejected packs can't be enumerated this way even
            // if the viewer's profile is in them. Owners see their own
            // packs via tab=your instead.
            where.status = "approved";
            where.publishedAt = { not: null };
        }

        if (q) {
            where.OR = [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { createdBy: { name: { contains: q, mode: "insensitive" } } },
            ];
        }

        let orderByObj: any;
        switch (orderBy) {
            case "oldest":
                orderByObj = { createdAt: "asc" };
                break;
            default:
                orderByObj = { createdAt: "desc" };
        }

        const [packs, totalCount] = await Promise.all([
            prisma.starterPack.findMany({
                where,
                orderBy: orderByObj,
                skip,
                take: limit,
                include: {
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { accounts: true } },
                },
            }),
            prisma.starterPack.count({ where }),
        ]);

        return new Response(
            JSON.stringify({
                packs,
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
        console.error("Error fetching starter packs:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    const { user, error: authError } = requireUser(locals);
    if (authError || !user) return authError!;

    try {
        const body = await request.json();
        const { title, description } = body;

        // Validate both fields with the same rules as PUT; per-field errors
        // are clearer than a combined "required" message.
        const titleRes = validatePackTextField(title, "Title", 120);
        if (!titleRes.ok) {
            return new Response(
                JSON.stringify({ error: titleRes.error }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }
        const descRes = validatePackTextField(description, "Description", 2000);
        if (!descRes.ok) {
            return new Response(
                JSON.stringify({ error: descRes.error }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const pack = await prisma.starterPack.create({
            data: {
                title: titleRes.value,
                description: descRes.value,
                slug: "", // will update after we know the id
                createdById: user.id,
            },
        });

        const slug = Buffer.from(pack.id).toString("base64url");

        const updatedPack = await prisma.starterPack.update({
            where: { id: pack.id },
            data: { slug },
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { accounts: true } },
            },
        });

        return new Response(
            JSON.stringify(updatedPack),
            { status: 201, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error creating starter pack:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
