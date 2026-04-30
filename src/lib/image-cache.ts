import fs from "fs";
import path from "path";
import sharp from "sharp";

const THUMBNAIL_DIR = path.join(process.cwd(), "storage", "thumbnails");

export async function downloadAndCacheImage(
    imageUrl: string,
    filename: string
): Promise<string | null> {
    if (!imageUrl) return null;

    try {
        if (!fs.existsSync(THUMBNAIL_DIR)) {
            fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
        }

        const webpFilename = filename + ".webp";
        const finalFilePath = path.join(THUMBNAIL_DIR, webpFilename);

        if (fs.existsSync(finalFilePath)) {
            return `/api/instances/images/${webpFilename}`;
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

        return `/api/instances/images/${webpFilename}`;
    } catch (error) {
        console.error(`Error downloading image ${imageUrl}:`, error);
        return null;
    }
}
