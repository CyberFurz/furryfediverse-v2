/*
  Warnings:

  - You are about to drop the column `statusCount` on the `instance` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "instance" DROP COLUMN "statusCount",
ADD COLUMN     "thumbnailPath" TEXT,
ALTER COLUMN "verified" SET DEFAULT false;

-- AlterTable
ALTER TABLE "linked_profile" ADD COLUMN     "isPrimaryNsfw" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPrimaryProfile" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "banExpires" TIMESTAMP(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" TEXT;

-- CreateTable
CREATE TABLE "instance_api_key" (
    "id" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_draft" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instance_api_key_apiKey_key" ON "instance_api_key"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "instance_api_key_instanceId_key" ON "instance_api_key"("instanceId");

-- CreateIndex
CREATE INDEX "instance_api_key_apiKey_idx" ON "instance_api_key"("apiKey");

-- CreateIndex
CREATE INDEX "article_authorId_idx" ON "article"("authorId");

-- CreateIndex
CREATE INDEX "article_category_idx" ON "article"("category");

-- CreateIndex
CREATE INDEX "article_draft_authorId_idx" ON "article_draft"("authorId");

-- CreateIndex
CREATE INDEX "article_draft_articleId_idx" ON "article_draft"("articleId");

-- CreateIndex
CREATE INDEX "article_draft_status_idx" ON "article_draft"("status");

-- AddForeignKey
ALTER TABLE "instance_api_key" ADD CONSTRAINT "instance_api_key_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_draft" ADD CONSTRAINT "article_draft_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_draft" ADD CONSTRAINT "article_draft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
