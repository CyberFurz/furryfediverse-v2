export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { matchCategory } from "../../../../lib/events/constants";
import { requireUser, slugFrom } from "../../../../lib/api-helpers";

/** Fetch an event with the relations the detail view needs. */
async function getEvent(slug: string) {
    return prisma.event.findFirst({
        where: { slug },
        include: {
            createdBy: { select: { id: true, name: true } },
            _count: { select: { eventPosts: true, eventAccounts: true } },
            eventLookups: true,
        },
    });
}

/** Build the day pills for the event date range, with per-day post counts. */
async function buildDayBreakdown(event: { id: string; startDate: Date | null; endDate: Date | null; days: string; dayStyles: string }) {
    if (!event.startDate || !event.endDate) {
        return { days: [], startDate: null, endDate: null };
    }

    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    const diff = endDate.getTime() - startDate.getTime();
    const dayCount = diff >= 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1 : 0;
    if (dayCount === 0) {
        return { days: [], startDate, endDate };
    }

    const dayNames = event.days ? event.days.split(",").map((d: string) => d.trim()).filter(Boolean) : [];
    const dayStyleList = event.dayStyles ? event.dayStyles.split(",").map((s: string) => s.trim()).filter(Boolean) : [];

    const postCounts = await prisma.eventPost.groupBy({
        by: ["createdAt"],
        where: {
            eventId: event.id,
            visibility: "public",
            createdAt: {
                gte: startDate,
                lt: new Date(endDate.getTime() + 24 * 60 * 60 * 1000),
            },
        },
        _count: { id: true },
    });
    const countsByDay: Record<string, number> = {};
    for (const pc of postCounts) {
        if (pc.createdAt) {
            const dayKey = pc.createdAt.toISOString().split("T")[0];
            countsByDay[dayKey] = (countsByDay[dayKey] || 0) + pc._count.id;
        }
    }

    const days = Array.from({ length: dayCount }, (_, i) => {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split("T")[0];
        return {
            value: dateStr,
            preDisplay: `Day ${i + 1}${dayNames[i] ? `: ${dayNames[i]}` : ""}`,
            display: dateStr,
            dayStyle: dayStyleList[i] || "purple",
            count: countsByDay[dateStr] || 0,
        };
    });
    return { days, startDate, endDate };
}

/** Build the post filter and sort from query params. */
function buildPostQuery(
    eventId: string,
    params: URLSearchParams,
    startDate: Date | null,
    endDate: Date | null,
): { where: any; orderBy: Record<string, string>; page: number; limit: number } {
    const accountFilter = params.get("account");
    const dateFilter = params.get("date");
    let order = params.get("order") || "";

    const where: any = { eventId };
    if (accountFilter) {
        where.accountId = accountFilter;
    }
    if (dateFilter === "all") {
        // "All Posts" (no date filter)
    } else if (!dateFilter && startDate && endDate) {
        // "All Days" (default): filter to event date range
        where.createdAt = {
            gte: startDate,
            lt: new Date(endDate.getTime() + 24 * 60 * 60 * 1000),
        };
    } else if (dateFilter) {
        // Specific day
        const filterDate = new Date(dateFilter);
        where.createdAt = {
            gte: filterDate,
            lt: new Date(filterDate.getTime() + 24 * 60 * 60 * 1000),
        };
    }

    if (!["-favouritesCount", "-reblogsCount", "-repliesCount", "-createdAt"].includes(order)) {
        const now = new Date();
        order = startDate && endDate && startDate <= now && endDate >= now ? "-createdAt" : "-favouritesCount";
    }

    const orderByObj: Record<string, string> = {};
    const orderField = order.startsWith("-") ? order.slice(1) : order;
    orderByObj[orderField] = "desc";

    const page = parseInt(params.get("page") || "1");
    const limit = 100;
    return { where, orderBy: orderByObj, page, limit };
}

