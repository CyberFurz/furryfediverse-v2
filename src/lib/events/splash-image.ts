import sharp from "sharp";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SPLASH_WIDTH = 1200;
const SPLASH_HEIGHT = 630;

const ACCENT = "#31dcb2";
const GRADIENT_START = "#005458";
const GRADIENT_END = "#0A2B49";
const FONT_FAMILY = "Inter, sans-serif";

export interface EventSplashData {
    name: string;
    slug: string;
    description?: string;
    location?: string;
    startDate: string;
    endDate: string;
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function textWidth(text: string, fontSize: number): number {
    return text.length * fontSize * 0.58;
}

function formatDateRange(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (s.getFullYear() !== e.getFullYear()) {
        return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} - ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
    }
    return `${s.toLocaleDateString("en-US", opts)} - ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export function getSplashImageSignature(data: EventSplashData): string {
    const content = data.name + "|" + data.slug + "|" + (data.description || "") + "|" + data.startDate + "|" + data.endDate;
    return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

export async function renderEventSplashImage(data: EventSplashData): Promise<void> {
    const parts: string[] = [];

    // SVG definitions
    parts.push(
        `<svg width="${SPLASH_WIDTH}" height="${SPLASH_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
        "<defs>",
        `<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">`,
        `<stop offset="0%" stop-color="${GRADIENT_START}"/>`,
        `<stop offset="100%" stop-color="${GRADIENT_END}"/>`,
        `</linearGradient>`,
        "</defs>",
    );

    // Background
    parts.push(`<rect width="100%" height="100%" fill="url(#bg)"/>`);

    // Accent line
    parts.push(
        `<line x1="400" y1="50" x2="800" y2="50" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round"/>`,
    );

    // Event name (centered, large)
    const name = data.name || "Event";
    const nameFontSize = Math.min(56, Math.floor(SPLASH_WIDTH / (name.length * 0.58)));
    const nameY = 180;
    parts.push(
        `<text x="50%" y="${nameY}" text-anchor="middle" fill="white" font-size="${nameFontSize}" font-weight="bold" font-family="${FONT_FAMILY}">${escapeXml(name)}</text>`,
    );

    // Accent line under name
    parts.push(
        `<line x1="500" y1="${nameY + 20}" x2="700" y2="${nameY + 20}" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>`,
    );

    // Date range
    const dateStr = formatDateRange(data.startDate, data.endDate);
    const dateY = nameY + 65;
    parts.push(
        `<text x="50%" y="${dateY}" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="24" font-family="${FONT_FAMILY}">${escapeXml(dateStr)}</text>`,
    );

    // Location
    if (data.location) {
        const locY = dateY + 45;
        parts.push(
            `<text x="50%" y="${locY}" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-size="20" font-family="${FONT_FAMILY}">${escapeXml(data.location)}</text>`,
        );
    }

    // Description (word-wrapped, centered)
    if (data.description) {
        const descStartY = (data.location ? dateY + 95 : dateY + 55);
        const maxWidth = SPLASH_WIDTH - 200;
        const fontSize = 18;
        const lineH = 28;
        const maxLines = 4;

        const words = data.description.trim().split(/\s+/);
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
            lines.push(currentLine);
        }

        for (let i = 0; i < lines.length; i++) {
            const y = descStartY + 4 + i * lineH;
            parts.push(
                `<text x="50%" y="${y}" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-size="${fontSize}" font-family="${FONT_FAMILY}">${escapeXml(lines[i])}</text>`,
            );
        }
    }

    // Bottom attribution
    parts.push(
        `<text x="${SPLASH_WIDTH - 20}" y="${SPLASH_HEIGHT - 20}" text-anchor="end" fill="rgba(255,255,255,0.35)" font-size="14" font-family="${FONT_FAMILY}">Furry Fediverse Events</text>`,
    );

    parts.push("</svg>");

    // Rasterize and save
    const outputDir = path.resolve(process.cwd(), "public", "og", "events");
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${data.slug}.png`);

    try {
        await sharp(Buffer.from(parts.join("\n"))).png().toFile(outputPath);
    } catch (err) {
        console.error(`Event OG render failed for ${data.slug}:`, err);
        throw err;
    }
}
