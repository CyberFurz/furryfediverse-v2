export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const IMAGE_DIR = path.join(process.cwd(), "storage", "article-images");

export const POST: APIRoute = async ({ request, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const formData = await request.formData();
        const file = formData.get("image") as File | null;

        if (!file) {
            return new Response(
                JSON.stringify({ error: "No image provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!file.type.startsWith("image/")) {
            return new Response(
                JSON.stringify({ error: "File must be an image" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            return new Response(
                JSON.stringify({ error: "Image must be less than 10MB" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!fs.existsSync(IMAGE_DIR)) {
            fs.mkdirSync(IMAGE_DIR, { recursive: true });
        }

        const ext = file.name.split(".").pop() || "jpg";
        const filename = `${crypto.randomUUID()}.${ext}`;
        const filePath = path.join(IMAGE_DIR, filename);

        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(filePath, buffer);

        return new Response(
            JSON.stringify({ url: `/api/learn/images/${filename}` }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error uploading image:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
