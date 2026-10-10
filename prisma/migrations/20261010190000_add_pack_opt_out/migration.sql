-- CreateTable
CREATE TABLE "pack_opt_out" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastDmSentAt" TIMESTAMP(3),
    "requestIpHash" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "pack_opt_out_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pack_opt_out_handle_key" ON "pack_opt_out"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "pack_opt_out_tokenHash_key" ON "pack_opt_out"("tokenHash");

-- CreateIndex
CREATE INDEX "pack_opt_out_status_idx" ON "pack_opt_out"("status");

-- CreateIndex
CREATE INDEX "pack_opt_out_requestIpHash_lastDmSentAt_idx" ON "pack_opt_out"("requestIpHash", "lastDmSentAt");
