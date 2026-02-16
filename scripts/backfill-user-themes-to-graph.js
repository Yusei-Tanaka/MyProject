#!/usr/bin/env node
require("dotenv").config({ override: true });

const mysql = require("mysql2/promise");

const args = process.argv.slice(2);
const argMap = new Map();
for (let i = 0; i < args.length; i += 1) {
  const key = args[i];
  const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
  if (value !== "true") i += 1;
  argMap.set(key, value);
}

const dryRun = argMap.get("--dry-run") === "true";
const targetUserId = String(argMap.get("--user") || "").trim();
const targetThemeName = String(argMap.get("--theme") || "").trim();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "appuser",
  password: process.env.DB_PASSWORD || "app_pass",
  database: process.env.DB_NAME || "myapp",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  timezone: "Z",
});

const TABLES = {
  keywordNode: "node_keyword",
  keywordEdge: "node_edge",
};

const toObjectOrEmpty = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const parseContentJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const buildGraphSnapshot = (content) => {
  if (!content || typeof content !== "object") {
    return { nodes: [], edges: [] };
  }

  const rawNodes = Array.isArray(content.nodes) ? content.nodes : [];
  const rawEdges = Array.isArray(content.edges) ? content.edges : [];

  const nodes = rawNodes.map((node, index) => {
    const normalized = toObjectOrEmpty(node);
    const clientId = normalized.id ?? `node_${index + 1}`;
    const label = String(normalized.label ?? "").trim() || String(clientId);
    return {
      clientId: String(clientId),
      label,
      props: normalized,
    };
  });

  const edges = rawEdges.map((edge, index) => {
    const normalized = toObjectOrEmpty(edge);
    const from = normalized.from;
    const to = normalized.to;
    return {
      clientEdgeId: String(normalized.id ?? `edge_${index + 1}`),
      from: from === undefined || from === null ? "" : String(from),
      to: to === undefined || to === null ? "" : String(to),
      relation: String(normalized.label ?? normalized.relation ?? "").trim() || null,
      props: normalized,
    };
  });

  return { nodes, edges };
};

const syncGraphTables = async (connection, userId, themeName, content) => {
  const snapshot = buildGraphSnapshot(content);

  const [existingNodeRows] = await connection.execute(
    `SELECT id FROM ${TABLES.keywordNode} WHERE JSON_UNQUOTE(JSON_EXTRACT(props, '$.meta.userId')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(props, '$.meta.themeName')) = ?`,
    [userId, themeName]
  );
  const existingNodeIds = existingNodeRows.map((row) => row.id);

  if (existingNodeIds.length > 0) {
    const placeholders = existingNodeIds.map(() => "?").join(", ");
    await connection.execute(
      `DELETE FROM ${TABLES.keywordEdge} WHERE src_id IN (${placeholders}) OR dst_id IN (${placeholders})`,
      [...existingNodeIds, ...existingNodeIds]
    );
    await connection.execute(
      `DELETE FROM ${TABLES.keywordNode} WHERE id IN (${placeholders})`,
      existingNodeIds
    );
  }

  if (snapshot.nodes.length === 0) {
    return { nodes: 0, edges: 0 };
  }

  const nodeIdMap = new Map();
  for (const node of snapshot.nodes) {
    const nodeProps = {
      ...node.props,
      meta: {
        userId,
        themeName,
        clientNodeId: node.clientId,
      },
    };
    const [result] = await connection.execute(
      `INSERT INTO ${TABLES.keywordNode} (label, props) VALUES (?, ?)`,
      [node.label, JSON.stringify(nodeProps)]
    );
    nodeIdMap.set(node.clientId, result.insertId);
  }

  let insertedEdgeCount = 0;
  for (const edge of snapshot.edges) {
    const srcId = nodeIdMap.get(edge.from);
    const dstId = nodeIdMap.get(edge.to);
    if (!srcId || !dstId) continue;

    const edgeProps = {
      ...edge.props,
      meta: {
        userId,
        themeName,
        clientEdgeId: edge.clientEdgeId,
      },
    };
    await connection.execute(
      `INSERT INTO ${TABLES.keywordEdge} (src_id, dst_id, relation, props) VALUES (?, ?, ?, ?)`,
      [srcId, dstId, edge.relation, JSON.stringify(edgeProps)]
    );
    insertedEdgeCount += 1;
  }

  return { nodes: snapshot.nodes.length, edges: insertedEdgeCount };
};

const buildWhereClause = () => {
  const conditions = [];
  const params = [];

  if (targetUserId) {
    conditions.push("user_id = ?");
    params.push(targetUserId);
  }
  if (targetThemeName) {
    conditions.push("theme_name = ?");
    params.push(targetThemeName);
  }

  if (conditions.length === 0) {
    return { whereSql: "", params };
  }

  return { whereSql: `WHERE ${conditions.join(" AND ")}`, params };
};

(async () => {
  const { whereSql, params } = buildWhereClause();
  const [rows] = await pool.execute(
    `SELECT user_id, theme_name, content_json FROM user_themes ${whereSql} ORDER BY user_id, theme_name`,
    params
  );

  if (rows.length === 0) {
    console.log("対象の user_themes レコードがありません。");
    return;
  }

  let processed = 0;
  let skipped = 0;
  let totalNodes = 0;
  let totalEdges = 0;

  for (const row of rows) {
    const userId = String(row.user_id);
    const themeName = String(row.theme_name);
    const content = parseContentJson(row.content_json);

    if (!content || typeof content !== "object") {
      skipped += 1;
      console.log(`[SKIP] user=${userId} theme=${themeName} (content_json がJSONではありません)`);
      continue;
    }

    const snapshot = buildGraphSnapshot(content);

    if (dryRun) {
      processed += 1;
      totalNodes += snapshot.nodes.length;
      totalEdges += snapshot.edges.length;
      console.log(
        `[DRY-RUN] user=${userId} theme=${themeName} nodes=${snapshot.nodes.length} edges=${snapshot.edges.length}`
      );
      continue;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await syncGraphTables(connection, userId, themeName, content);
      await connection.commit();

      processed += 1;
      totalNodes += result.nodes;
      totalEdges += result.edges;
      console.log(
        `[OK] user=${userId} theme=${themeName} nodes=${result.nodes} edges=${result.edges}`
      );
    } catch (error) {
      await connection.rollback();
      throw new Error(
        `同期失敗 user=${userId} theme=${themeName}: ${error.message || error}`
      );
    } finally {
      connection.release();
    }
  }

  console.log(
    `\n完了: processed=${processed}, skipped=${skipped}, nodes=${totalNodes}, edges=${totalEdges}, dryRun=${dryRun}`
  );
})()
  .catch((error) => {
    console.error("バックフィル失敗:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
