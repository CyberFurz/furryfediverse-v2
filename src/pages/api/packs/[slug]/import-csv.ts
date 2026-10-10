export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-helpers";
import {
	type SplashAccount,
	getSplashImageSignature,
	renderSplashImage,
} from "@/lib/packs/splash-image";
import { getEditablePack } from "@/lib/packs/revisions";
import { getOptedOutHandles, packAccountHandle } from "@/lib/packs/opt-out";

/** Supported import file types. */
type FileType = "csv" | "json";

/**
 * Detect the file type from the uploaded file's name.
 * Form field is still called "csv"; the type is inferred client-side.
 */
function detectFileType(filename: string): FileType {
    if (filename.endsWith(".json")) return "json";
    return "csv";
}

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Extract a fediverse handle from an ActivityPub profile URL.
 *
 * Supported URL patterns:
 *   - https://instance.social/users/username  →  username@instance.social
 *   - https://other.instance/@username          →  username@other.instance
 *   - https://pixelfed.example/username         →  username@pixelfed.example
 */
function parseActivityPubUrl(raw: string): string | null {
    try {
        const url = new URL(raw);
        const domain = url.hostname;
        const path = url.pathname;

        let username: string | undefined;
        if (path.includes("/users/")) {
            username = path.split("/users/")[1]?.replace(/\/+$/, "");
        } else if (path.includes("/@")) {
            username = path.split("/@")[1]?.replace(/\/+$/, "");
        } else {
            // Bare profile path: https://instance/username (Pixelfed style)
            username = path.replace(/^\/+|\/+$/g, "").split("/").pop();
        }
        if (username) return normalizeHandle(`${username}@${domain}`);
        return null;
    } catch {
        return null;
    }
}

/**
 * Parse CSV lines into account handles.
 *
 * Detects the format by inspecting the first column header:
 *   - Contains "list" (case-insensitive) → lists.csv format:
 *     `List name,@user@instance`: extracts the second column.
 *   - Otherwise → extracts the first column
 *     (e.g. following_accounts.csv: `Account address,Show boosts,...`).
 */
function parseCsvHandles(lines: string[]): string[] {
    if (lines.length < 2) return [];

    const header = lines[0];
    const firstCol = parseCsvLine(header)[0]?.toLowerCase() || "";
    const isListFormat = firstCol.includes("list");

    const handles: string[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length === 0) continue;

        if (isListFormat) {
            // lists.csv: second column is @user@instance
            const handle = cols[1]?.trim();
            if (handle) {
                const normalized = normalizeHandle(handle);
                if (normalized) handles.push(normalized);
            }
        } else {
            // Default / following_accounts.csv: first column
            const handle = cols[0]?.trim();
            if (handle) {
                const normalized = normalizeHandle(handle);
                if (normalized) handles.push(normalized);
            }
        }
    }

    return handles;
}

/**
 * Parse a JSON array of ActivityPub profile URLs into account handles.
 *
 * Expected format (Pixelfed following export):
 *   [
 *     "https://instance.social/users/username",
 *     "https://other.instance/@username"
 *   ]
 */
function parseJsonHandles(jsonText: string): string[] {
    let urls: unknown;
    try {
        urls = JSON.parse(jsonText);
    } catch {
        throw new Error("Import file could not be parsed");
    }

    if (!Array.isArray(urls) || urls.length === 0) {
        throw new Error("Import file contains no data");
    }

    const handles: string[] = [];
    for (const item of urls) {
        if (typeof item !== "string" || !item.trim()) continue;
        const handle = parseActivityPubUrl(item.trim());
        if (handle) handles.push(handle);
    }
    return handles;
}

function normalizeHandle(raw: string): string {
    let handle = raw.trim().toLowerCase();
    // Remove leading @ if present
    if (handle.startsWith("@")) handle = handle.slice(1);
    // Remove trailing slash or garbage
    handle = handle.replace(/\/+$/, "");
    return handle;
}

