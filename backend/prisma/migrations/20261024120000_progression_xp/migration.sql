-- CreateTable
CREATE TABLE "xp_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "xp_grants_user_id_source_idx" ON "xp_grants"("user_id", "source");

-- AddForeignKey
ALTER TABLE "xp_grants" ADD CONSTRAINT "xp_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

