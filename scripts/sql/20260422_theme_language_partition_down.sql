-- Theme language partition migration (DOWN)
-- Date: 2026-04-22

START TRANSACTION;

ALTER TABLE themes
  DROP INDEX uk_themes_user_name_lang_active,
  DROP INDEX idx_themes_user_lang_updated,
  ADD UNIQUE KEY uk_themes_user_name_active (user_id, theme_name, is_active);

ALTER TABLE themes
  DROP COLUMN theme_language;

COMMIT;
