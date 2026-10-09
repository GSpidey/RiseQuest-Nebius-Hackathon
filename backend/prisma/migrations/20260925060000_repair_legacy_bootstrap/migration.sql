-- Older date-only migrations sorted auth before init and role expansion before
-- enum creation. Repair fresh installs without changing deployed checksums.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "auth_provider" TEXT;
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERADMIN';
