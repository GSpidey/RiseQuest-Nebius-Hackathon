-- Add banner URL to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banner_url" TEXT;
