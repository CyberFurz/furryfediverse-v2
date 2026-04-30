export const prerender = false;

import type { APIRoute } from "astro";
import { InstanceFetcher } from "../../../lib/fedi-data";
import { downloadAndCacheImage } from "../../../lib/image-cache";
import { prisma } from "../../../lib/prisma";
import crypto from "crypto";

export const GET: APIRoute = async () => {
    try {
        const instances = await prisma.instance.findMany({
            select: {
                id: true,
                domain: true,
                instanceType: true,
                thumbnail: true,
                thumbnailPath: true,
            }
        });

        if (instances.length === 0) {
            return new Response(
                JSON.stringify({ success: true, updated: 0, failed: 0, results: [] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        const results: Array<{
            id: string;
            domain: string;
            success: boolean;
            error?: string;
            thumbnailUpdated?: boolean;
        }> = [];

        const concurrencyLimit = 5;

        for (let i = 0; i < instances.length; i += concurrencyLimit) {
            const batch = instances.slice(i, i + concurrencyLimit);

            const batchResults = await Promise.all(batch.map(async (instance) => {
                try {
                    const freshData = await InstanceFetcher.checkAvailable(instance.domain, instance.instanceType);

                    if (!freshData) {
                        return {
                            id: instance.id,
                            domain: instance.domain,
                            success: false,
                            error: "Could not fetch data from instance",
                        };
                    }

                    let newThumbnailPath = instance.thumbnailPath;
                    let thumbnailUpdated = false;

                    if (freshData.thumbnail) {
                        const needsCaching = !instance.thumbnailPath || freshData.thumbnail !== instance.thumbnail;
                        if (needsCaching) {
                            const filename = `${instance.domain}-${Date.now()}-${crypto.randomUUID()}`;
                            const cachedPath = await downloadAndCacheImage(freshData.thumbnail, filename);
                            if (cachedPath) {
                                newThumbnailPath = cachedPath;
                                thumbnailUpdated = true;
                            }
                        }
                    }

                    await prisma.instance.update({
                        where: { id: instance.id },
                        data: {
                            userCount: freshData.user_count || 0,
                            registrations: freshData.registrations,
                            approvalRequired: freshData.approval_required,
                            thumbnail: freshData.thumbnail || instance.thumbnail,
                            thumbnailPath: newThumbnailPath,
                        }
                    });

                    return {
                        id: instance.id,
                        domain: instance.domain,
                        success: true,
                        thumbnailUpdated,
                    };
                } catch (error) {
                    console.error(`Error refreshing instance ${instance.domain}:`, error);
                    return {
                        id: instance.id,
                        domain: instance.domain,
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    };
                }
            }));

            results.push(...batchResults);

            if (i + concurrencyLimit < instances.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const updated = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const thumbnailsUpdated = results.filter(r => r.thumbnailUpdated).length;

        return new Response(
            JSON.stringify({
                success: true,
                total: instances.length,
                updated,
                failed,
                thumbnailsUpdated,
                results,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error in batch refresh:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
