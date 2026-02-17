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
const forceAppend = argMap.get("--force-append") === "true";

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

const resolveLegacySourceTable = async () => {
  const candidates = ["user_themes", "user_themes_legacy_20260217"];
  for (const tableName of candidates) {
    const [rows] = await pool.execute(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
      [tableName]
    );
    if (rows.length > 0) {
      return tableName;
    }
  }
  return null;
};

const buildGraphSnapshot = (content) => {
  const source = toObjectOrEmpty(content);
  const rawNodes = Array.isArray(source.keywordNodes)
    ? source.keywordNodes
    : Array.isArray(source.nodes)
      ? source.nodes
      : [];
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];

  const nodes = rawNodes.map((node, index) => {
    const normalized = toObjectOrEmpty(node);
    const clientNodeId = normalized.id === undefined || normalized.id === null
      ? `node_${index + 1}`
      : String(normalized.id);

    return {
      clientNodeId,
      label: String(normalized.label || "").trim() || clientNodeId,
      nodeType: String(normalized.nodeType || "keyword").trim() || "keyword",
      x: Number.isFinite(Number(normalized.x)) ? Number(normalized.x) : null,
      y: Number.isFinite(Number(normalized.y)) ? Number(normalized.y) : null,
      props: normalized,
    };
  });

  const nodeSet = new Set(nodes.map((node) => node.clientNodeId));

  const edges = rawEdges
    .map((edge, index) => {
      const normalized = toObjectOrEmpty(edge);
      const from = normalized.from === undefined || normalized.from === null ? "" : String(normalized.from);
      const to = normalized.to === undefined || normalized.to === null ? "" : String(normalized.to);
      return {
        clientEdgeId:
          normalized.id === undefined || normalized.id === null
            ? `edge_${index + 1}`
            : String(normalized.id),
        from,
        to,
        relation: String(normalized.label || normalized.relation || "").trim() || null,
        props: normalized,
      };
    })
    .filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to));

  return { nodes, edges };
};

const normalizeHypothesisNode = (value, index) => {
  const normalized = toObjectOrEmpty(value);
  const text = String(normalized.text || normalized.label || "").trim();
  if (!text) return null;

  const rawKind = String(normalized.kind || "hypothesis").trim().toLowerCase();
  const nodeKind = rawKind === "scamper" ? "scamper" : "hypothesis";
  const nodeOrder = Number.isFinite(Number(normalized.order)) ? Number(normalized.order) : index + 1;

  return {
    text,
    kind: nodeKind,
    order: nodeOrder,
    basedKeywords: String(normalized.basedKeywords || "").trim() || null,
    tag: String(normalized.tag || "").trim() || null,
    props: normalized,
  };
};

const extractHypothesis = (content) => {
  const source = toObjectOrEmpty(content);
  const hypothesis = toObjectOrEmpty(source.hypothesis);
  const hasLegacyHtml = typeof hypothesis.html === "string" && Boolean(hypothesis.html.trim());

  const list = [];

  if (Array.isArray(hypothesis.nodes)) {
    for (let i = 0; i < hypothesis.nodes.length; i += 1) {
      const node = normalizeHypothesisNode(hypothesis.nodes[i], i);
      if (node) list.push(node);
    }
  }

  const entries = toObjectOrEmpty(hypothesis.entries);
  const hypotheses = Array.isArray(entries.hypotheses) ? entries.hypotheses : [];
  const scamper = Array.isArray(entries.scamper) ? entries.scamper : [];

  for (let i = 0; i < hypotheses.length; i += 1) {
    const node = normalizeHypothesisNode({ ...toObjectOrEmpty(hypotheses[i]), kind: "hypothesis" }, list.length + i);
    if (node) list.push(node);
  }
  for (let i = 0; i < scamper.length; i += 1) {
    const node = normalizeHypothesisNode({ ...toObjectOrEmpty(scamper[i]), kind: "scamper" }, list.length + i);
    if (node) list.push(node);
  }

  list.sort((a, b) => a.order - b.order);
  const nodes = list.map((row, index) => ({ ...row, order: index + 1 }));

  const hypothesisCount = nodes.filter((row) => row.kind === "hypothesis").length;
  const scamperCount = nodes.filter((row) => row.kind === "scamper").length;

  const summary = {
    schemaVersion: 2,
    hypothesisCount,
    scamperCount,
    totalCount: nodes.length,
  };

  const savedAtRaw = typeof hypothesis.savedAt === "string" ? hypothesis.savedAt.trim() : "";
  const savedAtDate = savedAtRaw ? new Date(savedAtRaw) : null;
  const savedAt = savedAtDate && !Number.isNaN(savedAtDate.getTime()) ? savedAtDate : null;

  return {
    hasLegacyHtml,
    nodes,
    summary,
    savedAt,
  };
};

const resolveTheme = async (connection, userId, themeName) => {
  const [rows] = await connection.execute(
    "SELECT id, latest_version_no, lock_version FROM themes WHERE user_id = ? AND theme_name = ? AND deleted_at IS NULL LIMIT 1",
    [userId, themeName]
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      themeId: row.id,
      latestVersionNo: Number(row.latest_version_no || 0),
      lockVersion: Number(row.lock_version || 0),
      isNewTheme: false,
    };
  }

  const [insertResult] = await connection.execute(
    "INSERT INTO themes (user_id, theme_name, latest_version_no, lock_version) VALUES (?, ?, 0, 0)",
    [userId, themeName]
  );

  return {
    themeId: insertResult.insertId,
    latestVersionNo: 0,
    lockVersion: 0,
    isNewTheme: true,
  };
};

