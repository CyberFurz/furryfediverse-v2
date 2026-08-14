export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import { requireUser } from "../../../lib/api-helpers";

export const GET: APIRoute = async ({ url, locals }) => {
    try {
        const session = locals.session;
        const user = locals.user;

        const tab = url.searchParams.get("tab") || "community";
        const q = url.searchParams.get("q") || "";
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = 30;
        const skip = (page - 1) * limit;

        const where: any = {};

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
        }

        if (q) {
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { location: { contains: q, mode: "insensitive" } },
                { tags: { contains: q, mode: "insensitive" } },
            ];
        }

        const [events, totalCount] = await Promise.all([
            prisma.event.findMany({
                where,
                orderBy: { startDate: "asc" },
                skip,
                take: limit,
                include: {
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { eventPosts: true, eventAccounts: true } },
                },
            }),
            prisma.event.count({ where }),
        ]);

        return new Response(
            JSON.stringify({
                events,
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
        console.error("Error fetching events:", error);
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
        const { name, location, startDate, endDate, website, mastodon, description, tags, days, dayStyles, instances, tagBlacklist, numberMatch } = body;

        if (!name) {
            return new Response(
                JSON.stringify({ error: "Name is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
            return new Response(
                JSON.stringify({ error: "End date must be on or after start date" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const event = await prisma.event.create({
            data: {
                name,
                description: description || "",
                location: location || "",
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                website: website || "",
                mastodon: mastodon || "",
                tags: tags || "",
                days: days || "",
                dayStyles: dayStyles || "",
                instances: instances || "",
                tagBlacklist: tagBlacklist || "",
                numberMatch: numberMatch || false,
                slug: "", // will update after we know the id
                createdById: user.id,
            },
        });

        const slug = Buffer.from(event.id).toString("base64url");

        const updatedEvent = await prisma.event.update({
            where: { id: event.id },
            data: { slug },
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { eventPosts: true, eventAccounts: true } },
            },
        });

        return new Response(
            JSON.stringify(updatedEvent),
            { status: 201, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error creating event:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
