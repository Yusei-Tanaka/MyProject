-- 探究プロセスマップ schema migration (DOWN)
-- このスクリプトを実行すると、探究プロセスマップの全データが削除されます。

START TRANSACTION;

DROP TABLE IF EXISTS process_hierarchy;
DROP TABLE IF EXISTS process_edges;
DROP TABLE IF EXISTS process_nodes;
DROP TABLE IF EXISTS process_maps;

COMMIT;
