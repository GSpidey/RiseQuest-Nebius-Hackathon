-- Community core tables (settings, buddies, groups, posts, messaging, safety)

-- Settings per user
CREATE TABLE IF NOT EXISTS "community_settings" (
  "user_id" TEXT PRIMARY KEY,
  "opt_in" BOOLEAN NOT NULL DEFAULT FALSE,
  "visibility" TEXT NOT NULL DEFAULT 'BUDDIES',
  "teen_safety" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Buddy connections (pair-based)
CREATE TABLE IF NOT EXISTS "community_buddies" (
  "id" TEXT PRIMARY KEY,
  "user_a_id" TEXT NOT NULL,
  "user_b_id" TEXT NOT NULL,
  "requested_by_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_buddies_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "community_buddies_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "community_buddies_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='community_buddies_user_a_id_user_b_id_key'
  ) THEN
    CREATE UNIQUE INDEX "community_buddies_user_a_id_user_b_id_key" ON "community_buddies"("user_a_id", "user_b_id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "community_buddies_user_a_id_idx" ON "community_buddies"("user_a_id");
CREATE INDEX IF NOT EXISTS "community_buddies_user_b_id_idx" ON "community_buddies"("user_b_id");
CREATE INDEX IF NOT EXISTS "community_buddies_requested_by_id_idx" ON "community_buddies"("requested_by_id");

-- Groups
CREATE TABLE IF NOT EXISTS "community_groups" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "is_public" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_groups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "community_groups_topic_idx" ON "community_groups"("topic");
CREATE INDEX IF NOT EXISTS "community_groups_is_public_idx" ON "community_groups"("is_public");

CREATE TABLE IF NOT EXISTS "community_group_members" (
  "id" TEXT PRIMARY KEY,
  "group_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "community_groups"("id") ON DELETE CASCADE,
  CONSTRAINT "community_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='community_group_members_group_id_user_id_key'
  ) THEN
    CREATE UNIQUE INDEX "community_group_members_group_id_user_id_key" ON "community_group_members"("group_id", "user_id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "community_group_members_user_id_idx" ON "community_group_members"("user_id");

-- Posts, reactions, comments
CREATE TABLE IF NOT EXISTS "community_posts" (
  "id" TEXT PRIMARY KEY,
  "author_id" TEXT NOT NULL,
  "group_id" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'BUDDIES',
  "type" TEXT NOT NULL DEFAULT 'POST',
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "community_posts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "community_groups"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "community_posts_created_at_idx" ON "community_posts"("created_at");
CREATE INDEX IF NOT EXISTS "community_posts_author_id_idx" ON "community_posts"("author_id");
CREATE INDEX IF NOT EXISTS "community_posts_group_id_idx" ON "community_posts"("group_id");
CREATE INDEX IF NOT EXISTS "community_posts_visibility_idx" ON "community_posts"("visibility");

CREATE TABLE IF NOT EXISTS "community_post_reactions" (
  "id" TEXT PRIMARY KEY,
  "post_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "community_post_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='community_post_reactions_post_id_user_id_emoji_key'
  ) THEN
    CREATE UNIQUE INDEX "community_post_reactions_post_id_user_id_emoji_key" ON "community_post_reactions"("post_id", "user_id", "emoji");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "community_post_reactions_user_id_idx" ON "community_post_reactions"("user_id");

CREATE TABLE IF NOT EXISTS "community_post_comments" (
  "id" TEXT PRIMARY KEY,
  "post_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "community_post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "community_post_comments_post_id_idx" ON "community_post_comments"("post_id");
CREATE INDEX IF NOT EXISTS "community_post_comments_author_id_idx" ON "community_post_comments"("author_id");

-- Messaging
CREATE TABLE IF NOT EXISTS "community_message_threads" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL DEFAULT 'DIRECT',
  "direct_key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='community_message_threads_direct_key_key'
  ) THEN
    CREATE UNIQUE INDEX "community_message_threads_direct_key_key" ON "community_message_threads"("direct_key");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "community_thread_members" (
  "thread_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("thread_id", "user_id"),
  CONSTRAINT "community_thread_members_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "community_message_threads"("id") ON DELETE CASCADE,
  CONSTRAINT "community_thread_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "community_thread_members_user_id_idx" ON "community_thread_members"("user_id");

CREATE TABLE IF NOT EXISTS "community_messages" (
  "id" TEXT PRIMARY KEY,
  "thread_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "community_message_threads"("id") ON DELETE CASCADE,
  CONSTRAINT "community_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "community_messages_thread_id_idx" ON "community_messages"("thread_id");
CREATE INDEX IF NOT EXISTS "community_messages_sender_id_idx" ON "community_messages"("sender_id");
CREATE INDEX IF NOT EXISTS "community_messages_created_at_idx" ON "community_messages"("created_at");

-- Safety
CREATE TABLE IF NOT EXISTS "community_blocks" (
  "blocker_id" TEXT NOT NULL,
  "blocked_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("blocker_id", "blocked_id"),
  CONSTRAINT "community_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "community_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "community_blocks_blocked_id_idx" ON "community_blocks"("blocked_id");

CREATE TABLE IF NOT EXISTS "community_reports" (
  "id" TEXT PRIMARY KEY,
  "reporter_id" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "community_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "community_reports_target_idx" ON "community_reports"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "community_reports_reporter_id_idx" ON "community_reports"("reporter_id");
CREATE INDEX IF NOT EXISTS "community_reports_status_idx" ON "community_reports"("status");
