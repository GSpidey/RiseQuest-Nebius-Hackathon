CREATE TABLE "account_deletions" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT UNIQUE, "owner_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "account_deletions_status_created_at_idx" ON "account_deletions"("status", "created_at");
