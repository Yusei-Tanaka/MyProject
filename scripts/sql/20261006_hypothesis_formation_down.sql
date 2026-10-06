-- 仮説形成MVP schema migration (DOWN)
-- 注意: 実行するとリンクに保存したreasoningとメモが失われる。

ALTER TABLE process_edges
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS memo,
  DROP COLUMN IF EXISTS reasoning_text;
