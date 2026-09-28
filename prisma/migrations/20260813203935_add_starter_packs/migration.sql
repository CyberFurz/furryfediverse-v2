
-- CreateTable
CREATE TABLE "starter_pack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "numAccounts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "starter_pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "starter_pack_account" (
    "id" TEXT NOT NULL,
    "starterPackId" TEXT NOT NULL,
    "linkedProfileId" TEXT,
    "handle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "starter_pack_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_all_click" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "starterPackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_all_click_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "starter_pack_status_idx" ON "starter_pack"("status");

-- CreateIndex
CREATE INDEX "starter_pack_publishedAt_idx" ON "starter_pack"("publishedAt");

-- CreateIndex
CREATE INDEX "starter_pack_deletedAt_idx" ON "starter_pack"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "starter_pack_createdById_slug_key" ON "starter_pack"("createdById", "slug");

-- CreateIndex
CREATE INDEX "starter_pack_account_starterPackId_idx" ON "starter_pack_account"("starterPackId");

-- CreateIndex
CREATE UNIQUE INDEX "starter_pack_account_starterPackId_linkedProfileId_key" ON "starter_pack_account"("starterPackId", "linkedProfileId");

-- CreateIndex
CREATE INDEX "follow_all_click_starterPackId_createdAt_idx" ON "follow_all_click"("starterPackId", "createdAt");

-- AddForeignKey
ALTER TABLE "starter_pack" ADD CONSTRAINT "starter_pack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_pack_account" ADD CONSTRAINT "starter_pack_account_starterPackId_fkey" FOREIGN KEY ("starterPackId") REFERENCES "starter_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_pack_account" ADD CONSTRAINT "starter_pack_account_linkedProfileId_fkey" FOREIGN KEY ("linkedProfileId") REFERENCES "linked_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_pack_account" ADD CONSTRAINT "starter_pack_account_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_all_click" ADD CONSTRAINT "follow_all_click_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_all_click" ADD CONSTRAINT "follow_all_click_starterPackId_fkey" FOREIGN KEY ("starterPackId") REFERENCES "starter_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

