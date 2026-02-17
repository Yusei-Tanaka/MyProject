-- Legacy theme tables precheck
-- Run this before archiving/dropping legacy tables.

SELECT 'v2_schema_tables' AS check_name,
       SUM(CASE WHEN table_name IN ('themes','theme_versions','hypothesis_spreads','hypothesis_nodes','theme_version_payloads') THEN 1 ELSE 0 END) AS existing_count,
       5 AS required_count
  FROM information_schema.tables
 WHERE table_schema = DATABASE();

SELECT 'legacy_user_themes_count' AS check_name, COUNT(*) AS row_count FROM user_themes;
SELECT 'v2_themes_count' AS check_name, COUNT(*) AS row_count FROM themes;
SELECT 'legacy_hypothesis_spread_count' AS check_name, COUNT(*) AS row_count FROM hypothesis_spread;
SELECT 'v2_hypothesis_spreads_count' AS check_name, COUNT(*) AS row_count FROM hypothesis_spreads;
SELECT 'legacy_node_hypothesis_count' AS check_name, COUNT(*) AS row_count FROM node_hypothesis;
SELECT 'v2_hypothesis_nodes_count' AS check_name, COUNT(*) AS row_count FROM hypothesis_nodes;

-- Sample diff checks (top recent rows)
SELECT 'legacy_recent_themes' AS sample_name, user_id, theme_name, updated_at
  FROM user_themes
 ORDER BY updated_at DESC
 LIMIT 20;

SELECT 'v2_recent_themes' AS sample_name, t.user_id, t.theme_name, tv.created_at AS updated_at
  FROM themes t
  JOIN theme_versions tv ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
 WHERE t.deleted_at IS NULL
 ORDER BY tv.created_at DESC
 LIMIT 20;
