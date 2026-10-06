-- 探究プロセスマップ schema migration (UP)
-- Date: 2026-10-06
-- 前提: 20260217_db_v2_up.sql が適用済みであること

START TRANSACTION;

CREATE TABLE IF NOT EXISTS process_maps (
  map_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  theme_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  grain_size VARCHAR(64) NOT NULL DEFAULT '研究全体',
  is_root TINYINT(1) NOT NULL DEFAULT 0,
  root_theme_id BIGINT AS (CASE WHEN is_root = 1 THEN theme_id ELSE NULL END) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_process_maps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_process_maps_theme FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE,
  UNIQUE KEY uk_process_maps_root (user_id, root_theme_id),
  INDEX idx_process_maps_theme_updated (theme_id, updated_at)
);

CREATE TABLE IF NOT EXISTS process_nodes (
  node_id VARCHAR(64) PRIMARY KEY,
  map_id BIGINT NOT NULL,
  node_type VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  memo TEXT NULL,
  related_keywords_json JSON NULL,
  related_reference TEXT NULL,
  parent_node_id VARCHAR(64) NULL,
  existing_reference_type VARCHAR(64) NULL,
  existing_reference_id VARCHAR(255) NULL,
  x DOUBLE NULL,
  y DOUBLE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_process_nodes_map FOREIGN KEY (map_id) REFERENCES process_maps(map_id) ON DELETE CASCADE,
  INDEX idx_process_nodes_map_updated (map_id, updated_at),
  INDEX idx_process_nodes_parent (parent_node_id)
);

CREATE TABLE IF NOT EXISTS process_edges (
  edge_id VARCHAR(64) PRIMARY KEY,
  map_id BIGINT NOT NULL,
  source_node_id VARCHAR(64) NOT NULL,
  target_node_id VARCHAR(64) NOT NULL,
  edge_type VARCHAR(64) NOT NULL DEFAULT 'directed',
  reasoning_text TEXT NULL,
  memo TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_process_edges_map FOREIGN KEY (map_id) REFERENCES process_maps(map_id) ON DELETE CASCADE,
  CONSTRAINT fk_process_edges_source FOREIGN KEY (source_node_id) REFERENCES process_nodes(node_id) ON DELETE CASCADE,
  CONSTRAINT fk_process_edges_target FOREIGN KEY (target_node_id) REFERENCES process_nodes(node_id) ON DELETE CASCADE,
  INDEX idx_process_edges_map (map_id),
  INDEX idx_process_edges_source (source_node_id),
  INDEX idx_process_edges_target (target_node_id)
);

CREATE TABLE IF NOT EXISTS process_hierarchy (
  parent_map_id BIGINT NOT NULL,
  child_map_id BIGINT NOT NULL,
  parent_node_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_map_id, child_map_id),
  UNIQUE KEY uk_process_hierarchy_child (child_map_id),
  UNIQUE KEY uk_process_hierarchy_parent_node (parent_node_id),
  CONSTRAINT fk_process_hierarchy_parent_map FOREIGN KEY (parent_map_id) REFERENCES process_maps(map_id) ON DELETE CASCADE,
  CONSTRAINT fk_process_hierarchy_child_map FOREIGN KEY (child_map_id) REFERENCES process_maps(map_id) ON DELETE CASCADE,
  CONSTRAINT fk_process_hierarchy_parent_node FOREIGN KEY (parent_node_id) REFERENCES process_nodes(node_id) ON DELETE RESTRICT,
  INDEX idx_process_hierarchy_parent (parent_map_id)
);

COMMIT;
