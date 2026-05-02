-- CreateTable
CREATE TABLE "linked_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "instanceDomain" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "acct" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "headerUrl" TEXT,
    "bio" TEXT,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "followingCount" INTEGER NOT NULL DEFAULT 0,
    "statusesCount" INTEGER NOT NULL DEFAULT 0,
    "profileUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linked_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_profile_hashtag" (
    "id" TEXT NOT NULL,
    "linkedProfileId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "normalizedTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_profile_hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "linked_profile_platform_instanceDomain_externalAccountId_key" ON "linked_profile"("platform", "instanceDomain", "externalAccountId");

-- CreateIndex
CREATE INDEX "linked_profile_userId_idx" ON "linked_profile"("userId");

-- CreateIndex
CREATE INDEX "linked_profile_platform_idx" ON "linked_profile"("platform");

-- CreateIndex
CREATE INDEX "linked_profile_acct_idx" ON "linked_profile"("acct");

-- CreateIndex
CREATE UNIQUE INDEX "linked_profile_hashtag_linkedProfileId_normalizedTag_key" ON "linked_profile_hashtag"("linkedProfileId", "normalizedTag");

-- CreateIndex
CREATE INDEX "linked_profile_hashtag_normalizedTag_idx" ON "linked_profile_hashtag"("normalizedTag");

-- CreateIndex
CREATE INDEX "linked_profile_hashtag_linkedProfileId_idx" ON "linked_profile_hashtag"("linkedProfileId");

-- AddForeignKey
ALTER TABLE "linked_profile" ADD CONSTRAINT "linked_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_profile_hashtag" ADD CONSTRAINT "linked_profile_hashtag_linkedProfileId_fkey" FOREIGN KEY ("linkedProfileId") REFERENCES "linked_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
