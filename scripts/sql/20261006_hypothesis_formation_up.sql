-- 仮説形成MVP: reasoningをノードではなくリンク属性として保持する
-- 既存のprocess_edgesを非破壊で拡張する。列が既にある環境ではサーバー起動時の自動適用を利用すること。

ALTER TABLE process_edges
  ADD COLUMN IF NOT EXISTS reasoning_text TEXT NULL AFTER edge_type,
  ADD COLUMN IF NOT EXISTS memo TEXT NULL AFTER reasoning_text,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
