-- Final drop after archive verification
-- Run only after confirming system stability with *_legacy_20260217 tables present.

DROP TABLE IF EXISTS user_themes_legacy_20260217;
DROP TABLE IF EXISTS node_keyword_legacy_20260217;
DROP TABLE IF EXISTS node_edge_legacy_20260217;
DROP TABLE IF EXISTS hypothesis_spread_legacy_20260217;
DROP TABLE IF EXISTS node_hypothesis_legacy_20260217;

-- direct cleanup when archive step is skipped
DROP TABLE IF EXISTS node_keyword;
DROP TABLE IF EXISTS node_edge;
