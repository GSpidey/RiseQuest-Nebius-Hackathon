-- Add email/password auth fields to users

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT;
