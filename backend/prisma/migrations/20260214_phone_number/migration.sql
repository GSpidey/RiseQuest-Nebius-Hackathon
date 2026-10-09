-- Add phone number support for email/password auth

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_number" TEXT;

-- Unique constraint for phone numbers (allows multiple NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'users_phone_number_key'
  ) THEN
    CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");
  END IF;
END $$;
