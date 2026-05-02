export const prerender = false;

import type { APIRoute } from "astro";
import fs from "fs";
import path from "path";

const PROFILE_DIR = path.join(process.cwd(), "storage", "profiles");

export const GET: APIRoute = async ({ url }) => {
    const pathSegments = url.pathname.split("/");
    const filename = pathSegments[pathSegments.length - 1];

    if (!filename) {
        return new Response("Not found", { status: 404 });
    }

    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(PROFILE_DIR, sanitizedFilename);

    if (!fs.existsSync(filePath)) {
        return new Response("Not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new Response(fileBuffer, {
        status: 200,
        headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
    });
};