export const POST: APIRoute = async ({ request, locals, params }) => {
    const { user, error: authError } = requireUser(locals);
    if (authError || !user) return authError!;

    try {
        const { slug } = params;
        if (!slug) {
            return new Response(
                JSON.stringify({ error: "Slug is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verify pack exists and user owns it
        const pack = await prisma.starterPack.findFirst({
            where: { slug, deletedAt: null },
        });

        if (!pack) {
            return new Response(
                JSON.stringify({ error: "Starter pack not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (pack.createdById !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only import accounts to your own packs" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        // Imports into a live pack go to its revision.
        const target = await getEditablePack(pack);

        // Parse multipart form data
        const formData = await request.formData();
        const csvFile = formData.get("csv");

        if (!csvFile || !(csvFile instanceof File)) {
            return new Response(
                JSON.stringify({ error: "CSV file is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Detect file type from filename
        const fileType = detectFileType(csvFile.name);
        const fileLabel = fileType === "csv" ? "CSV file" : "Import file";

        // Read file content
        const fileText = await csvFile.text();

        // Parse based on file type
        let handles: string[];

        if (fileType === "json") {
            try {
                handles = parseJsonHandles(fileText);
            } catch (error) {
                return new Response(
                    JSON.stringify({
                        error: error instanceof Error ? error.message : "Failed to parse import file",
                    }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
        } else {
            const lines = fileText.split("\n").filter((l) => l.trim().length > 0);

            if (lines.length < 2) {
                return new Response(
                    JSON.stringify({ error: `${fileLabel} is empty or has no data rows` }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }

            handles = parseCsvHandles(lines);
        }

        if (handles.length === 0) {
            const label = fileType === "csv" ? "CSV" : "import file";
            return new Response(
                JSON.stringify({ error: `No valid account handles found in ${label}` }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Drop accounts that opted out of starter packs.
        const optedOut = await getOptedOutHandles(handles);
        const optedOutCount = handles.filter((h) => optedOut.has(h)).length;
        handles = handles.filter((h) => !optedOut.has(h));

        // Look up handles in LinkedProfile table
        // Try matching both with and without @ prefix
        const handleVariants = handles.flatMap((h) => [
            { acct: { contains: h, mode: "insensitive" as const } },
            { acct: { contains: `@${h}`, mode: "insensitive" as const } },
        ]);

        const matchedProfilesRaw = await prisma.linkedProfile.findMany({
            where: {
                isActive: true,
                OR: handleVariants,
            },
            select: { id: true, acct: true, instanceDomain: true },
        });
        // Fuzzy matching above can pull in other profiles; never add opted-out ones.
        const optedOutProfiles = await getOptedOutHandles(
            matchedProfilesRaw.map((p) => packAccountHandle({ linkedProfile: p })),
        );
        const matchedProfiles = matchedProfilesRaw.filter(
            (p) => !optedOutProfiles.has(packAccountHandle({ linkedProfile: p }) ?? ""),
        );

        // Build set of normalized accts from matched profiles
        const matchedAcctSet = new Set(matchedProfiles.map((p) => normalizeHandle(p.acct)));

        // Identify handles that did NOT match any LinkedProfile
        const unmatchedHandles: string[] = [];
        for (const handle of handles) {
            if (!matchedAcctSet.has(handle)) {
                unmatchedHandles.push(handle);
            }
        }

        // Deduplicate matched profile IDs
        const seenIds = new Set<string>();
        const matchedIds: string[] = [];
        for (const profile of matchedProfiles) {
            if (!seenIds.has(profile.id)) {
                seenIds.add(profile.id);
                matchedIds.push(profile.id);
            }
        }

        // Check current account count
        const currentCount = await prisma.starterPackAccount.count({
            where: { starterPackId: target.id },
        });

        // Check for existing handle-based accounts in this pack
        const existingHandleAccounts = await prisma.starterPackAccount.findMany({
            where: { starterPackId: target.id, handle: { not: null } },
            select: { handle: true },
        });
        const existingHandleSet = new Set(existingHandleAccounts.map((a) => a.handle));

        const maxToAdd = 150 - currentCount;

        // Allocate slots: profile-based first, then handle-based
        const profileIdsToAdd = matchedIds.slice(0, maxToAdd);
        const remainingSlots = maxToAdd - profileIdsToAdd.length;

        // Filter out handles already present in the pack
        const newUnmatchedHandles = unmatchedHandles.filter(
            (h) => !existingHandleSet.has(`@${h}`),
        );
        const handlesToAdd = newUnmatchedHandles.slice(0, remainingSlots);

        // Build create data for both profile-linked and handle-based accounts
        const createData: Array<{
            starterPackId: string;
            createdById: string;
            linkedProfileId?: string;
            handle?: string;
        }> = [
            ...profileIdsToAdd.map((linkedProfileId) => ({
                starterPackId: target.id,
                linkedProfileId,
                createdById: user.id,
            })),
            ...handlesToAdd.map((h) => ({
                starterPackId: target.id,
                handle: `@${h}`,
                createdById: user.id,
            })),
        ];

        // Bulk create StarterPackAccount records
        if (createData.length > 0) {
            await prisma.starterPackAccount.createMany({
                data: createData,
                skipDuplicates: true,
            });
        }

        // Update numAccounts
        const discoverableCount = await prisma.starterPackAccount.count({
            where: { starterPackId: target.id },
        });
        await prisma.starterPack.update({
            where: { id: target.id },
            data: { numAccounts: discoverableCount },
        });

        // Auto-regenerate splash image after import
        const updatedPack = await prisma.starterPack.findFirst({
            where: { id: target.id },
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

        // Don't overwrite an owner-uploaded custom splash image
        if (updatedPack && !updatedPack.splashImageCustom) {
            const crawledAccounts: SplashAccount[] = [];
            const uncrawledHandles: string[] = [];

            for (const a of updatedPack.accounts) {
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

            await renderSplashImage(
                { title: target.title, slug: target.slug, description: target.description },
                crawledAccounts,
                uncrawledHandles,
            );

            const newSignature = getSplashImageSignature(
                { title: target.title },
                crawledAccounts,
                uncrawledHandles,
            );

            await prisma.starterPack.update({
                where: { id: target.id },
                data: {
                    splashImage: `splash/${target.slug}.png`,
                    splashImageSignature: newSignature,
                    splashImageUpdatedAt: new Date(),
                    splashImageNeedsUpdate: false,
                },
            });
        }

        const imported = createData.length;
        const skipped = handles.length + optedOutCount - imported;

        return new Response(
            JSON.stringify({
                imported,
                skipped,
                optedOut: optedOutCount,
                total: handles.length,
                matchedInDb: matchedProfiles.length,
                packTotalAccounts: discoverableCount,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error importing CSV:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
