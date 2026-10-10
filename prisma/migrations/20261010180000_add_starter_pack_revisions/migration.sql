-- AlterTable
ALTER TABLE "starter_pack" ADD COLUMN     "revisionOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "starter_pack_revisionOfId_key" ON "starter_pack"("revisionOfId");

-- AddForeignKey
ALTER TABLE "starter_pack" ADD CONSTRAINT "starter_pack_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "starter_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
