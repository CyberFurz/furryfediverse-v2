/**
 * Starter pack opt-out for fediverse users who don't have an account here.
 *
 * Flow:
 *  1. Anyone submits a handle on /opt-out. We resolve it through the site's
 *     bot account (WebFinger) and send the account a direct message with a
 *     one-time confirmation link. No DM is sent to the requester.
 *  2. The account owner opens the link and presses "Confirm" (a POST, so
 *     link-preview fetchers can't confirm on their behalf).
 *  3. The handle is removed from every pack (live packs and pending
 *     revisions) and is blocked from being added again.
 */
import crypto from "node:crypto";
import generator from "megalodon";
import { prisma } from "@/lib/prisma";
import { buildHandle, canonicalHandle, isValidHandle, MAX_HANDLE_LENGTH, normalizeHandle, parseHandle } from "@/lib/social/handles";

const BOT_INSTANCE_URL = process.env.MASTODON_URL;
const BOT_ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const SITE_URL = process.env.SITE_URL || "https://furryfediverse.org";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Minimum gap between confirmation DMs to the same handle. */
const HANDLE_DM_COOLDOWN_MS = 10 * 60 * 1000;
/** Max confirmation DMs triggered from one IP per hour. */
const IP_HOURLY_LIMIT = 5;

export class OptOutError extends Error {
	constructor(message: string, public status = 400) {
		super(message);
	}
}

/** Canonical stored form: lowercase `user@domain`, no leading "@". Null if invalid. */
export function canonicalOptOutHandle(raw: string): string | null {
	if (typeof raw !== "string") return null;
	const h = canonicalHandle(normalizeHandle(raw));
	if (!isValidHandle(h) || h.length > MAX_HANDLE_LENGTH) return null;
	return h;
}

function hashToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