const insertVersionBundle = async ({ connection, row, content }) => {
  const userId = String(row.user_id);
  const themeName = String(row.theme_name);
  const graph = buildGraphSnapshot(content);
  const hypothesis = extractHypothesis(content);

  const theme = await resolveTheme(connection, userId, themeName);

  if (!forceAppend && theme.latestVersionNo > 0) {
    return {
      status: "skipped_existing",
      userId,
      themeName,
      reason: "already has version",
    };
  }

  const nextVersionNo = theme.latestVersionNo + 1;
  const savedAt = row.updated_at ? new Date(row.updated_at) : new Date();

  const [versionResult] = await connection.execute(
    "INSERT INTO theme_versions (theme_id, version_no, saved_by_user_id, saved_at, note) VALUES (?, ?, ?, ?, ?)",
    [theme.themeId, nextVersionNo, userId, savedAt, "backfill from legacy user_themes"]
  );
  const themeVersionId = versionResult.insertId;

  for (const node of graph.nodes) {
    await connection.execute(
      "INSERT INTO keyword_nodes (theme_version_id, client_node_id, label, node_type, x, y, props_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        themeVersionId,
        node.clientNodeId,
        node.label,
        node.nodeType,
        node.x,
        node.y,
        JSON.stringify(node.props),
      ]
    );
  }

  for (const edge of graph.edges) {
    await connection.execute(
      "INSERT INTO keyword_edges (theme_version_id, client_edge_id, src_client_node_id, dst_client_node_id, relation, props_json) VALUES (?, ?, ?, ?, ?, ?)",
      [
        themeVersionId,
        edge.clientEdgeId,
        edge.from,
        edge.to,
        edge.relation,
        JSON.stringify(edge.props),
      ]
    );
  }

  const hasHypothesisData = hypothesis.nodes.length > 0 || Boolean(hypothesis.savedAt) || hypothesis.hasLegacyHtml;
  let hypothesisSpreadId = null;

  if (hasHypothesisData) {
    const [spreadResult] = await connection.execute(
      "INSERT INTO hypothesis_spreads (theme_version_id, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json) VALUES (?, ?, ?, ?)",
      [
        themeVersionId,
        hypothesis.savedAt,
        hypothesis.nodes.length,
        JSON.stringify(hypothesis.summary),
      ]
    );
    hypothesisSpreadId = spreadResult.insertId;
  }

  for (const node of hypothesis.nodes) {
    if (!hypothesisSpreadId) break;
    await connection.execute(
      "INSERT INTO hypothesis_nodes (hypothesis_spread_id, node_text, node_kind, node_order, based_keywords, scamper_tag, props_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        hypothesisSpreadId,
        node.text,
        node.kind,
        node.order,
        node.basedKeywords,
        node.tag,
        JSON.stringify(node.props),
      ]
    );
  }

  await connection.execute(
    "INSERT INTO theme_version_payloads (theme_version_id, content_json) VALUES (?, ?)",
    [themeVersionId, JSON.stringify(content)]
  );

  await connection.execute(
    "UPDATE themes SET latest_version_no = ?, lock_version = lock_version + 1 WHERE id = ?",
    [nextVersionNo, theme.themeId]
  );

  return {
    status: "ok",
    userId,
    themeName,
    themeVersionId,
    versionNo: nextVersionNo,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    hypothesisNodes: hypothesis.nodes.length,
    hadLegacyHypothesisHtml: Boolean(hypothesis.hasLegacyHtml),
    createdTheme: theme.isNewTheme,
  };
};

(async () => {
  const sourceTable = await resolveLegacySourceTable();
  if (!sourceTable) {
    console.log("対象のソーステーブルがありません（user_themes / user_themes_legacy_20260217）。");
    return;
  }

  const { whereSql, params } = buildWhereClause();
  const [rows] = await pool.execute(
    `SELECT user_id, theme_name, content_json, updated_at FROM ${sourceTable} ${whereSql} ORDER BY user_id, theme_name`,
    params
  );

  if (rows.length === 0) {
    console.log(`対象の ${sourceTable} レコードがありません。`);
    return;
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const userId = String(row.user_id);
    const themeName = String(row.theme_name);
    const content = parseContentJson(row.content_json);

    if (!content || typeof content !== "object") {
      skipped += 1;
      console.log(`[SKIP] user=${userId} theme=${themeName} (content_json がJSONではありません)`);
      continue;
    }

    const graph = buildGraphSnapshot(content);
    const hypothesis = extractHypothesis(content);

    if (dryRun) {
      processed += 1;
      console.log(
        `[DRY-RUN] user=${userId} theme=${themeName} nodes=${graph.nodes.length} edges=${graph.edges.length} hypothesisNodes=${hypothesis.nodes.length} hadLegacyHypothesisHtml=${Boolean(hypothesis.hasLegacyHtml)}`
      );
      continue;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await insertVersionBundle({ connection, row, content });
      await connection.commit();

      if (result.status === "skipped_existing") {
        skipped += 1;
        console.log(`[SKIP] user=${result.userId} theme=${result.themeName} (${result.reason})`);
        continue;
      }

      processed += 1;
      console.log(
        `[OK] user=${result.userId} theme=${result.themeName} version=${result.versionNo} themeVersionId=${result.themeVersionId} nodes=${result.nodes} edges=${result.edges} hypothesisNodes=${result.hypothesisNodes}`
      );
    } catch (error) {
      errors += 1;
      await connection.rollback();
      console.error(`[ERROR] user=${userId} theme=${themeName}:`, error.message || error);
    } finally {
      connection.release();
    }
  }

  console.log(`\n完了: processed=${processed}, skipped=${skipped}, errors=${errors}, dryRun=${dryRun}, forceAppend=${forceAppend}`);

  if (errors > 0) {
    process.exitCode = 1;
  }
})()
  .catch((error) => {
    console.error("バックフィル失敗:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
