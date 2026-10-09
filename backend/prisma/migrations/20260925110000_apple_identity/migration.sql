CREATE TABLE "apple_identities" (
  "subject" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_token" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "auth_challenges" (
  "id" TEXT PRIMARY KEY,
  "nonce_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3)
);
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges"("expires_at");
