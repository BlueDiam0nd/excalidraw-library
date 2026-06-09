-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "roomId" VARCHAR(64),
    "title" VARCHAR(200),
    "owner" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drawing_owner_idx" ON "Drawing"("owner");

-- CreateIndex
CREATE INDEX "Drawing_createdAt_idx" ON "Drawing"("createdAt");

-- CreateIndex
CREATE INDEX "Drawing_roomId_idx" ON "Drawing"("roomId");
