-- DB V2 schema rollback (DOWN)
-- Date: 2026-02-17
-- NOTE: This removes only V2 tables. Existing legacy tables are untouched.

START TRANSACTION;

DROP TABLE IF EXISTS theme_version_payloads;
DROP TABLE IF EXISTS hypothesis_nodes;
DROP TABLE IF EXISTS hypothesis_spreads;
DROP TABLE IF EXISTS keyword_edges;
DROP TABLE IF EXISTS keyword_nodes;
DROP TABLE IF EXISTS theme_versions;
DROP TABLE IF EXISTS themes;

COMMIT;
