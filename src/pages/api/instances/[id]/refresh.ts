export const prerender = false;

import type { APIRoute } from "astro";
import { InstanceFetcher } from "../../../../lib/fedi-data";
import { downloadAndCacheImage } from "../../../../lib/image-cache";
import { prisma } from "../../../../lib/prisma";
import crypto from "crypto";

export const POST: APIRoute = async ({ url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const pathSegments = url.pathname.split("/");
    const instanceId = pathSegments[pathSegments.length - 2];

    if (!instanceId) {
        return new Response(
            JSON.stringify({ error: "Instance ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const existingInstance = await prisma.instance.findUnique({
            where: { id: instanceId }
        });

        if (!existingInstance) {
            return new Response(
                JSON.stringify({ error: "Instance not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (existingInstance.addedByUserId !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only refresh instances you added" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const freshData = await InstanceFetcher.checkAvailable(existingInstance.domain, existingInstance.instanceType);

        if (!freshData) {
            return new Response(
                JSON.stringify({ error: "Could not fetch fresh data from the instance. Make sure it is online." }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        let newThumbnailPath = existingInstance.thumbnailPath;
        let thumbnailUpdated = false;

        if (freshData.thumbnail && freshData.thumbnail !== existingInstance.thumbnail) {
            const filename = `${existingInstance.domain}-${Date.now()}-${crypto.randomUUID()}`;
            const cachedPath = await downloadAndCacheImage(freshData.thumbnail, filename);
            if (cachedPath) {
                newThumbnailPath = cachedPath;
                thumbnailUpdated = true;
            }
        }

        const updatedInstance = await prisma.instance.update({
            where: { id: instanceId },
            data: {
                userCount: freshData.user_count || existingInstance.userCount,
                registrations: freshData.registrations,
                approvalRequired: freshData.approval_required,
                thumbnail: freshData.thumbnail || existingInstance.thumbnail,
                thumbnailPath: newThumbnailPath,
            }
        });

        return new Response(
            JSON.stringify({
                success: true,
                instance: updatedInstance,
                thumbnailUpdated,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error refreshing instance:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
