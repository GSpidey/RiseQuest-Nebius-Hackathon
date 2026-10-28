-- CreateTable
CREATE TABLE "recharge_agreements" (
    "user_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recharge_agreements_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "recharge_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agreement_revision" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "pack" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "stripe_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recharge_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recharge_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recharge_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recharge_attempts_stripe_id_key" ON "recharge_attempts"("stripe_id");

-- CreateIndex
CREATE INDEX "recharge_attempts_user_id_period_idx" ON "recharge_attempts"("user_id", "period");

-- CreateIndex
CREATE INDEX "recharge_attempts_status_updated_at_idx" ON "recharge_attempts"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "recharge_consents_user_id_revision_key" ON "recharge_consents"("user_id", "revision");

-- AddForeignKey
ALTER TABLE "recharge_agreements" ADD CONSTRAINT "recharge_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recharge_attempts" ADD CONSTRAINT "recharge_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recharge_consents" ADD CONSTRAINT "recharge_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
