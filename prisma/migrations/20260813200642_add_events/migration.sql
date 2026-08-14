
-- AlterTable
ALTER TABLE "instance" ADD COLUMN     "pollingAllowed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "archivedDate" TIMESTAMP(3),
    "website" TEXT NOT NULL DEFAULT '',
    "mastodon" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "postsAfter" TIMESTAMP(3),
    "instances" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "days" TEXT NOT NULL DEFAULT '',
    "dayStyles" TEXT NOT NULL DEFAULT '',
    "tagBlacklist" TEXT NOT NULL DEFAULT '',
    "numberMatch" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "splashImage" TEXT NOT NULL DEFAULT '',
    "splashImageSignature" TEXT NOT NULL DEFAULT '',
    "splashImageUpdatedAt" TIMESTAMP(3),
    "splashImageNeedsUpdate" BOOLEAN NOT NULL DEFAULT false,
    "numPosts" INTEGER NOT NULL DEFAULT 0,
    "numAccounts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_lookup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "language" TEXT NOT NULL,

    CONSTRAINT "event_lookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_account" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "displayName" TEXT,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "event_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_post" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "favouritesCount" INTEGER,
    "reblogsCount" INTEGER,
    "repliesCount" INTEGER,
    "visibility" TEXT,
    "accountId" TEXT,
    "content" TEXT,
    "url" TEXT,
    "sourceInstance" TEXT,
    "mediaCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_poll_log" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "newPosts" INTEGER NOT NULL DEFAULT 0,
    "totalPosts" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT NOT NULL DEFAULT '',
    "triggeredBy" TEXT,

    CONSTRAINT "event_poll_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "min_id" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "minId" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "min_id_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_createdById_idx" ON "event"("createdById");

-- CreateIndex
CREATE INDEX "event_status_idx" ON "event"("status");

-- CreateIndex
CREATE INDEX "event_publishedAt_idx" ON "event"("publishedAt");

-- CreateIndex
CREATE INDEX "event_deletedAt_idx" ON "event"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_slug_key" ON "event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "event_lookup_eventId_language_key" ON "event_lookup"("eventId", "language");

-- CreateIndex
CREATE INDEX "event_account_eventId_idx" ON "event_account"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_account_eventId_accountId_key" ON "event_account"("eventId", "accountId");

-- CreateIndex
CREATE INDEX "event_post_eventId_createdAt_idx" ON "event_post"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "event_post_eventId_favouritesCount_idx" ON "event_post"("eventId", "favouritesCount");

-- CreateIndex
CREATE INDEX "event_post_eventId_reblogsCount_idx" ON "event_post"("eventId", "reblogsCount");

-- CreateIndex
CREATE INDEX "event_post_eventId_repliesCount_idx" ON "event_post"("eventId", "repliesCount");

-- CreateIndex
CREATE INDEX "event_post_eventId_accountId_createdAt_idx" ON "event_post"("eventId", "accountId", "createdAt");

-- CreateIndex
CREATE INDEX "event_post_eventId_accountId_favouritesCount_idx" ON "event_post"("eventId", "accountId", "favouritesCount");

-- CreateIndex
CREATE INDEX "event_post_eventId_accountId_reblogsCount_idx" ON "event_post"("eventId", "accountId", "reblogsCount");

-- CreateIndex
CREATE INDEX "event_post_eventId_accountId_repliesCount_idx" ON "event_post"("eventId", "accountId", "repliesCount");

-- CreateIndex
CREATE UNIQUE INDEX "event_post_eventId_postId_key" ON "event_post"("eventId", "postId");

-- CreateIndex
CREATE INDEX "event_poll_log_eventId_idx" ON "event_poll_log"("eventId");

-- CreateIndex
CREATE INDEX "event_poll_log_startedAt_idx" ON "event_poll_log"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "min_id_eventId_instance_key" ON "min_id"("eventId", "instance");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_lookup" ADD CONSTRAINT "event_lookup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_account" ADD CONSTRAINT "event_account_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_account" ADD CONSTRAINT "event_account_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_post" ADD CONSTRAINT "event_post_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_poll_log" ADD CONSTRAINT "event_poll_log_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "min_id" ADD CONSTRAINT "min_id_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

