import fs from "fs";
import path from "path";
import sharp from "sharp";

const THUMBNAIL_DIR = path.join(process.cwd(), "storage", "thumbnails");
const PROFILE_DIR = path.join(process.cwd(), "storage", "profiles");

async function downloadAndCacheImageToDir(
    imageUrl: string,
    filename: string,
    outputDir: string,
    publicBasePath: string,
    forceRefresh: boolean = false,
): Promise<string | null> {
    if (!imageUrl) return null;

    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const webpFilename = filename + ".webp";
        const finalFilePath = path.join(outputDir, webpFilename);

        if (!forceRefresh && fs.existsSync(finalFilePath)) {
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

        fs.writeFileSync(finalFilePath, webpBuffer);

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

export function deleteCachedProfileImageByUrl(imageUrl: string | null | undefined): void {
    if (!imageUrl || !imageUrl.startsWith("/api/profiles/images/")) return;

    try {
        const filename = path.basename(imageUrl);
        const filePath = path.join(PROFILE_DIR, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error("Error deleting cached profile image:", error);
    }
}
