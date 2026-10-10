-- Remove the Learn (articles) feature.
-- IF EXISTS keeps this safe for databases where the tables were never created.

-- Drop draft first (it references article).
DROP TABLE IF EXISTS "article_draft";
DROP TABLE IF EXISTS "article";

-- The "reviewer" role only existed for article review; strip it from users.
-- Roles may be stored comma-separated (e.g. "admin,reviewer").
UPDATE "user"
SET "role" = COALESCE(NULLIF(
  array_to_string(array_remove(string_to_array(replace("role", ' ', ''), ','), 'reviewer'), ','),
  ''
), 'user')
WHERE "role" IS NOT NULL
  AND 'reviewer' = ANY(string_to_array(replace("role", ' ', ''), ','));
