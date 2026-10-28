-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "due_at" TIMESTAMP(3),
ADD COLUMN     "energy_demand" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "lane" TEXT NOT NULL DEFAULT 'later',
ADD COLUMN     "last_progress_at" TIMESTAMP(3),
ADD COLUMN     "planned_at" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "companion_preferences" (
    "user_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companion_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "companion_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "quest_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companion_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_mood_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "valence" INTEGER NOT NULL,
    "energy" INTEGER NOT NULL,
    "focus" INTEGER NOT NULL,
    "restless" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_mood_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_mutations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_mutations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companion_notes_user_id_updated_at_idx" ON "companion_notes"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "companion_mood_entries_user_id_recorded_at_idx" ON "companion_mood_entries"("user_id", "recorded_at");

-- CreateIndex
CREATE INDEX "companion_mutations_user_id_created_at_idx" ON "companion_mutations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_usage_provider_created_at_idx" ON "provider_usage"("provider", "created_at");

-- CreateIndex
CREATE INDEX "provider_usage_user_id_provider_created_at_idx" ON "provider_usage"("user_id", "provider", "created_at");

-- AddForeignKey
ALTER TABLE "companion_preferences" ADD CONSTRAINT "companion_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_notes" ADD CONSTRAINT "companion_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_mood_entries" ADD CONSTRAINT "companion_mood_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_mutations" ADD CONSTRAINT "companion_mutations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

