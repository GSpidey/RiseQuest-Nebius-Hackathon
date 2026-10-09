-- Alarm events
CREATE TABLE IF NOT EXISTS "alarm_events" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "alarm_id" TEXT,
  "type" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "alarm_events_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "alarm_events_user_id_idx" ON "alarm_events"("user_id");
CREATE INDEX IF NOT EXISTS "alarm_events_created_at_idx" ON "alarm_events"("created_at");

-- Coach chat messages
CREATE TABLE IF NOT EXISTS "coach_chat_messages" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "personality" TEXT NOT NULL DEFAULT 'motivational',
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "coach_chat_messages_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "coach_chat_messages_user_id_idx" ON "coach_chat_messages"("user_id");
CREATE INDEX IF NOT EXISTS "coach_chat_messages_created_at_idx" ON "coach_chat_messages"("created_at");
