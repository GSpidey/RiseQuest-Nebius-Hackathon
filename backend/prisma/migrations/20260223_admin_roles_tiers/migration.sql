-- Add tiered admin roles to UserRole enum
-- Postgres enums cannot drop values; only add.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    BEGIN
      ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAFF';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;

    BEGIN
      ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERADMIN';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;
  END IF;
END $$;
