export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-helpers";
import { notifyAdminsPackPending } from "@/lib/admin-notify";
import { discardRevision, findRevision } from "@/lib/packs/revisions";

function json(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Load the live pack (by its public slug) and its pending revision for the owner. */
async function loadForOwner(slug: string | undefined, userId: string) {
	if (!slug) return { error: json({ error: "Slug is required" }, 400) };
	const pack = await prisma.starterPack.findFirst({
		where: { slug, deletedAt: null, revisionOfId: null },
		include: { createdBy: { select: { name: true } } },
	});
	if (!pack) return { error: json({ error: "Starter pack not found" }, 404) };
	if (pack.createdById !== userId) {
		return { error: json({ error: "You can only manage your own starter packs" }, 403) };
	}
	const revision = await findRevision(pack.id);
	if (!revision) return { error: json({ error: "This pack has no pending changes" }, 404) };
	return { pack, revision };
}

/**
 * POST /api/packs/:slug/revision
 * Submit the pending changes to a live pack for admin review. The live pack
 * stays published while the changes are reviewed.
 */
export const POST: APIRoute = async ({ params, locals }) => {
	const { user, error: authError } = requireUser(locals);
	if (authError || !user) return authError!;

	try {
		const loaded = await loadForOwner(params.slug, user.id);
		if (loaded.error) return loaded.error;
		const { pack, revision } = loaded;

		const accountCount = await prisma.starterPackAccount.count({ where: { starterPackId: revision.id } });
		if (accountCount === 0) {
			return json({ error: "A pack needs at least one account" }, 400);
		}

		const wasPending = revision.status === "pending";
		const updated = await prisma.starterPack.update({
			where: { id: revision.id },
			data: { status: "pending", submittedAt: new Date() },
		});

		if (!wasPending) {
			void notifyAdminsPackPending({
				name: `${updated.title} (update to "${pack.title}")`,
				slug: pack.slug,
				submitterName: pack.createdBy?.name,
				resubmission: revision.status === "rejected",
			});
		}

		return json({ status: updated.status, submitted_at: updated.submittedAt?.toISOString() ?? null }, 200);
	} catch (error) {
		console.error("Error submitting pack revision:", error);
		return json({ error: "Internal server error" }, 500);
	}
};

/**
 * DELETE /api/packs/:slug/revision
 * Discard the pending changes; the live pack is untouched.
 */
export const DELETE: APIRoute = async ({ params, locals }) => {
	const { user, error: authError } = requireUser(locals);
	if (authError || !user) return authError!;

	try {
		const loaded = await loadForOwner(params.slug, user.id);
		if (loaded.error) return loaded.error;
		await discardRevision(loaded.revision);
		return json({ success: true }, 200);
	} catch (error) {
		console.error("Error discarding pack revision:", error);
		return json({ error: "Internal server error" }, 500);
	}
};
