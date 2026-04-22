-- Theme language partition migration (UP)
-- Date: 2026-04-22

START TRANSACTION;

ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS theme_language VARCHAR(8) NOT NULL DEFAULT 'ja' AFTER theme_name;

-- Backfill language from latest payload when available, otherwise infer from theme_name.
UPDATE themes t
LEFT JOIN theme_versions tv
  ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
LEFT JOIN theme_version_payloads p
  ON p.theme_version_id = tv.id
SET t.theme_language = CASE
  WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(p.content_json, '$.language'))) LIKE 'en%' THEN 'en'
  WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(p.content_json, '$.language'))) LIKE 'ja%' THEN 'ja'
  WHEN t.theme_name REGEXP '[ぁ-んァ-ヶ一-龠々]' THEN 'ja'
  WHEN t.theme_name REGEXP '[A-Za-z]' THEN 'en'
  ELSE t.theme_language
END;

ALTER TABLE themes
  DROP INDEX uk_themes_user_name_active,
  ADD INDEX idx_themes_user_lang_updated (user_id, theme_language, updated_at),
  ADD UNIQUE KEY uk_themes_user_name_lang_active (user_id, theme_name, theme_language, is_active);

COMMIT;
