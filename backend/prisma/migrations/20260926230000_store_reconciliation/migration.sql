ALTER TABLE "store_purchases" ADD COLUMN "last_reconciled_at" TIMESTAMP(3);
ALTER TABLE "store_purchases" ADD COLUMN "purchased_at" TIMESTAMP(3);
CREATE INDEX "store_purchases_store_last_reconciled_at_idx" ON "store_purchases"("store", "last_reconciled_at");
