#!/usr/bin/env node
require("dotenv").config({ override: true });

const mysql = require("mysql2/promise");

const tableColumnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.execute(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1",
    [tableName, columnName]
  );
  return rows.length > 0;
};

const getForeignKeyName = async (connection, tableName, columnName, referencedTableName) => {
  const [rows] = await connection.execute(
    `SELECT constraint_name
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        AND referenced_table_name = ?
      LIMIT 1`,
    [tableName, columnName, referencedTableName]
  );
  return rows.length > 0 ? rows[0].constraint_name : null;
};

const hasIndex = async (connection, tableName, indexName) => {
  const [rows] = await connection.execute(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
    [tableName, indexName]
  );
  return rows.length > 0;
};

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: "Z",
  });

  try {
    await connection.beginTransaction();

    const hasSpreadHtml = await tableColumnExists(connection, "hypothesis_spreads", "hypothesis_html");
    const hasLegacyThemeVersionId = await tableColumnExists(connection, "hypothesis_nodes", "theme_version_id");
    const hasSpreadRef = await tableColumnExists(connection, "hypothesis_nodes", "hypothesis_spread_id");

    if (!hasSpreadRef) {
      await connection.execute("ALTER TABLE hypothesis_nodes ADD COLUMN hypothesis_spread_id BIGINT NULL");
      console.log("added hypothesis_nodes.hypothesis_spread_id");
    }

    if (hasLegacyThemeVersionId) {
      const upsertSpreadSql = hasSpreadHtml
        ? `INSERT INTO hypothesis_spreads (theme_version_id, hypothesis_html, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json)
           SELECT hn.theme_version_id, '', NULL, COUNT(*), JSON_OBJECT('schemaVersion', 2, 'totalCount', COUNT(*))
             FROM hypothesis_nodes hn
             LEFT JOIN hypothesis_spreads hs ON hs.theme_version_id = hn.theme_version_id
            WHERE hs.id IS NULL
            GROUP BY hn.theme_version_id
           ON DUPLICATE KEY UPDATE
             hypothesis_node_count = VALUES(hypothesis_node_count),
             updated_at = CURRENT_TIMESTAMP`
        : `INSERT INTO hypothesis_spreads (theme_version_id, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json)
           SELECT hn.theme_version_id, NULL, COUNT(*), JSON_OBJECT('schemaVersion', 2, 'totalCount', COUNT(*))
             FROM hypothesis_nodes hn
             LEFT JOIN hypothesis_spreads hs ON hs.theme_version_id = hn.theme_version_id
            WHERE hs.id IS NULL
            GROUP BY hn.theme_version_id
           ON DUPLICATE KEY UPDATE
             hypothesis_node_count = VALUES(hypothesis_node_count),
             updated_at = CURRENT_TIMESTAMP`;

      await connection.execute(upsertSpreadSql);

      await connection.execute(
        `UPDATE hypothesis_nodes hn
           INNER JOIN hypothesis_spreads hs ON hs.theme_version_id = hn.theme_version_id
           SET hn.hypothesis_spread_id = hs.id
         WHERE hn.hypothesis_spread_id IS NULL`
      );
      console.log("migrated hypothesis_nodes theme_version_id -> hypothesis_spread_id");
    }

    const [nullRows] = await connection.execute(
      "SELECT COUNT(*) AS c FROM hypothesis_nodes WHERE hypothesis_spread_id IS NULL"
    );
    if (Number(nullRows[0]?.c || 0) > 0) {
      throw new Error("hypothesis_spread_id に NULL が残っているため移行を中断しました");
    }

    const legacyFkName = await getForeignKeyName(
      connection,
      "hypothesis_nodes",
      "theme_version_id",
      "theme_versions"
    );
    if (legacyFkName) {
      await connection.execute(`ALTER TABLE hypothesis_nodes DROP FOREIGN KEY ${legacyFkName}`);
      console.log(`dropped legacy FK: ${legacyFkName}`);
    }

    if (await hasIndex(connection, "hypothesis_nodes", "idx_hypothesis_nodes_version_order")) {
      await connection.execute("ALTER TABLE hypothesis_nodes DROP INDEX idx_hypothesis_nodes_version_order");
      console.log("dropped index idx_hypothesis_nodes_version_order");
    }
    if (await hasIndex(connection, "hypothesis_nodes", "idx_hypothesis_nodes_version_created")) {
      await connection.execute("ALTER TABLE hypothesis_nodes DROP INDEX idx_hypothesis_nodes_version_created");
      console.log("dropped index idx_hypothesis_nodes_version_created");
    }

    await connection.execute("ALTER TABLE hypothesis_nodes MODIFY COLUMN hypothesis_spread_id BIGINT NOT NULL");

    const spreadFkName = await getForeignKeyName(
      connection,
      "hypothesis_nodes",
      "hypothesis_spread_id",
      "hypothesis_spreads"
    );
    if (!spreadFkName) {
      await connection.execute(
        "ALTER TABLE hypothesis_nodes ADD CONSTRAINT fk_hypothesis_nodes_spread FOREIGN KEY (hypothesis_spread_id) REFERENCES hypothesis_spreads(id) ON DELETE CASCADE"
      );
      console.log("added FK fk_hypothesis_nodes_spread");
    }

    if (!(await hasIndex(connection, "hypothesis_nodes", "idx_hypothesis_nodes_spread_order"))) {
      await connection.execute(
        "ALTER TABLE hypothesis_nodes ADD INDEX idx_hypothesis_nodes_spread_order (hypothesis_spread_id, node_order)"
      );
      console.log("added index idx_hypothesis_nodes_spread_order");
    }
    if (!(await hasIndex(connection, "hypothesis_nodes", "idx_hypothesis_nodes_spread_created"))) {
      await connection.execute(
        "ALTER TABLE hypothesis_nodes ADD INDEX idx_hypothesis_nodes_spread_created (hypothesis_spread_id, created_at)"
      );
      console.log("added index idx_hypothesis_nodes_spread_created");
    }

    if (hasSpreadHtml) {
      await connection.execute("ALTER TABLE hypothesis_spreads DROP COLUMN hypothesis_html");
      console.log("dropped hypothesis_spreads.hypothesis_html");
    }

    if (hasLegacyThemeVersionId) {
      await connection.execute("ALTER TABLE hypothesis_nodes DROP COLUMN theme_version_id");
      console.log("dropped hypothesis_nodes.theme_version_id");
    }

    await connection.commit();
    console.log("migration complete: hypothesis schema normalized");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
})().catch((error) => {
  console.error("migration failed:", error.message || error);
  process.exit(1);
});
