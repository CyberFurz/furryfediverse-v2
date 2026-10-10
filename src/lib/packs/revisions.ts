/**
 * Starter pack revisions.
 *
 * A pack that is live (approved + published) is never edited in place.
 * Instead, the first edit clones it into a "revision" pack
 * (`revisionOfId` = live pack id, status "draft"). Further edits go to that
 * revision, so owners can make several changes without unpublishing the live
 * pack. The owner submits the revision for review; when an admin approves it,
 * its content is merged into the live pack (same id/slug/URL, follow stats
 * kept) and the revision row is deleted.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { StarterPack } from "../../../generated/prisma/client";

const SPLASH_DIR = path.resolve(process.cwd(), "public", "splash");

/** A live pack is publicly visible; edits to it must go through a revision. */
export function isLivePack(pack: Pick<StarterPack, "status" | "publishedAt">): boolean {
	return pack.status === "approved" && !!pack.publishedAt;
}

/** The pending revision of a pack, if any. */
export async function findRevision(packId: string): Promise<StarterPack | null> {
	return prisma.starterPack.findFirst({
		where: { revisionOfId: packId, deletedAt: null },
	});
}

/**
 * What the owner should see on management pages: the revision when one
 * exists, otherwise the pack itself.
 */
export async function getOwnerView(pack: StarterPack): Promise<StarterPack> {
	if (pack.revisionOfId) return pack;
	return (await findRevision(pack.id)) ?? pack;
}

async function copySplashFile(fromSlug: string, toSlug: string): Promise<boolean> {
	try {
		await fs.mkdir(SPLASH_DIR, { recursive: true });
		await fs.copyFile(path.join(SPLASH_DIR, `${fromSlug}.png`), path.join(SPLASH_DIR, `${toSlug}.png`));
		return true;
	} catch {
		return false;
	}
}

async function removeSplashFile(slug: string): Promise<void> {
	await fs.rm(path.join(SPLASH_DIR, `${slug}.png`), { force: true }).catch(() => {});
}

/**
 * Resolve the pack that an owner edit should be written to. For a live pack
 * this returns its revision, creating it (a full copy of the live content)
 * on first use. Non-live packs are edited directly.
 */
export async function getEditablePack(pack: StarterPack): Promise<StarterPack> {
	if (pack.revisionOfId) return pack;

	// An existing revision keeps receiving edits even if the live pack was
	// unpublished in the meantime, so the owner never sees two diverging copies.
	const existing = await findRevision(pack.id);
	if (existing) return existing;
	if (!isLivePack(pack)) return pack;

	const revSlug = `${pack.slug}-rev-${crypto.randomBytes(4).toString("hex")}`;
	const hasSplash = pack.splashImage ? await copySplashFile(pack.slug, revSlug) : false;

	try {
		return await prisma.$transaction(async (tx) => {
			const revision = await tx.starterPack.create({
				data: {
					title: pack.title,
					slug: revSlug,
					description: pack.description,
					createdById: pack.createdById,
					status: "draft",
					revisionOfId: pack.id,
					numAccounts: pack.numAccounts,
					splashImage: hasSplash ? `splash/${revSlug}.png` : "",
					splashImageSignature: hasSplash ? pack.splashImageSignature : "",
					splashImageUpdatedAt: hasSplash ? new Date() : null,
					splashImageCustom: hasSplash && pack.splashImageCustom,
					splashImageNeedsUpdate: !hasSplash,
				},
			});

			const accounts = await tx.starterPackAccount.findMany({ where: { starterPackId: pack.id } });
			if (accounts.length > 0) {
				await tx.starterPackAccount.createMany({
					data: accounts.map((a) => ({
						starterPackId: revision.id,
						linkedProfileId: a.linkedProfileId,
						handle: a.handle,
						displayName: a.displayName,
						avatarUrl: a.avatarUrl,
						profileUrl: a.profileUrl,
						createdById: a.createdById,
						createdAt: a.createdAt,
					})),
				});
			}
			return revision;
		});
	} catch (err) {
		// Lost a race with a concurrent request creating the same revision
		// (revisionOfId is unique): use the winner's.
		if (hasSplash) await removeSplashFile(revSlug);
		const winner = await findRevision(pack.id);
		if (winner) return winner;
		throw err;
	}
}

/**
 * Merge an approved revision into its live pack and delete the revision.
 * Returns the updated live pack.
 */
export async function applyRevision(revision: StarterPack): Promise<StarterPack> {
	if (!revision.revisionOfId) throw new Error("Not a revision");
	const live = await prisma.starterPack.findUnique({ where: { id: revision.revisionOfId } });
	if (!live) throw new Error("Live pack not found");

	const hasSplash = revision.splashImage ? await copySplashFile(revision.slug, live.slug) : false;

	const updated = await prisma.$transaction(async (tx) => {
		const accounts = await tx.starterPackAccount.findMany({ where: { starterPackId: revision.id } });
		await tx.starterPackAccount.deleteMany({ where: { starterPackId: live.id } });
		if (accounts.length > 0) {
			await tx.starterPackAccount.createMany({
				data: accounts.map((a) => ({
					starterPackId: live.id,
					linkedProfileId: a.linkedProfileId,
					handle: a.handle,
					displayName: a.displayName,
					avatarUrl: a.avatarUrl,
					profileUrl: a.profileUrl,
					createdById: a.createdById,
					createdAt: a.createdAt,
				})),
				skipDuplicates: true,
			});
		}

		// Deleting the revision cascades its account rows.
		await tx.starterPack.delete({ where: { id: revision.id } });

		return tx.starterPack.update({
			where: { id: live.id },
			data: {
				title: revision.title,
				description: revision.description,
				numAccounts: accounts.length,
				status: "approved",
				publishedAt: live.publishedAt ?? new Date(),
				deletedAt: null,
				...(hasSplash
					? {
						splashImage: `splash/${live.slug}.png`,
						splashImageSignature: revision.splashImageSignature,
						splashImageCustom: revision.splashImageCustom,
						splashImageNeedsUpdate: revision.splashImageNeedsUpdate,
						splashImageUpdatedAt: new Date(),
					}
					: { splashImageNeedsUpdate: true }),
			},
		});
	});

	await removeSplashFile(revision.slug);
	return updated;
}

/** Throw away a revision (owner discard, or admin delete). */
export async function discardRevision(revision: StarterPack): Promise<void> {
	if (!revision.revisionOfId) throw new Error("Not a revision");
	await prisma.starterPack.delete({ where: { id: revision.id } });
	await removeSplashFile(revision.slug);
}

/** Latest admin rejection reason recorded for a pack's revision. */
export async function latestRevisionRejection(livePackId: string): Promise<string | null> {
	const log = await prisma.packAuditLog.findFirst({
		where: { packId: livePackId, action: "reject-revision" },
		orderBy: { createdAt: "desc" },
		select: { reason: true },
	});
	return log?.reason ?? null;
}
