-- Migration: Add exercise action types to skill_event_action enum (DEV-3064)
-- Note: ALTER TYPE ADD VALUE cannot run inside a transaction in PostgreSQL

ALTER TYPE skill_event_action ADD VALUE IF NOT EXISTS 'exercise_search';
ALTER TYPE skill_event_action ADD VALUE IF NOT EXISTS 'exercise_apply';
