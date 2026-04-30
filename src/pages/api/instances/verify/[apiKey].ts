export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";

export const GET: APIRoute = async ({ url }) => {
    const pathSegments = url.pathname.split("/");
    const apiKey = pathSegments[pathSegments.length - 1];

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: "Verification key is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const keyRecord = await prisma.instanceApiKey.findUnique({
            where: { apiKey },
            include: { instance: true }
        });

        if (!keyRecord) {
            return new Response(
                JSON.stringify({ error: "Invalid verification key" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (keyRecord.used) {
            return new Response(
                JSON.stringify({ error: "This verification key has already been used" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (keyRecord.expiresAt < new Date()) {
            return new Response(
                JSON.stringify({ error: "This verification key has expired" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        await prisma.$transaction([
            prisma.instance.update({
                where: { id: keyRecord.instanceId },
                data: { verified: true }
            }),
            prisma.instanceApiKey.update({
                where: { id: keyRecord.id },
                data: { used: true }
            })
        ]);

        return new Response(
            JSON.stringify({
                success: true,
                message: `Instance "${keyRecord.instance.title}" has been verified successfully!`,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error verifying instance:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
