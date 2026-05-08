-- CreateTable
CREATE TABLE "auth_flow_state" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_flow_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_flow_state_state_key" ON "auth_flow_state"("state");

-- CreateIndex
CREATE INDEX "auth_flow_state_kind_idx" ON "auth_flow_state"("kind");

-- CreateIndex
CREATE INDEX "auth_flow_state_expiresAt_idx" ON "auth_flow_state"("expiresAt");
