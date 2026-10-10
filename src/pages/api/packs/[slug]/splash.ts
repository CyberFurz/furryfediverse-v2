export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { requireUser } from "../../../../lib/api-helpers";
import {
	type SplashAccount,
	getSplashImageSignature,
	renderSplashImage,
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
			!pack.splashImageNeedsUpdate
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
