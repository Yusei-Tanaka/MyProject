-- Archive legacy theme tables first (safe step)
-- This keeps rollback possible by renaming tables.

RENAME TABLE
  user_themes TO user_themes_legacy_20260217,
  node_keyword TO node_keyword_legacy_20260217,
  node_edge TO node_edge_legacy_20260217,
  hypothesis_spread TO hypothesis_spread_legacy_20260217,
  node_hypothesis TO node_hypothesis_legacy_20260217;
