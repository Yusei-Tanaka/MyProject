-- DB V2 schema migration (UP)
-- Date: 2026-02-17

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS themes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  theme_name VARCHAR(255) NOT NULL,
  latest_version_no INT NOT NULL DEFAULT 0,
  lock_version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  is_active TINYINT(1) AS (CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) STORED,
  CONSTRAINT fk_themes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_themes_user_updated (user_id, updated_at),
  INDEX idx_themes_user_deleted (user_id, deleted_at),
  UNIQUE KEY uk_themes_user_name_active (user_id, theme_name, is_active)
);

CREATE TABLE IF NOT EXISTS theme_versions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  theme_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  saved_by_user_id VARCHAR(64) NULL,
  saved_at DATETIME NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_theme_versions_theme FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE,
  CONSTRAINT fk_theme_versions_saved_by FOREIGN KEY (saved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uk_theme_versions_theme_version (theme_id, version_no),
  INDEX idx_theme_versions_theme_saved_at (theme_id, saved_at)
);

CREATE TABLE IF NOT EXISTS keyword_nodes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  theme_version_id BIGINT NOT NULL,
  client_node_id VARCHAR(128) NOT NULL,
  label VARCHAR(255) NOT NULL,
  node_type VARCHAR(64) NOT NULL DEFAULT 'keyword',
  x DOUBLE NULL,
  y DOUBLE NULL,
  props_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_keyword_nodes_version FOREIGN KEY (theme_version_id) REFERENCES theme_versions(id) ON DELETE CASCADE,
  UNIQUE KEY uk_keyword_nodes_client (theme_version_id, client_node_id),
  INDEX idx_keyword_nodes_label (label)
);

CREATE TABLE IF NOT EXISTS keyword_edges (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  theme_version_id BIGINT NOT NULL,
  client_edge_id VARCHAR(128) NULL,
  src_client_node_id VARCHAR(128) NOT NULL,
  dst_client_node_id VARCHAR(128) NOT NULL,
  relation VARCHAR(255) NULL,
  props_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_keyword_edges_version FOREIGN KEY (theme_version_id) REFERENCES theme_versions(id) ON DELETE CASCADE,
  INDEX idx_keyword_edges_version_src (theme_version_id, src_client_node_id),
  INDEX idx_keyword_edges_version_dst (theme_version_id, dst_client_node_id)
);

CREATE TABLE IF NOT EXISTS hypothesis_spreads (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  theme_version_id BIGINT NOT NULL,
  hypothesis_saved_at DATETIME NULL,
  hypothesis_node_count INT NOT NULL DEFAULT 0,
  hypothesis_summary_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_hypothesis_spreads_version FOREIGN KEY (theme_version_id) REFERENCES theme_versions(id) ON DELETE CASCADE,
  UNIQUE KEY uk_hypothesis_spreads_version (theme_version_id)
);

CREATE TABLE IF NOT EXISTS hypothesis_nodes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  hypothesis_spread_id BIGINT NOT NULL,
  node_text TEXT NOT NULL,
  node_kind VARCHAR(32) NOT NULL DEFAULT 'hypothesis',
  node_order INT NOT NULL DEFAULT 0,
  based_keywords TEXT NULL,
  scamper_tag VARCHAR(255) NULL,
  props_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hypothesis_nodes_spread FOREIGN KEY (hypothesis_spread_id) REFERENCES hypothesis_spreads(id) ON DELETE CASCADE,
  INDEX idx_hypothesis_nodes_spread_order (hypothesis_spread_id, node_order),
  INDEX idx_hypothesis_nodes_spread_created (hypothesis_spread_id, created_at)
);

CREATE TABLE IF NOT EXISTS theme_version_payloads (
  theme_version_id BIGINT PRIMARY KEY,
  content_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_theme_version_payloads_version FOREIGN KEY (theme_version_id) REFERENCES theme_versions(id) ON DELETE CASCADE
);

COMMIT;
