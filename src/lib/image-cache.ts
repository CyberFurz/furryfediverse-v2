import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const STORAGE_DIR = path.join(process.cwd(), "storage");
const THUMBNAIL_DIR = path.join(STORAGE_DIR, "thumbnails");
const PROFILE_DIR = path.join(STORAGE_DIR, "profiles");
const PROFILE_EMOJI_DIR = path.join(STORAGE_DIR, "profile-emojis");

function assertNoSymlinkPath(targetPath: string, stopPath: string): void {
    const resolvedStop = path.resolve(stopPath);
    let current = path.resolve(targetPath);

    while (true) {
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
            throw new Error(`Refusing to use symlinked cache path: ${current}`);
        }

        if (current === resolvedStop) {
            break;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
}

function ensureCacheDir(dir: string): void {
    assertNoSymlinkPath(dir, STORAGE_DIR);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    assertNoSymlinkPath(dir, STORAGE_DIR);
}

function assertSafeCachedFile(filePath: string, outputDir: string): void {
    assertNoSymlinkPath(outputDir, STORAGE_DIR);

    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
        throw new Error(`Refusing to use symlinked cached file: ${filePath}`);
    }
}

function buildSafeCachePath(outputDir: string, filename: string): { filePath: string; webpFilename: string } {
    const safeStem = crypto.createHash("sha256").update(filename).digest("hex");
    const webpFilename = `${safeStem}.webp`;
    const filePath = path.resolve(outputDir, webpFilename);
    const resolvedDir = path.resolve(outputDir) + path.sep;

    if (!filePath.startsWith(resolvedDir)) {
        throw new Error("Resolved cache path escaped output directory");
    }

    return { filePath, webpFilename };
}

async function downloadAndCacheImageToDir(
    imageUrl: string,
    filename: string,
    outputDir: string,
    publicBasePath: string,
    forceRefresh: boolean = false,
): Promise<string | null> {
    if (!imageUrl) return null;

    try {
        ensureCacheDir(outputDir);
        const { filePath: finalFilePath, webpFilename } = buildSafeCachePath(outputDir, filename);

        if (!forceRefresh && fs.existsSync(finalFilePath)) {
            assertSafeCachedFile(finalFilePath, outputDir);
            return `${publicBasePath}/${webpFilename}`;
        }

        const response = await fetch(imageUrl, {
            headers: {
                "User-Agent": "FurryFediverse/1.0",
            },
        });

        if (!response.ok) {
            console.error(`Failed to fetch image: ${imageUrl}`, response.status);
            return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        const maxSize = 5 * 1024 * 1024;
        if (buffer.length > maxSize) {
            console.error(`Image too large: ${buffer.length} bytes`);
            return null;
        }

        const webpBuffer = await sharp(buffer)
            .webp({ quality: 80, effort: 6 })
            .toBuffer();

        const tempFilePath = `${finalFilePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempFilePath, webpBuffer);
        fs.renameSync(tempFilePath, finalFilePath);

        return `${publicBasePath}/${webpFilename}`;
    } catch (error) {
        console.error(`Error downloading image ${imageUrl}:`, error);
        return null;
    }
}

export async function downloadAndCacheImage(
    imageUrl: string,
    filename: string,
    forceRefresh: boolean = false,
): Promise<string | null> {
    return downloadAndCacheImageToDir(
        imageUrl,
        filename,
        THUMBNAIL_DIR,
        "/api/instances/images",
        forceRefresh,
    );
}

export async function downloadAndCacheProfileImage(
    imageUrl: string,
    filename: string,
    forceRefresh: boolean = false,
): Promise<string | null> {
    return downloadAndCacheImageToDir(
        imageUrl,
        filename,
        PROFILE_DIR,
        "/api/profiles/images",
        forceRefresh,
    );
}

export async function downloadAndCacheProfileEmoji(
    imageUrl: string,
    filename: string,
    forceRefresh: boolean = false,
): Promise<string | null> {
    return downloadAndCacheImageToDir(
        imageUrl,
        filename,
        PROFILE_EMOJI_DIR,
        "/api/profiles/emojis",
        forceRefresh,
    );
}

export function deleteCachedProfileImageByUrl(imageUrl: string | null | undefined): void {
    if (!imageUrl || !imageUrl.startsWith("/api/profiles/images/")) return;

    try {
        const sanitizedPath = imageUrl.split("?")[0].split("#")[0];
        const filename = path.basename(sanitizedPath);
        const filePath = path.resolve(PROFILE_DIR, filename);
        assertSafeCachedFile(filePath, PROFILE_DIR);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error("Error deleting cached profile image:", error);
    }
}
