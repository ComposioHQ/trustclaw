-- CreateTable
CREATE TABLE "invite_code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedByUser" TEXT,
    "note" TEXT,

    CONSTRAINT "invite_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_code_key" ON "invite_code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_usedByUser_key" ON "invite_code"("usedByUser");
