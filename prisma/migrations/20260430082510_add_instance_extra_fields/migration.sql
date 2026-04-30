-- AlterTable
ALTER TABLE "instance" ADD COLUMN     "country" TEXT,
ADD COLUMN     "customInviteLink" TEXT,
ADD COLUMN     "donationLink" TEXT,
ADD COLUMN     "nsfwAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primaryLanguage" TEXT;
