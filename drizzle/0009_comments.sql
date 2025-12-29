-- Comments Table
-- Supports nested comments (replies) via parent_id

CREATE TABLE IF NOT EXISTS "comments" (
  "id" text PRIMARY KEY NOT NULL,
  "item_id" text NOT NULL REFERENCES "catalog_items"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "parent_id" text, -- For nested comments (self-reference added after table creation)
  "content" text NOT NULL,
  "likes" integer NOT NULL DEFAULT 0,
  "is_edited" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Add self-reference for parent_id
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE;

-- Indexes for comments
CREATE INDEX IF NOT EXISTS "comments_item_id_idx" ON "comments" ("item_id");
CREATE INDEX IF NOT EXISTS "comments_user_id_idx" ON "comments" ("user_id");
CREATE INDEX IF NOT EXISTS "comments_parent_id_idx" ON "comments" ("parent_id");
CREATE INDEX IF NOT EXISTS "comments_created_at_idx" ON "comments" ("created_at");

-- Comment Likes Table
-- Junction table for tracking who liked which comment

CREATE TABLE IF NOT EXISTS "comment_likes" (
  "comment_id" text NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("comment_id", "user_id")
);
