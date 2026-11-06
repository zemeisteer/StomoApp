-- Timestamps are stored as UTC in "timestamp(3) without time zone" columns.
-- Raw SQL compares them with NOW() (timestamptz), which Postgres converts using
-- the session TimeZone. On a server whose default zone is e.g. Asia/Tashkent,
-- reminders became due 5 hours early. Pin the database default to UTC so every
-- new session (app, worker, scripts) interprets stored values correctly.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
