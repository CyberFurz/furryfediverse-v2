export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";

export const GET: APIRoute = async ({ url, locals }) => {
    const searchParams = url.searchParams;
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const registrations = searchParams.get("registrations");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    try {
        const where: any = { verified: true };

        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { domain: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
            ];
        }

        if (type && type !== "all") {
            where.instanceType = type;
        }

        if (registrations === "open") {
            where.registrations = true;
        }

        const [instances, totalCount] = await Promise.all([
            prisma.instance.findMany({
                where,
                orderBy: { userCount: "desc" },
                skip,
                take: limit,
            }),
            prisma.instance.count({ where }),
        ]);

        return new Response(
            JSON.stringify({
                instances,
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
        console.error("Error fetching instances:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
