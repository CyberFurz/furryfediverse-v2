
-- AlterTable
ALTER TABLE "starter_pack" ADD COLUMN     "splashImage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "splashImageNeedsUpdate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "splashImageSignature" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "splashImageUpdatedAt" TIMESTAMP(3);

