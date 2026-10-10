export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { requireUser } from "../../../../lib/api-helpers";
import {
	type SplashAccount,
	getSplashImageSignature,
	renderSplashImage,
	saveCustomSplashImage,
	CUSTOM_SPLASH_MAX_BYTES,
} from "../../../../lib/packs/splash-image";

/**
 * POST /api/packs/:slug/splash
 *
 * Regenerate the OG splash image for a starter pack.
 * Requires authentication and ownership.
 */
export const POST: APIRoute = async ({ url, locals }) => {
	const { user, error: authError } = requireUser(locals);
	if (authError || !user) return authError!;

	try {
		const pathSegments = url.pathname.split("/");
		const slug = pathSegments[pathSegments.length - 2];

		if (!slug) {
			return new Response(
				JSON.stringify({ error: "Slug is required" }),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		const pack = await prisma.starterPack.findFirst({
			where: { slug, deletedAt: null },
			include: {
				accounts: {
					include: {
						linkedProfile: {
							select: { avatarUrl: true, acct: true, displayName: true },
						},
					},
				},
			},
		});

		if (!pack) {
			return new Response(
				JSON.stringify({ error: "Starter pack not found" }),
				{ status: 404, headers: { "Content-Type": "application/json" } },
			);
		}

		if (pack.createdById !== user.id) {
			return new Response(
				JSON.stringify({ error: "You can only manage your own starter packs" }),
				{ status: 403, headers: { "Content-Type": "application/json" } },
			);
		}

		// Separate accounts into crawled (have linked profile data) and uncrawled (handle only)
		const crawledAccounts: SplashAccount[] = [];
		const uncrawledHandles: string[] = [];

		for (const a of pack.accounts) {
			if (a.linkedProfile) {
				crawledAccounts.push({
					displayName: a.linkedProfile.displayName ?? a.linkedProfile.acct,
					handle: a.linkedProfile.acct,
					avatarUrl: a.linkedProfile.avatarUrl,
				});
			} else if (a.handle) {
				uncrawledHandles.push(a.handle);
			}
		}

		const newSignature = getSplashImageSignature(
			{ title: pack.title },
			crawledAccounts,
			uncrawledHandles,
		);

		if (
			newSignature === pack.splashImageSignature &&
			!pack.splashImageNeedsUpdate &&
			!pack.splashImageCustom
		) {
			return new Response(
				JSON.stringify({
					message: "Splash image is up to date",
					slug,
					signature: newSignature,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		await renderSplashImage(
			{ title: pack.title, slug: pack.slug },
			crawledAccounts,
			uncrawledHandles,
		);

		// Persist render metadata
		await prisma.starterPack.update({
			where: { id: pack.id },
			data: {
				splashImage: `splash/${pack.slug}.png`,
				splashImageSignature: newSignature,
				splashImageUpdatedAt: new Date(),
				splashImageNeedsUpdate: false,
				splashImageCustom: false,
			},
		});

		return new Response(
			JSON.stringify({
				message: "Splash image regenerated",
				slug,
				signature: newSignature,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	} catch (error) {
		console.error("Error regenerating splash image:", error);
		return new Response(
			JSON.stringify({ error: "Failed to regenerate splash image" }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
};

const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function json(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * PUT /api/packs/:slug/splash
 *
 * Upload a custom splash image (multipart field "image"). The image is
 * cropped to 1200×630 and replaces the generated one. Auto-regeneration
 * (e.g. after imports) is suppressed until the owner regenerates via POST.
 */
export const PUT: APIRoute = async ({ params, request, locals }) => {
	const { user, error: authError } = requireUser(locals);
	if (authError || !user) return authError!;

	try {
		const { slug } = params;
		if (!slug) return json({ error: "Slug is required" }, 400);

		const pack = await prisma.starterPack.findFirst({
			where: { slug, deletedAt: null },
			select: { id: true, slug: true, createdById: true },
		});
		if (!pack) return json({ error: "Starter pack not found" }, 404);
		if (pack.createdById !== user.id) {
			return json({ error: "You can only manage your own starter packs" }, 403);
		}

		const formData = await request.formData();
		const file = formData.get("image");
		if (!file || !(file instanceof File)) {
			return json({ error: "Image file is required" }, 400);
		}
		if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
			return json({ error: "Image must be PNG, JPEG, WebP, or GIF" }, 400);
		}
		if (file.size > CUSTOM_SPLASH_MAX_BYTES) {
			return json({ error: "Image must be 5 MB or smaller" }, 400);
		}

		try {
			await saveCustomSplashImage(pack.slug, Buffer.from(await file.arrayBuffer()));
		} catch {
			return json({ error: "Could not process image" }, 400);
		}

		const updated = await prisma.starterPack.update({
			where: { id: pack.id },
			data: {
				splashImage: `splash/${pack.slug}.png`,
				splashImageCustom: true,
				splashImageNeedsUpdate: false,
				splashImageUpdatedAt: new Date(),
			},
			select: { splashImage: true, splashImageUpdatedAt: true },
		});

		return json(
			{
				message: "Splash image uploaded",
				splash_image: `/${updated.splashImage}?v=${updated.splashImageUpdatedAt!.getTime()}`,
				splash_custom: true,
			},
			200,
		);
	} catch (error) {
		console.error("Error uploading splash image:", error);
		return json({ error: "Failed to upload splash image" }, 500);
	}
};
