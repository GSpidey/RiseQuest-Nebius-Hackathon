CREATE TABLE "store_accounts" ("id" UUID PRIMARY KEY, "user_id" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE);
CREATE TABLE "store_purchases" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "store" TEXT NOT NULL CHECK ("store" IN ('apple','google')), "product_id" TEXT NOT NULL,
  "original_id" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL,
  "environment" TEXT NOT NULL, "expires_at" TIMESTAMP(3), "observed_at" TIMESTAMP(3) NOT NULL, "token" BYTEA,
  "points_granted" INTEGER NOT NULL DEFAULT 0 CHECK ("points_granted" >= 0),
  "points_recovered" INTEGER NOT NULL DEFAULT 0 CHECK ("points_recovered" >= 0),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "store_purchases_user_id_kind_expires_at_idx" ON "store_purchases"("user_id","kind","expires_at");
CREATE INDEX "store_purchases_store_original_id_idx" ON "store_purchases"("store","original_id");
CREATE TABLE "store_notifications" ("id" TEXT PRIMARY KEY, "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
