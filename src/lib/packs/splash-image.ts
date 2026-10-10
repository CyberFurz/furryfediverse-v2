import sharp from "sharp";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SPLASH_WIDTH = 1200;
const SPLASH_HEIGHT = 630;
const AVATAR_SIZE = 40;
const AVATAR_RADIUS = AVATAR_SIZE / 2;
const MAX_CRAWLED_ON_SPLASH = 16; // max cards shown (fits in 4 cols × 4 rows)

// Colours
const ACCENT = "#31dcb2";
const GRADIENT_START = "#005458";
const GRADIENT_END = "#0A2B49";
const PLACEHOLDER_FILL = "#1a6868";

const FONT_FAMILY = "Inter, sans-serif";


/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SplashAccount {
	displayName: string;
	handle: string; // @user@instance
	avatarUrl: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** Rough text width estimation (px) for Inter at a given font-size. */
function textWidth(text: string, fontSize: number): number {
	return text.length * fontSize * 0.58;
}

/** Cap a string so its estimated width does not exceed maxPx. */
function truncateToFit(text: string, fontSize: number, maxPx: number): string {
	const ellipsis = "…";
	while (text.length > 0 && textWidth(text, fontSize) > maxPx) {
		text = text.slice(0, -1);
	}
	return text ? text + ellipsis : text.slice(0, Math.max(1, Math.floor(maxPx / (fontSize * 0.58)))) + ellipsis;
}

function displayLabel(account: SplashAccount): string {
	return account.displayName || account.handle;
}

/* ------------------------------------------------------------------ */
/*  Signature                                                         */
/* ------------------------------------------------------------------ */

/**
 * SHA-256 signature over the title, crawled handles, and uncrawled handles.
 * Used to detect whether the splash image needs regeneration.
 */
export function getSplashImageSignature(
	pack: { title: string },
	crawledAccounts: SplashAccount[],
	uncrawledHandles: string[],
): string {
	const sortedCrawled = crawledAccounts.map((a) => a.handle).sort();
	const sortedUncrawled = [...uncrawledHandles].sort();
	const content = pack.title + "|" + sortedCrawled.join(",") + "|" + sortedUncrawled.join(",");
	return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

/* ------------------------------------------------------------------ */
/*  Avatar fetching / caching                                         */
/* ------------------------------------------------------------------ */

const avatarCache = new Map<string, string>();

/**
 * Download an avatar URL, resize to AVATAR_SIZE x AVATAR_SIZE, return PNG data URI.
 * Returns null on any failure.
 */
async function fetchAvatar(url: string): Promise<string | null> {
	const cacheKey = url;
	const cached = avatarCache.get(cacheKey);
	if (cached) return cached;

	try {
		const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
		if (!resp.ok) return null;

		const buf = Buffer.from(await resp.arrayBuffer());
		const resized = await sharp(buf)
			.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
			.png()
			.toBuffer();

		const dataUrl = `data:image/png;base64,${resized.toString("base64")}`;
		avatarCache.set(cacheKey, dataUrl);
		return dataUrl;
	} catch {
		return null;
	}
}

/* ------------------------------------------------------------------ */
/*  Layout helpers                                                    */
/* ------------------------------------------------------------------ */

interface CardPos {
	cx: number; // avatar centre X
	cy: number; // avatar centre Y
	textX: number; // text start X
	nameY: number; // display-name baseline Y
	handleY: number; // handle baseline Y
}

/**
 * Compute card positions for crawled accounts.
 *
 * ≤6 accounts → 3-column card layout with display name + handle.
 * >6 accounts → 4-column compact layout (avatar + handle only).
 */
function computeCardPositions(count: number, contentTop: number): CardPos[] {
	const positions: CardPos[] = [];
	if (count === 0) return positions;

	if (count <= 6) {
		// 3-column card layout
		const cardW = 340;
		const gapH = 30;
		const gapV = 14;
		const totalW = 3 * cardW + 2 * gapH;
		const startX = (SPLASH_WIDTH - totalW) / 2;
		const cols = 3;
		const rows = Math.ceil(count / cols);
		const cardH = 48;

		for (let i = 0; i < count; i++) {
			const col = i % cols;
			const row = Math.floor(i / cols);
			const cardX = startX + col * (cardW + gapH);
			const cardY = contentTop + row * (cardH + gapV);
			const avatarCX = cardX + AVATAR_RADIUS + 4;
			const avatarCY = cardY + cardH / 2;
			positions.push({
				cx: avatarCX,
				cy: avatarCY,
				textX: cardX + AVATAR_SIZE + 12,
				nameY: cardY + 22,
				handleY: cardY + 40,
			});
		}
	} else {
		// 4-column compact layout (just avatar + handle)
		const entryW = 270;
		const gapH = 20;
		const gapV = 10;
		const totalW = 4 * entryW + 3 * gapH;
		const startX = (SPLASH_WIDTH - totalW) / 2;
		const cols = 4;
		const rows = Math.ceil(count / cols);
		const entryH = 48;

		for (let i = 0; i < count; i++) {
			const col = i % cols;
			const row = Math.floor(i / cols);
			const entryX = startX + col * (entryW + gapH);
			const entryY = contentTop + row * (entryH + gapV);
			const avatarCX = entryX + AVATAR_RADIUS + 4;
			const avatarCY = entryY + entryH / 2;
			positions.push({
				cx: avatarCX,
				cy: avatarCY,
				textX: entryX + AVATAR_SIZE + 12,
				nameY: entryY + 22,
				handleY: entryY + 22, // handle centred vertically (no display name)
			});
		}
	}

	return positions;
}

/** Calculate the bottom Y of the card section. */
function cardsBottom(count: number, contentTop: number): number {
	if (count === 0) return contentTop;
	if (count <= 6) {
		const rows = Math.ceil(count / 3);
		return contentTop + rows * 48 + (rows - 1) * 14 + 48;
	}
	const rows = Math.ceil(count / 4);
	return contentTop + rows * 48 + (rows - 1) * 10 + 48;
}

/* ------------------------------------------------------------------ */
/*  SVG builders                                                      */
/* ------------------------------------------------------------------ */

/** Push SVG opening / definitions. */
function buildDefs(parts: string[]): void {
	parts.push(
		`<svg width="${SPLASH_WIDTH}" height="${SPLASH_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
		"<defs>",
		`<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">`,
		`<stop offset="0%" stop-color="${GRADIENT_START}"/>`,
		`<stop offset="100%" stop-color="${GRADIENT_END}"/>`,
		`</linearGradient>`,
		`<clipPath id="ac" clipPathUnits="objectBoundingBox">`,
		`<circle cx="0.5" cy="0.5" r="0.48"/>`,
		`</clipPath>`,
		"</defs>",
	);
}

/** Push background rect. */
function buildBackground(parts: string[]): void {
	parts.push(`<rect width="100%" height="100%" fill="url(#bg)"/>`);
}

/** Push title text + accent line. Returns the Y after the title block. */
function buildTitle(parts: string[], title: string): number {
	const escaped = escapeXml(title);
	const fontSize = 40;
	const titleY = 52;
	const lineY = 74;

	parts.push(
		`<text x="50%" y="${titleY}" text-anchor="middle" fill="white" font-size="${fontSize}" font-weight="bold" font-family="${FONT_FAMILY}">${escaped}</text>`,
	);
	parts.push(
		`<line x1="560" y1="${lineY}" x2="640" y2="${lineY}" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>`,
	);

	return lineY + 20;
}

/** Push description text below the title, wrapping across multiple lines. Returns the Y after description. */
function buildDescription(parts: string[], description: string, startY: number): number {
	if (!description.trim()) return startY;
	const raw = description.trim();
	const fontSize = 17;
	const lineH = 24;
	const maxWidth = SPLASH_WIDTH - 160;
	const maxLines = 3;

	// Word-wrap: split into words, then fit as many as possible per line
	const words = raw.split(/\s+/);
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		const candidate = currentLine ? currentLine + " " + word : word;
		if (textWidth(candidate, fontSize) <= maxWidth) {
			currentLine = candidate;
		} else if (currentLine) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			// A single word wider than the canvas: truncate it
			let t = word;
			while (t.length > 1 && textWidth(t + "…", fontSize) > maxWidth) {
				t = t.slice(0, -1);
			}
			lines.push(t + "…");
			currentLine = "";
		}
		if (lines.length >= maxLines) break;
	}
	if (currentLine && lines.length < maxLines) {
		// Check if adding currentLine would exceed max lines
		if (lines.length < maxLines - 1) {
			lines.push(currentLine);
		} else {
			// Last line: truncate if needed
			const remaining = currentLine;
			let t = remaining;
			while (t.length > 1 && textWidth(t + "…", fontSize) > maxWidth) {
				t = t.slice(0, -1);
			}
			if (t !== remaining) t += "…";
			lines.push(t);
		}
	} else if (currentLine && lines.length >= maxLines) {
		// We're at the limit: add "…" to last line
		const last = lines[lines.length - 1];
		let t = last;
		while (t.length > 1 && textWidth(t + "…", fontSize) > maxWidth) {
			t = t.slice(0, -1);
		}
		lines[lines.length - 1] = t + "…";
	}

	for (let i = 0; i < lines.length; i++) {
		const y = startY + 4 + i * lineH;
		parts.push(
			`<text x="50%" y="${y}" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="${fontSize}" font-family="${FONT_FAMILY}">${escapeXml(lines[i])}</text>`,
		);
	}

	return startY + lines.length * lineH + 6;
}

