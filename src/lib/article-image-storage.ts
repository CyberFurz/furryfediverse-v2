import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const ARTICLE_UPLOAD_DIR = path.join(process.cwd(), "storage", "article-uploads");

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function normalizeMimeType(input: string): string {
  return input.trim().toLowerCase();
}

export function getArticleUploadDir(): string {
  return ARTICLE_UPLOAD_DIR;
}

export async function persistInlineArticleImages(html: string | null | undefined): Promise<string> {
  if (!html) return "";

  let output = html;
  const dataUrlPattern = /(<img\b[^>]*\bsrc\s*=\s*["'])(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)(["'][^>]*>)/gi;
  const matches = [...output.matchAll(dataUrlPattern)];

  if (matches.length === 0) {
    return output;
  }

  await fs.mkdir(ARTICLE_UPLOAD_DIR, { recursive: true });

  for (const match of matches) {
    const fullMatch = match[0];
    const prefix = match[1];
    const dataUrl = match[2];
    const suffix = match[3];

    const parts = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!parts) {
      continue;
    }

    const mimeType = normalizeMimeType(parts[1]);
    const ext = MIME_TO_EXT[mimeType];
    if (!ext) {
      continue;
    }

    const base64 = parts[2].replace(/\s+/g, "");
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      continue;
    }

    if (!buffer.length) {
      continue;
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(ARTICLE_UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buffer);

    const replacement = `${prefix}/api/learn/images/${filename}${suffix}`;
    output = output.replace(fullMatch, replacement);
  }

  return output;
}