export const GET: APIRoute = async ({ url }) => {
    try {
        const pathSegments = url.pathname.split("/");
        const slug = pathSegments[pathSegments.length - 1];

        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Slug is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const event = await getEvent(slug);
        if (!event) {
            return new Response(
                JSON.stringify({ error: "Event not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const { days, startDate, endDate } = await buildDayBreakdown(event);

        // Top 10 accounts (for filter pills) and all accounts (for name/avatar lookup)
        const [topAccounts, allAccounts] = await Promise.all([
            prisma.eventAccount.findMany({
                where: { eventId: event.id, count: { gt: 0 } },
                orderBy: { count: "desc" },
                take: 10,
            }),
            prisma.eventAccount.findMany({
                where: { eventId: event.id, count: { gt: 0 } },
                orderBy: { count: "desc" },
            }),
        ]);

        const { where: postWhere, orderBy: orderByObj, page, limit } = buildPostQuery(event.id, url.searchParams, startDate, endDate);
        const skip = (page - 1) * limit;

        const [posts, totalPosts, allEventPostsCount, instanceResult, pollLogs] = await Promise.all([
            prisma.eventPost.findMany({ where: postWhere, orderBy: orderByObj, skip, take: limit }),
            prisma.eventPost.count({ where: postWhere }),
            prisma.eventPost.count({ where: { eventId: event.id } }),
            prisma.eventPost.groupBy({
                by: ["sourceInstance"],
                where: { eventId: event.id, sourceInstance: { not: null } },
            }),
            prisma.eventPollLog.findMany({
                where: { eventId: event.id },
                orderBy: { startedAt: "desc" },
                take: 10,
            }),
        ]);

        return new Response(
            JSON.stringify({
                event: {
                    ...event,
                    category: event.eventLookups.length > 0 ? event.eventLookups[0].language : matchCategory(event.name, event.description),
                    numPosts: event._count?.eventPosts || 0,
                    numAccounts: event._count?.eventAccounts || 0,
                    numInstances: instanceResult.length,
                },
                days,
                topAccounts,
                allAccounts,
                posts,
                pagination: {
                    page,
                    limit,
                    totalCount: totalPosts,
                    totalPages: Math.ceil(totalPosts / limit),
                },
                allEventPostsCount,
                pollLogs,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error fetching event:", error);
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
        const existing = await prisma.event.findFirst({ where: { slug: slug! } });
        if (!existing) {
            return new Response(
                JSON.stringify({ error: "Event not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const isAdmin = (user.role || "user").split(",").includes("admin");
        if (existing.createdById !== user.id && !isAdmin) {
            return new Response(
                JSON.stringify({ error: "You can only edit your own events" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await request.json();
        const { name, location, startDate, endDate, website, mastodon, description, tags, days, dayStyles, instances, tagBlacklist, numberMatch } = body;

        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
            return new Response(
                JSON.stringify({ error: "End date must be on or after start date" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const updated = await prisma.event.update({
            where: { id: existing.id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(location !== undefined ? { location } : {}),
                ...(startDate !== undefined ? { startDate: new Date(startDate) } : {}),
                ...(endDate !== undefined ? { endDate: new Date(endDate) } : {}),
                ...(website !== undefined ? { website } : {}),
                ...(mastodon !== undefined ? { mastodon } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(tags !== undefined ? { tags } : {}),
                ...(days !== undefined ? { days } : {}),
                ...(dayStyles !== undefined ? { dayStyles } : {}),
                ...(instances !== undefined ? { instances } : {}),
                ...(tagBlacklist !== undefined ? { tagBlacklist } : {}),
                ...(numberMatch !== undefined ? { numberMatch } : {}),
            },
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { eventPosts: true, eventAccounts: true } },
            },
        });


        return new Response(
            JSON.stringify(updated),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error updating event:", error);
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
        const existing = await prisma.event.findFirst({ where: { slug: slug! } });
        if (!existing) {
            return new Response(
                JSON.stringify({ error: "Event not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const isAdmin = (user.role || "user").split(",").includes("admin");
        if (existing.createdById !== user.id && !isAdmin) {
            return new Response(
                JSON.stringify({ error: "You can only delete your own events" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        // Soft delete by setting deletedAt (model already has this field)
        await prisma.event.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() },
        });

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error deleting event:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