/** Push the "No accounts yet" subtitle. */
function buildNoAccountsSubtitle(parts: string[], contentTop: number): void {
	parts.push(
		`<text x="50%" y="${contentTop + 40}" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-size="22" font-family="${FONT_FAMILY}">No accounts yet</text>`,
	);
}

/** Push avatar circle outline and optional image. Skips entirely if no data URL. */
function pushAvatar(parts: string[], cx: number, cy: number, dataUrl: string | null): void {
	if (!dataUrl) return;
	parts.push(
		`<circle cx="${cx}" cy="${cy}" r="${AVATAR_RADIUS}" fill="none" stroke="white" stroke-width="1.5"/>`,
	);
	const x = cx - AVATAR_RADIUS;
	const y = cy - AVATAR_RADIUS;
	parts.push(
		`<image href="${escapeXml(dataUrl)}" x="${x}" y="${y}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" clip-path="url(#ac)"/>`,
	);
}

/** Build the crawled-accounts card section. */
function buildCards(
	parts: string[],
	accounts: SplashAccount[],
	positions: CardPos[],
	avatarDataUrls: (string | null)[],
): void {
	const isCompact = accounts.length > 6;

	for (let i = 0; i < accounts.length && i < positions.length; i++) {
		const acc = accounts[i];
		const pos = positions[i];
		const avatarUrl = avatarDataUrls[i] ?? null;

		// Avatar
		pushAvatar(parts, pos.cx, pos.cy, avatarUrl);

		// Display name (only in non-compact mode): never truncate, we have room
		if (!isCompact) {
			parts.push(
				`<text x="${pos.textX}" y="${pos.nameY}" fill="white" font-size="16" font-weight="bold" font-family="${FONT_FAMILY}">${escapeXml(displayLabel(acc))}</text>`,
			);
		}

		// Handle: use full available card width, no truncation
		const handleFontSize = isCompact ? 14 : 13;
		parts.push(
			`<text x="${pos.textX}" y="${pos.handleY}" fill="rgba(255,255,255,0.6)" font-size="${handleFontSize}" font-family="${FONT_FAMILY}">${escapeXml(acc.handle)}</text>`,
		);
	}
}

