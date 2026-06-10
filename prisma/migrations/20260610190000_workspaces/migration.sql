-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "username" VARCHAR(80) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","username")
);

-- AlterTable
ALTER TABLE "Drawing" ADD COLUMN "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "WorkspaceMember_username_idx" ON "WorkspaceMember"("username");

-- CreateIndex
CREATE INDEX "Drawing_workspaceId_idx" ON "Drawing"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
