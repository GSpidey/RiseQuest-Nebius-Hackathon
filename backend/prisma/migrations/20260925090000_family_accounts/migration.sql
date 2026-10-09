CREATE TABLE "family_consents" (
 "id" TEXT PRIMARY KEY, "parent_id" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'AWAITING_EMAIL', "notice_version" TEXT NOT NULL,
 "email_token_hash" TEXT, "email_token_expires_at" TIMESTAMP(3), "email_verified_at" TIMESTAMP(3),
 "document" BYTEA, "document_hash" TEXT, "reviewed_by" TEXT, "reviewed_at" TIMESTAMP(3),
 "review_note" TEXT, "withdrawn_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "family_consents_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE,
 CONSTRAINT "family_consents_status_check" CHECK ("status" IN ('AWAITING_EMAIL','AWAITING_DOCUMENT','PENDING_REVIEW','APPROVED','DENIED','WITHDRAWN'))
);
CREATE INDEX "family_consents_parent_id_idx" ON "family_consents"("parent_id");
CREATE INDEX "family_consents_status_idx" ON "family_consents"("status");
CREATE TABLE "child_accounts" (
 "child_id" TEXT PRIMARY KEY, "parent_id" TEXT NOT NULL, "consent_id" TEXT NOT NULL UNIQUE, "ads_consent" BOOLEAN NOT NULL DEFAULT false,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "child_account_child_fk" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE,
 CONSTRAINT "child_account_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE,
 CONSTRAINT "child_account_consent_fk" FOREIGN KEY ("consent_id") REFERENCES "family_consents"("id") ON DELETE RESTRICT,
 CONSTRAINT "child_not_parent" CHECK ("child_id" <> "parent_id")
);
CREATE INDEX "child_accounts_parent_id_idx" ON "child_accounts"("parent_id");