/** Build the uncrawled-handles paragraph section, using as much vertical space as available. */
function buildUncrawled(
	parts: string[],
	handles: string[],
	startY: number,
	maxY: number,
): void {
	if (handles.length === 0) return;

	const fontSize = 14;
	const lineH = 22;
	const maxWidth = SPLASH_WIDTH - 100;
	let remaining = handles;

	// Build lines until we run out of vertical space
	while (remaining.length > 0 && startY + lineH <= maxY) {
		// Check if this is the last line we can fit
		const isLastLine = startY + lineH * 2 > maxY;
		let lineParts: string[] = [];
		let suffix = "";

		// Fit as many handles as possible on this line
		for (const h of remaining) {
			const candidate = [...lineParts, h].join(" ");
			if (textWidth(candidate, fontSize) <= maxWidth) {
				lineParts.push(h);
			} else {
				break;
			}
		}

		// If nothing fits even on its own, force-truncate one handle
		if (lineParts.length === 0) {
			const h = remaining[0];
			let t = h;
			while (t.length > 1 && textWidth(t + "…", fontSize) > maxWidth) {
				t = t.slice(0, -1);
			}
			parts.push(
				`<text x="50%" y="${startY}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="${fontSize}" font-family="${FONT_FAMILY}">${escapeXml(t + "…")}</text>`,
			);
			break;
		}

		// If we're on the last line and there are still more handles, add +N more
		if (isLastLine && lineParts.length < remaining.length) {
			const overflow = remaining.length - lineParts.length;
			suffix = ` +${overflow} more`;
			const candidateLine = lineParts.join(" ");
			if (textWidth(candidateLine + suffix, fontSize) > maxWidth) {
				lineParts.pop();
				const overflow2 = remaining.length - lineParts.length;
				suffix = ` +${overflow2} more`;
			}
		}

		const text = lineParts.join(" ") + suffix;
		parts.push(
			`<text x="50%" y="${startY}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="${fontSize}" font-family="${FONT_FAMILY}">${escapeXml(text)}</text>`,
		);

		remaining = remaining.slice(lineParts.length);
		startY += lineH;
	}
}

