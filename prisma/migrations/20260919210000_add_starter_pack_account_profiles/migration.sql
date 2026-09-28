-- AlterTable: handle-based starter pack accounts can carry display
-- metadata (name / avatar / profile URL) captured at add time, so the
-- published pack page can render them instead of a bare handle.

ALTER TABLE "starter_pack_account" ADD COLUMN "displayName" TEXT,
ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "profileUrl" TEXT;