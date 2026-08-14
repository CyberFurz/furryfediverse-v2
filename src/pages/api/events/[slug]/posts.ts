export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";

export const GET: APIRoute = async ({ url, locals }) => {
    try {
        const pathSegments = url.pathname.split("/");
        const slug = pathSegments[pathSegments.length - 2];

        const event = await prisma.event.findFirst({ where: { slug } });
        if (!event) {
            return new Response(
                JSON.stringify({ error: "Event not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = 100;
        const skip = (page - 1) * limit;
        const accountFilter = url.searchParams.get("account");
        const dateFilter = url.searchParams.get("date");
        let order = url.searchParams.get("order") || "";

        const where: any = { eventId: event.id };
        if (accountFilter) {
            where.accountId = accountFilter;
        }
        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            where.createdAt = {
                gte: filterDate,
                lt: new Date(filterDate.getTime() + 24 * 60 * 60 * 1000),
            };
        }

        if (!["-favouritesCount", "-reblogsCount", "-repliesCount", "-createdAt"].includes(order)) {
            const now = new Date();
            const startDate = event.startDate ? new Date(event.startDate) : null;
            const endDate = event.endDate ? new Date(event.endDate) : null;
            if (startDate && endDate && startDate <= now && endDate >= now) {
                order = "-createdAt";
            } else {
                order = "-favouritesCount";
            }
        }

        const orderByObj: any = {};
        const orderField = order.startsWith("-") ? order.slice(1) : order;
        orderByObj[orderField] = "desc";

        const [posts, totalCount] = await Promise.all([
            prisma.eventPost.findMany({
                where,
                orderBy: orderByObj,
                skip,
                take: limit,
            }),
            prisma.eventPost.count({ where }),
        ]);

        return new Response(
            JSON.stringify({
                posts,
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
        console.error("Error fetching event posts:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
