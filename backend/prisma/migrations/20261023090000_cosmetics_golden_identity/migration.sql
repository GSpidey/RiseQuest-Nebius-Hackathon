BEGIN;
-- CreateTable
CREATE TABLE "cosmetic_ownership" (
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cosmetic_ownership_pkey" PRIMARY KEY ("user_id","item_id")
);

-- CreateTable
CREATE TABLE "cosmetic_loadouts" (
    "user_id" TEXT NOT NULL,
    "theme_id" TEXT,
    "sound_id" TEXT,
    "animation_id" TEXT,
    "badge_ids" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cosmetic_loadouts_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "cosmetic_themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "design" JSONB NOT NULL,
    "published" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cosmetic_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cosmetic_purchase_requests" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "consent_id" TEXT NOT NULL,
    "item_ids" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "cosmetic_purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_generations" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "result" JSONB,
    "diagnostic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "golden_identities" (
    "subject" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "golden_identities_pkey" PRIMARY KEY ("subject")
);

-- CreateTable
CREATE TABLE "golden_auth_sessions" (
    "id" TEXT NOT NULL,
    "poll_hash" TEXT NOT NULL,
    "secret" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" BYTEA,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "golden_auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cosmetic_purchase_requests_request_key_key" ON "cosmetic_purchase_requests"("request_key");

-- CreateIndex
CREATE INDEX "cosmetic_purchase_requests_parent_id_status_idx" ON "cosmetic_purchase_requests"("parent_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "golden_identities_user_id_key" ON "golden_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "golden_auth_sessions_poll_hash_key" ON "golden_auth_sessions"("poll_hash");

-- CreateIndex
CREATE INDEX "golden_auth_sessions_expires_at_idx" ON "golden_auth_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "cosmetic_ownership" ADD CONSTRAINT "cosmetic_ownership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosmetic_loadouts" ADD CONSTRAINT "cosmetic_loadouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosmetic_purchase_requests" ADD CONSTRAINT "cosmetic_purchase_requests_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cosmetic_purchase_requests" ADD CONSTRAINT "cosmetic_purchase_requests_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "golden_identities" ADD CONSTRAINT "golden_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