/** Push a stats bar showing total accounts and unique servers. */
function buildStatsBar(parts: string[], totalAccounts: number, serverCount: number): void {
	const barY = SPLASH_HEIGHT - 52;
	const barH = 30;
	const barW = 300;
	const barX = (SPLASH_WIDTH - barW) / 2;
	const r = 6;
	const label = `${totalAccounts} account${totalAccounts !== 1 ? "s" : ""} across ${serverCount} server${serverCount !== 1 ? "s" : ""}`;

	parts.push(
		// Background pill
		`<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${r}" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`,
		// Text
		`<text x="${barX + barW / 2}" y="${barY + barH / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.8)" font-size="15" font-family="${FONT_FAMILY}">${escapeXml(label)}</text>`,
	);
}

/** Push attribution text at bottom-right. */
function buildAttribution(parts: string[]): void {
	parts.push(
		`<text x="${SPLASH_WIDTH - 20}" y="${SPLASH_HEIGHT - 12}" text-anchor="end" fill="rgba(255,255,255,0.35)" font-size="12" font-family="${FONT_FAMILY}">Hosted by Furry Fediverse</text>`,
	);
}

/* ------------------------------------------------------------------ */
/*  Main render entry point                                           */
/* ------------------------------------------------------------------ */

/**
 * Generate a 1200×630 OG splash image for a starter pack and save it to
 * `public/splash/{slug}.png`.
 *
 * @param pack             - Pack metadata (title and slug).
 * @param crawledAccounts  - Array of accounts that have profile data (avatar, display name).
 * @param uncrawledHandles - Array of handles (@user@instance) for accounts without profile data.
 */
export async function renderSplashImage(
	pack: { title: string; slug: string; description?: string },
	crawledAccounts: SplashAccount[],
	uncrawledHandles: string[],
): Promise<void> {
	avatarCache.clear();

	const parts: string[] = [];

	buildDefs(parts);
	buildBackground(parts);
	const titleEnd = buildTitle(parts, pack.title);
	const contentTop = buildDescription(parts, pack.description || "", titleEnd);

	const displayCount = Math.min(crawledAccounts.length, MAX_CRAWLED_ON_SPLASH);
	const displayedAccounts = crawledAccounts.slice(0, displayCount);
	const cardPositions = computeCardPositions(displayCount, contentTop);

	if (displayedAccounts.length === 0 && uncrawledHandles.length === 0) {
		buildNoAccountsSubtitle(parts, contentTop);
	} else {
		// Fetch avatar images for crawled accounts (concurrent)
		const avatarUrlsToFetch = displayedAccounts
			.filter((a) => a.avatarUrl)
			.map((a) => a.avatarUrl!);
		const fetchedDataUrls = await Promise.all(
			avatarUrlsToFetch.map((url) => fetchAvatar(url)),
		);

		// Build a map from avatarUrl -> dataUrl
		const urlToDataUrl = new Map<string, string | null>();
		for (let i = 0; i < avatarUrlsToFetch.length; i++) {
			urlToDataUrl.set(avatarUrlsToFetch[i], fetchedDataUrls[i]);
		}

		// Align data URLs with account order (null if no avatar or fetch failed)
		const avatarDataUrls = displayedAccounts.map((a) =>
			a.avatarUrl ? (urlToDataUrl.get(a.avatarUrl) ?? null) : null,
		);

		// Cards section (limited to MAX_CRAWLED_ON_SPLASH)
		buildCards(parts, displayedAccounts, cardPositions, avatarDataUrls);

		// Uncrawled handles section (below cards, fill remaining space)
		if (uncrawledHandles.length > 0) {
			const cardsEndY = cardsBottom(displayCount, contentTop);
			const uncrawledStartY = Math.max(cardsEndY + 8, contentTop + 30);
			const statsTopY = SPLASH_HEIGHT - 60; // leave room for stats bar
			buildUncrawled(parts, uncrawledHandles, uncrawledStartY, statsTopY);
		}
	}

	// Stats bar
	const allHandles = [
		...crawledAccounts.map((a) => a.handle),
		...uncrawledHandles,
	];
	const totalAccounts = allHandles.length;
	const serverCount = new Set(
		allHandles.map((h) => h.split("@").pop() || "").filter(Boolean),
	).size;
	buildStatsBar(parts, totalAccounts, serverCount);

	buildAttribution(parts);
	parts.push("</svg>");

	/* ------ Rasterize & save ------ */

	const outputDir = path.resolve(process.cwd(), "public", "splash");
	await fs.mkdir(outputDir, { recursive: true });

	const outputPath = path.join(outputDir, `${pack.slug}.png`);

	try {
		await sharp(Buffer.from(parts.join("\n"))).png().toFile(outputPath);
	} catch (err) {
		console.error(`Splash render failed for ${pack.slug}:`, err);
		throw err;
	}
}
