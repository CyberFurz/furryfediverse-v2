
-- CreateTable
CREATE TABLE "pack_audit_log" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pack_audit_log_packId_createdAt_idx" ON "pack_audit_log"("packId", "createdAt");

-- AddForeignKey
ALTER TABLE "pack_audit_log" ADD CONSTRAINT "pack_audit_log_packId_fkey" FOREIGN KEY ("packId") REFERENCES "starter_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_audit_log" ADD CONSTRAINT "pack_audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