function hashIp(ip: string | null | undefined): string | null {
	if (!ip) return null;
	const salt = process.env.BETTER_AUTH_SECRET || "opt-out";
	return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Canonical handle for a pack account row (linked profile or handle-based). */
export function packAccountHandle(row: {
	handle?: string | null;
	linkedProfile?: { acct: string | null; instanceDomain: string | null } | null;
}): string | null {
	if (row.linkedProfile?.acct) {
		return canonicalOptOutHandle(buildHandle(row.linkedProfile.acct, row.linkedProfile.instanceDomain));
	}
	return row.handle ? canonicalOptOutHandle(row.handle) : null;
}

/** Which of the given handles have a confirmed opt-out. Input may be in any form. */
export async function getOptedOutHandles(handles: Array<string | null | undefined>): Promise<Set<string>> {
	const canon = [...new Set(handles.map((h) => (h ? canonicalOptOutHandle(h) : null)).filter((h): h is string => !!h))];
	if (canon.length === 0) return new Set();
	const rows = await prisma.packOptOut.findMany({
		where: { status: "confirmed", handle: { in: canon } },
		select: { handle: true },
	});
	return new Set(rows.map((r) => r.handle));
}

export async function isOptedOut(handle: string | null | undefined): Promise<boolean> {
	if (!handle) return false;
	return (await getOptedOutHandles([handle])).size > 0;
}

/** Confirm the account exists on the fediverse, via the bot's instance. Returns its canonical handle. */
async function resolveViaBot(handle: string): Promise<string | null> {
	if (!BOT_INSTANCE_URL || !BOT_ACCESS_TOKEN) {
		throw new OptOutError("Opt-out requests are temporarily unavailable. Please contact the site admins.", 503);
	}
	const botDomain = new URL(BOT_INSTANCE_URL).hostname.toLowerCase();
	const client = generator("mastodon", BOT_INSTANCE_URL, BOT_ACCESS_TOKEN);
	try {
		const res = await client.search(`@${handle}`, { type: "accounts", resolve: true, limit: 5 });
		for (const a of res.data.accounts || []) {
			const found = canonicalOptOutHandle(buildHandle(a.acct, botDomain));
			if (found === handle) return found;
		}
	} catch (err) {
		console.warn(`Opt-out resolve failed for ${handle}:`, err instanceof Error ? err.message : err);
	}
	return null;
}

async function sendConfirmationDm(handle: string, token: string): Promise<void> {
	const client = generator("mastodon", BOT_INSTANCE_URL!, BOT_ACCESS_TOKEN!);
	const link = `${SITE_URL}/opt-out/confirm?token=${encodeURIComponent(token)}`;
	const text =
		`@${handle} Someone asked Furry Fediverse to exclude your account from community starter packs. ` +
		`If that was you, confirm here (link expires in 24 hours): ${link}\n\n` +
		`If it wasn't you, you can ignore this message and nothing will change.`;
	await client.postStatus(text, { visibility: "direct" });
}

/**
 * Start an opt-out: verify the handle exists and DM it a confirmation link.
 * Throws OptOutError with a user-facing message on failure.
 */
export async function requestOptOut(rawHandle: string, ip: string | null): Promise<{ alreadyOptedOut: boolean }> {
	const handle = canonicalOptOutHandle(rawHandle);
	if (!handle) throw new OptOutError("Enter your full handle, like @name@instance.social");

	const existing = await prisma.packOptOut.findUnique({ where: { handle } });
	if (existing?.status === "confirmed") return { alreadyOptedOut: true };

	const now = Date.now();
	if (existing?.lastDmSentAt && now - existing.lastDmSentAt.getTime() < HANDLE_DM_COOLDOWN_MS) {
		throw new OptOutError("A confirmation message was sent to this account recently. Check your DMs, or try again in a few minutes.", 429);
	}

	const ipHash = hashIp(ip);
	if (ipHash) {
		const recent = await prisma.packOptOut.count({
			where: { requestIpHash: ipHash, lastDmSentAt: { gte: new Date(now - 60 * 60 * 1000) } },
		});
		if (recent >= IP_HOURLY_LIMIT) {
			throw new OptOutError("Too many requests. Please try again later.", 429);
		}
	}

	const resolved = await resolveViaBot(handle);
	if (!resolved) {
		throw new OptOutError("We couldn't find that account. Check the handle and make sure it's spelled exactly, like @name@instance.social");
	}

	const token = crypto.randomBytes(32).toString("base64url");
	const data = {
		status: "pending",
		tokenHash: hashToken(token),
		tokenExpiresAt: new Date(now + TOKEN_TTL_MS),
		lastDmSentAt: new Date(now),
		requestIpHash: ipHash,
		requestedAt: new Date(now),
	};
	await prisma.packOptOut.upsert({
		where: { handle },
		create: { handle, ...data },
		update: data,
	});

	try {
		await sendConfirmationDm(handle, token);
	} catch (err) {
		console.error(`Failed to send opt-out DM to ${handle}:`, err);
		// Let the user retry immediately rather than wait out the cooldown.
		await prisma.packOptOut.update({ where: { handle }, data: { lastDmSentAt: null } });
		throw new OptOutError("We couldn't send the confirmation message. Please try again later.", 502);
	}

	return { alreadyOptedOut: false };
}

/** Look up a pending, unexpired opt-out by its confirmation token. */
export async function findPendingByToken(token: string) {
	if (!token) return null;
	const row = await prisma.packOptOut.findUnique({ where: { tokenHash: hashToken(token) } });
	if (!row || row.status !== "pending" || !row.tokenExpiresAt || row.tokenExpiresAt < new Date()) return null;
	return row;
}

/** Confirm an opt-out and remove the handle from all packs. */
export async function confirmOptOut(token: string): Promise<{ handle: string; removed: number }> {
	const row = await findPendingByToken(token);
	if (!row) throw new OptOutError("This confirmation link is invalid or has expired. Please request a new one.", 404);

	await prisma.packOptOut.update({
		where: { id: row.id },
		data: { status: "confirmed", confirmedAt: new Date(), tokenHash: null, tokenExpiresAt: null },
	});
	const removed = await removeHandleFromAllPacks(row.handle);
	return { handle: row.handle, removed };
}

/**
 * Delete every pack account row (live packs and revisions) that refers to
 * this handle, then fix up the affected packs' counts and cover images.
 */
export async function removeHandleFromAllPacks(handle: string): Promise<number> {
	const parsed = parseHandle(handle);
	if (!parsed) return 0;
	const ci = "insensitive" as const;

	const rows = await prisma.starterPackAccount.findMany({
		where: {
			OR: [
				{ handle: { equals: handle, mode: ci } },
				{ handle: { equals: `@${handle}`, mode: ci } },
				{ linkedProfile: { acct: { equals: handle, mode: ci } } },
				{
					linkedProfile: {
						acct: { equals: parsed.username, mode: ci },
						instanceDomain: { equals: parsed.domain, mode: ci },
					},
				},
			],
		},
		select: { id: true, starterPackId: true },
	});
	if (rows.length === 0) return 0;

	const packIds = [...new Set(rows.map((r) => r.starterPackId))];
	await prisma.$transaction(async (tx) => {
		await tx.starterPackAccount.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
		for (const id of packIds) {
			const count = await tx.starterPackAccount.count({ where: { starterPackId: id } });
			const pack = await tx.starterPack.findUnique({ where: { id }, select: { splashImageCustom: true } });
			await tx.starterPack.update({
				where: { id },
				data: { numAccounts: count, ...(pack?.splashImageCustom ? {} : { splashImageNeedsUpdate: true }) },
			});
		}
	});
	return rows.length;
}
