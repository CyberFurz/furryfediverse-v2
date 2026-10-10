import type { APIRoute } from "astro";
import fs from "node:fs/promises";
import path from "node:path";
import { SPLASH_DIR } from "@/lib/packs/splash-image";

export const prerender = false;

/** Serves generated/uploaded splash images from the persistent storage volume. */
export const GET: APIRoute = async ({ params }) => {
	const file = params.file ?? "";
	// Only allow simple `{slug}.png` names; blocks path traversal.
	if (!/^[A-Za-z0-9._-]+\.png$/.test(file) || file.includes("..")) {
		return new Response("Not found", { status: 404 });
	}

	try {
		const data = await fs.readFile(path.join(SPLASH_DIR, file));
		return new Response(new Uint8Array(data), {
			headers: {
				"Content-Type": "image/png",
				"Cache-Control": "public, max-age=300, must-revalidate",
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
};
