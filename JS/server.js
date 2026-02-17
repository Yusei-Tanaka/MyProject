require("dotenv").config({ override: true });
const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// シンプルなCORS許可（フロントが別ポートの場合用）
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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

const safeLimit = (value, fallback = 50, max = 200) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

const normalizeUserId = (value) => String(value || "").trim();
const normalizePassword = (value) => String(value || "").trim();
const normalizeThemeName = (value) => String(value || "").trim();

const isValidUserId = (id) => USER_ID_PATTERN.test(id);
const isValidPassword = (password) => password.length >= 1;
const isValidThemeName = (themeName) => themeName.length >= 1 && themeName.length <= 255;

const V2_TABLES = {
  themes: "themes",
  themeVersions: "theme_versions",
  keywordNodes: "keyword_nodes",
  keywordEdges: "keyword_edges",
  hypothesisSpreads: "hypothesis_spreads",
  hypothesisNodes: "hypothesis_nodes",
  themeVersionPayloads: "theme_version_payloads",
};

const ENABLE_V2_READ = String(process.env.ENABLE_V2_READ || "false").toLowerCase() === "true";
let v2SchemaReady = false;

const hashPassword = (password) => crypto.createHash("sha256").update(password).digest("hex");

const parseJsonField = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const tableExists = async (tableName) => {
  const [rows] = await pool.execute(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [tableName]
  );
  return rows.length > 0;
};

const toObjectOrEmpty = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const mergeThemeContent = (existingContent, incomingContent) => {
  const existing = toObjectOrEmpty(existingContent);
  const incoming = toObjectOrEmpty(incomingContent);

  const merged = {
    ...existing,
    ...incoming,
  };

  const existingHypothesis = toObjectOrEmpty(existing.hypothesis);
  const incomingHypothesis = toObjectOrEmpty(incoming.hypothesis);
  if (Object.keys(existingHypothesis).length > 0 || Object.keys(incomingHypothesis).length > 0) {
    merged.hypothesis = normalizeHypothesisPayload({
      ...existingHypothesis,
      ...incomingHypothesis,
    });
  }

  if (!Array.isArray(merged.keywordNodes)) {
    if (Array.isArray(incoming.keywordNodes)) {
      merged.keywordNodes = incoming.keywordNodes;
    } else if (Array.isArray(incoming.nodes)) {
      merged.keywordNodes = incoming.nodes;
    } else if (Array.isArray(existing.keywordNodes)) {
      merged.keywordNodes = existing.keywordNodes;
    } else if (Array.isArray(existing.nodes)) {
      merged.keywordNodes = existing.nodes;
    }
  }

  if (!Array.isArray(merged.nodes) && Array.isArray(merged.keywordNodes)) {
    merged.nodes = merged.keywordNodes;
  }

  return merged;
};

const buildGraphSnapshot = (content) => {
  if (!content || typeof content !== "object") {
    return { nodes: [], edges: [] };
  }

  const rawNodes = Array.isArray(content.keywordNodes)
    ? content.keywordNodes
    : Array.isArray(content.nodes)
      ? content.nodes
      : [];
  const rawEdges = Array.isArray(content.edges) ? content.edges : [];

  const nodes = rawNodes.map((node, index) => {
    const normalized = toObjectOrEmpty(node);
    const clientId = normalized.id ?? `node_${index + 1}`;
    const label = String(normalized.label ?? "").trim() || String(clientId);
    return {
      clientId: String(clientId),
      label,
      props: {
        ...normalized,
        nodeType: String(normalized.nodeType || "keyword"),
      },
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

const normalizeHypothesisNode = (value, index) => {
  const normalized = toObjectOrEmpty(value);
  const text = String(normalized.text || normalized.label || "").trim();
  if (!text) return null;

  const kindRaw = String(normalized.kind || "hypothesis").trim().toLowerCase();
  const kind = kindRaw === "scamper" ? "scamper" : "hypothesis";
  const basedKeywords = String(normalized.basedKeywords || "").trim();
  const tag = String(normalized.tag || "").trim();
  const order = Number.isFinite(Number(normalized.order)) ? Number(normalized.order) : index + 1;

  return {
    ...normalized,
    kind,
    text,
    basedKeywords,
    tag,
    order,
  };
};

const extractHypothesisNodes = (content) => {
  const hypothesis = toObjectOrEmpty(content?.hypothesis);
  const result = [];

  if (Array.isArray(hypothesis.nodes)) {
    for (let i = 0; i < hypothesis.nodes.length; i += 1) {
      const node = normalizeHypothesisNode(hypothesis.nodes[i], i);
      if (node) result.push(node);
    }
  }

  const entries = toObjectOrEmpty(hypothesis.entries);
  const hypothesisEntries = Array.isArray(entries.hypotheses) ? entries.hypotheses : [];
  const scamperEntries = Array.isArray(entries.scamper) ? entries.scamper : [];

  const startIndex = result.length;
  for (let i = 0; i < hypothesisEntries.length; i += 1) {
    const node = normalizeHypothesisNode({ ...hypothesisEntries[i], kind: "hypothesis" }, startIndex + i);
    if (node) result.push(node);
  }
  for (let i = 0; i < scamperEntries.length; i += 1) {
    const node = normalizeHypothesisNode({ ...scamperEntries[i], kind: "scamper" }, result.length + i);
    if (node) result.push(node);
  }

  result.sort((a, b) => a.order - b.order);
  return result.map((node, index) => ({
    ...node,
    order: index + 1,
  }));
};

const normalizeHypothesisPayload = (value) => {
  const hypothesis = toObjectOrEmpty(value);
  const html = typeof hypothesis.html === "string" ? hypothesis.html : "";
  const nodes = extractHypothesisNodes({ hypothesis });
  const hypotheses = nodes
    .filter((node) => node.kind === "hypothesis")
    .map(({ kind, ...rest }) => ({ ...rest, kind: "hypothesis" }));
  const scamper = nodes
    .filter((node) => node.kind === "scamper")
    .map(({ kind, ...rest }) => ({ ...rest, kind: "scamper" }));

  return {
    ...hypothesis,
    schemaVersion: 2,
    html,
    nodes,
    entries: {
      hypotheses,
      scamper,
    },
    stats: {
      total: nodes.length,
      hypothesisCount: hypotheses.length,
      scamperCount: scamper.length,
    },
    savedAt:
      typeof hypothesis.savedAt === "string" && hypothesis.savedAt.trim()
        ? hypothesis.savedAt
        : new Date().toISOString(),
  };
};

const toMysqlDateTimeOrNull = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const checkV2SchemaReady = async () => {
  const requiredTables = [
    V2_TABLES.themes,
    V2_TABLES.themeVersions,
    V2_TABLES.keywordNodes,
    V2_TABLES.keywordEdges,
    V2_TABLES.hypothesisSpreads,
    V2_TABLES.hypothesisNodes,
    V2_TABLES.themeVersionPayloads,
  ];

  for (const tableName of requiredTables) {
    const exists = await tableExists(tableName);
    if (!exists) {
      return false;
    }
  }

  return true;
};

const canWriteV2 = () => v2SchemaReady;
const canReadV2 = () => ENABLE_V2_READ && v2SchemaReady;

const fetchThemesFromV2 = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT t.theme_name, tv.created_at AS updated_at, p.content_json
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       LEFT JOIN ${V2_TABLES.themeVersionPayloads} p
         ON p.theme_version_id = tv.id
      WHERE t.user_id = ? AND t.deleted_at IS NULL
      ORDER BY tv.created_at DESC, t.theme_name ASC`,
    [userId]
  );

  return rows.map((row) => ({
    themeName: row.theme_name,
    content: parseJsonField(row.content_json),
    updatedAt: row.updated_at,
  }));
};

const fetchThemeFromV2 = async (userId, themeName) => {
  const [rows] = await pool.execute(
    `SELECT t.theme_name, tv.created_at AS updated_at, p.content_json
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       LEFT JOIN ${V2_TABLES.themeVersionPayloads} p
         ON p.theme_version_id = tv.id
      WHERE t.user_id = ? AND t.theme_name = ? AND t.deleted_at IS NULL
      LIMIT 1`,
    [userId, themeName]
  );

  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  return {
    themeName: row.theme_name,
    content: parseJsonField(row.content_json),
    updatedAt: row.updated_at,
  };
};

const fetchThemeHypothesisFromV2 = async (userId, themeName) => {
  const [rows] = await pool.execute(
    `SELECT hs.hypothesis_saved_at, hs.hypothesis_node_count, hs.hypothesis_summary_json, hs.updated_at
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       INNER JOIN ${V2_TABLES.hypothesisSpreads} hs
         ON hs.theme_version_id = tv.id
      WHERE t.user_id = ? AND t.theme_name = ? AND t.deleted_at IS NULL
      LIMIT 1`,
    [userId, themeName]
  );

  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  return {
    userId,
    themeName,
    html: "",
    savedAt: row.hypothesis_saved_at,
    nodeCount: row.hypothesis_node_count,
    summary: parseJsonField(row.hypothesis_summary_json),
    updatedAt: row.updated_at,
  };
};

const fetchThemeHypothesisNodesFromV2 = async (userId, themeName) => {
  const [rows] = await pool.execute(
    `SELECT hn.id, hn.node_text, hn.node_kind, hn.node_order, hn.based_keywords, hn.scamper_tag, hn.created_at, hn.props_json
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       INNER JOIN ${V2_TABLES.hypothesisSpreads} hs
         ON hs.theme_version_id = tv.id
       INNER JOIN ${V2_TABLES.hypothesisNodes} hn
         ON hn.hypothesis_spread_id = hs.id
      WHERE t.user_id = ? AND t.theme_name = ? AND t.deleted_at IS NULL
      ORDER BY hn.node_order ASC, hn.id ASC`,
    [userId, themeName]
  );

  if (!rows || rows.length === 0) return null;
  return rows.map((row) => ({
    id: row.id,
    text: row.node_text,
    kind: row.node_kind,
    order: row.node_order,
    basedKeywords: row.based_keywords,
    tag: row.scamper_tag,
    createdAt: row.created_at,
    props: parseJsonField(row.props_json),
  }));
};

const fetchHypothesesFromV2 = async ({ userId, limit }) => {
  const whereSql = userId ? "WHERE t.deleted_at IS NULL AND t.user_id = ?" : "WHERE t.deleted_at IS NULL";
  const params = userId ? [userId, limit] : [limit];

  const [rows] = await pool.query(
    `SELECT t.user_id, t.theme_name, hs.updated_at, hs.hypothesis_node_count
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       INNER JOIN ${V2_TABLES.hypothesisSpreads} hs
         ON hs.theme_version_id = tv.id
      ${whereSql}
      ORDER BY hs.updated_at DESC
      LIMIT ?`,
    params
  );

  return rows;
};

const fetchHypothesisNodesFromV2 = async ({ userId, themeName, limit }) => {
  const whereClause = ["t.deleted_at IS NULL"];
  const params = [];

  if (userId) {
    whereClause.push("t.user_id = ?");
    params.push(userId);
  }
  if (themeName) {
    whereClause.push("t.theme_name = ?");
    params.push(themeName);
  }

  const whereSql = `WHERE ${whereClause.join(" AND ")}`;
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT hn.id, t.user_id, t.theme_name, hn.node_text, hn.node_kind, hn.node_order, hn.created_at
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       INNER JOIN ${V2_TABLES.hypothesisSpreads} hs
         ON hs.theme_version_id = tv.id
       INNER JOIN ${V2_TABLES.hypothesisNodes} hn
         ON hn.hypothesis_spread_id = hs.id
      ${whereSql}
      ORDER BY hn.created_at DESC, hn.id DESC
      LIMIT ?`,
    params
  );

  return rows;
};

const resolveOrCreateThemeV2 = async (connection, userId, themeName) => {
  const [rows] = await connection.execute(
    `SELECT id, latest_version_no, deleted_at FROM ${V2_TABLES.themes} WHERE user_id = ? AND theme_name = ? ORDER BY id DESC LIMIT 1`,
    [userId, themeName]
  );

  if (rows.length > 0) {
    const row = rows[0];
    if (row.deleted_at) {
      await connection.execute(
        `UPDATE ${V2_TABLES.themes} SET deleted_at = NULL WHERE id = ?`,
        [row.id]
      );
    }
    return {
      themeId: row.id,
      latestVersionNo: Number(row.latest_version_no || 0),
    };
  }

  const [insertResult] = await connection.execute(
    `INSERT INTO ${V2_TABLES.themes} (user_id, theme_name, latest_version_no, lock_version) VALUES (?, ?, 0, 0)`,
    [userId, themeName]
  );

  return {
    themeId: insertResult.insertId,
    latestVersionNo: 0,
  };
};

const syncThemeToV2 = async (userId, themeName, content, note = "dual-write from /users/:id/themes") => {
  if (!canWriteV2()) return;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const theme = await resolveOrCreateThemeV2(connection, userId, themeName);
    const nextVersionNo = theme.latestVersionNo + 1;

    const [versionResult] = await connection.execute(
      `INSERT INTO ${V2_TABLES.themeVersions} (theme_id, version_no, saved_by_user_id, saved_at, note) VALUES (?, ?, ?, ?, ?)`,
      [theme.themeId, nextVersionNo, userId, new Date(), note]
    );
    const themeVersionId = versionResult.insertId;

    const graphSnapshot = buildGraphSnapshot(content);
    for (const node of graphSnapshot.nodes) {
      const nodeProps = {
        ...node.props,
        meta: {
          userId,
          themeName,
          clientNodeId: node.clientId,
        },
      };

      await connection.execute(
        `INSERT INTO ${V2_TABLES.keywordNodes} (theme_version_id, client_node_id, label, node_type, x, y, props_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          themeVersionId,
          node.clientId,
          node.label,
          String(nodeProps.nodeType || "keyword"),
          Number.isFinite(Number(nodeProps.x)) ? Number(nodeProps.x) : null,
          Number.isFinite(Number(nodeProps.y)) ? Number(nodeProps.y) : null,
          JSON.stringify(nodeProps),
        ]
      );
    }

    const nodeIdSet = new Set(graphSnapshot.nodes.map((node) => node.clientId));
    for (const edge of graphSnapshot.edges) {
      if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) continue;

      const edgeProps = {
        ...edge.props,
        meta: {
          userId,
          themeName,
          clientEdgeId: edge.clientEdgeId,
        },
      };
      await connection.execute(
        `INSERT INTO ${V2_TABLES.keywordEdges} (theme_version_id, client_edge_id, src_client_node_id, dst_client_node_id, relation, props_json) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          themeVersionId,
          edge.clientEdgeId,
          edge.from,
          edge.to,
          edge.relation,
          JSON.stringify(edgeProps),
        ]
      );
    }

    const normalizedHypothesis = normalizeHypothesisPayload(content?.hypothesis);
    const hypothesisHtml = String(normalizedHypothesis.html || "").trim();
    const hypothesisNodes = Array.isArray(normalizedHypothesis.nodes) ? normalizedHypothesis.nodes : [];
    const savedAt = toMysqlDateTimeOrNull(normalizedHypothesis.savedAt);
    const summary = {
      schemaVersion: 2,
      hypothesisCount: normalizedHypothesis?.stats?.hypothesisCount || 0,
      scamperCount: normalizedHypothesis?.stats?.scamperCount || 0,
      totalCount: normalizedHypothesis?.stats?.total || hypothesisNodes.length,
    };

    const hasHypothesisData = Boolean(hypothesisHtml) || hypothesisNodes.length > 0 || Boolean(savedAt);
    let hypothesisSpreadId = null;
    if (hasHypothesisData) {
      const [spreadResult] = await connection.execute(
        `INSERT INTO ${V2_TABLES.hypothesisSpreads} (theme_version_id, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json) VALUES (?, ?, ?, ?)`,
        [themeVersionId, savedAt, hypothesisNodes.length, JSON.stringify(summary)]
      );
      hypothesisSpreadId = spreadResult.insertId;
    }

    let nodeOrder = 0;
    for (const node of hypothesisNodes) {
      if (!hypothesisSpreadId) break;
      const normalizedNode = toObjectOrEmpty(node);
      const nodeText = String(normalizedNode.text || normalizedNode.label || "").trim();
      if (!nodeText) continue;
      nodeOrder += 1;

      await connection.execute(
        `INSERT INTO ${V2_TABLES.hypothesisNodes} (hypothesis_spread_id, node_text, node_kind, node_order, based_keywords, scamper_tag, props_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          hypothesisSpreadId,
          nodeText,
          String(normalizedNode.kind || "hypothesis").slice(0, 32),
          nodeOrder,
          String(normalizedNode.basedKeywords || "").trim() || null,
          String(normalizedNode.tag || "").trim() || null,
          JSON.stringify(normalizedNode),
        ]
      );
    }

    await connection.execute(
      `INSERT INTO ${V2_TABLES.themeVersionPayloads} (theme_version_id, content_json) VALUES (?, ?)`,
      [themeVersionId, JSON.stringify(content)]
    );

    await connection.execute(
      `UPDATE ${V2_TABLES.themes} SET latest_version_no = ?, lock_version = lock_version + 1 WHERE id = ?`,
      [nextVersionNo, theme.themeId]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const softDeleteThemeV2 = async (userId, themeName) => {
  if (!canWriteV2()) return;
  const [result] = await pool.execute(
    `UPDATE ${V2_TABLES.themes} SET deleted_at = CURRENT_TIMESTAMP, lock_version = lock_version + 1 WHERE user_id = ? AND theme_name = ? AND deleted_at IS NULL`,
    [userId, themeName]
  );
  return Number(result.affectedRows || 0);
};

const softDeleteThemesByUserV2 = async (userId) => {
  if (!canWriteV2()) return;
  const [result] = await pool.execute(
    `UPDATE ${V2_TABLES.themes} SET deleted_at = CURRENT_TIMESTAMP, lock_version = lock_version + 1 WHERE user_id = ? AND deleted_at IS NULL`,
    [userId]
  );
  return Number(result.affectedRows || 0);
};

const ensureSchema = async () => {
  await pool.execute(
    "CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, password_hash VARCHAR(255) NOT NULL)"
  );

  try {
    await pool.execute(
      "ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );
  } catch (err) {
    if (!(err && err.code === "ER_DUP_FIELDNAME")) throw err;
  }

  await pool.execute("DROP TABLE IF EXISTS logs");
};

app.post("/users", async (req, res) => {
  const id = normalizeUserId(req.body.id);
  const password = normalizePassword(req.body.passwordHash);
  if (!id || !password) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(id)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "password is required" });
  }
  try {
    const passwordHash = hashPassword(password);
    await pool.execute(
      "INSERT INTO users (id, password_hash) VALUES (?, ?)",
      [id, passwordHash]
    );
    res.status(201).json({ id });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "user already exists" });
    }
    console.error("create user failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/users", async (req, res) => {
  const limit = safeLimit(req.query.limit);
  try {
    const [rows] = await pool.query(
      "SELECT id FROM users ORDER BY id DESC LIMIT ?",
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error("fetch users failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.delete("/users/:id", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: "missing id" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!userRows || userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "user not found" });
    }

    const [graphNodeCountRows] = await connection.execute(
      `SELECT COUNT(*) AS count
         FROM ${V2_TABLES.keywordNodes} kn
         INNER JOIN ${V2_TABLES.themeVersions} tv ON tv.id = kn.theme_version_id
         INNER JOIN ${V2_TABLES.themes} t ON t.id = tv.theme_id
        WHERE t.user_id = ?`,
      [userId]
    );
    const deletedGraphNodes = Number(graphNodeCountRows?.[0]?.count || 0);
    await connection.execute("DELETE FROM users WHERE id = ?", [userId]);

    await connection.commit();
    res.json({ id: userId, deleted: true, deletedGraphNodes });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // noop
    }
    console.error("delete user failed", err);
    res.status(500).json({ error: "db error" });
  } finally {
    connection.release();
  }
});

app.put("/users/:id", async (req, res) => {
  const userId = (req.params.id || "").trim();
  const password = normalizePassword(req.body.passwordHash);
  if (!userId || !password) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "password is required" });
  }
  try {
    const passwordHash = hashPassword(password);
    const [result] = await pool.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [passwordHash, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "user not found" });
    }
    res.json({ id: userId, updated: true });
  } catch (err) {
    console.error("update user failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.put("/users/:id/password", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const currentPassword = normalizePassword(req.body.currentPassword);
  const newPassword = normalizePassword(req.body.newPassword);

  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidPassword(currentPassword) || !isValidPassword(newPassword)) {
    return res.status(400).json({ error: "password is required" });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "user not found" });
    }

    const currentHash = hashPassword(currentPassword);
    if (rows[0].password_hash !== currentHash) {
      return res.status(401).json({ error: "invalid current password" });
    }

    const nextHash = hashPassword(newPassword);
    await pool.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [nextHash, userId]
    );

    res.json({ id: userId, updated: true });
  } catch (err) {
    console.error("update password with verification failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/users/:id/themes", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: "missing id" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const payload = await fetchThemesFromV2(userId);
    res.json(payload);
  } catch (err) {
    console.error("fetch themes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/users/:id/themes/:themeName", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const themeName = normalizeThemeName(req.params.themeName || "");
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Theme = await fetchThemeFromV2(userId, themeName);
    if (!v2Theme) {
      return res.status(404).json({ error: "theme not found" });
    }
    res.json(v2Theme);
  } catch (err) {
    console.error("fetch theme failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/users/:id/themes/:themeName/hypothesis", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const themeName = normalizeThemeName(req.params.themeName || "");
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Hypothesis = await fetchThemeHypothesisFromV2(userId, themeName);
    if (!v2Hypothesis) {
      return res.status(404).json({ error: "hypothesis not found" });
    }
    res.json(v2Hypothesis);
  } catch (err) {
    console.error("fetch hypothesis failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/users/:id/themes/:themeName/hypothesis-nodes", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const themeName = normalizeThemeName(req.params.themeName || "");
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Nodes = await fetchThemeHypothesisNodesFromV2(userId, themeName);
    res.json(v2Nodes || []);
  } catch (err) {
    console.error("fetch hypothesis nodes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.put("/users/:id/themes", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const themeName = normalizeThemeName(req.body.themeName);
  const incomingContent = req.body.content ?? null;

  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }

  try {
    const existingTheme = await fetchThemeFromV2(userId, themeName);
    const existingContent = existingTheme && existingTheme.content ? existingTheme.content : {};
    const mergedContent = mergeThemeContent(existingContent, incomingContent);
    await syncThemeToV2(userId, themeName, mergedContent, "v2-primary write from /users/:id/themes");

    res.json({ userId, themeName, saved: true });
  } catch (err) {
    if (err && err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(404).json({ error: "user not found" });
    }
    console.error("save theme failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.delete("/users/:id/themes", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: "missing id" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }

  try {
    const v2AffectedThemes = await softDeleteThemesByUserV2(userId);
    res.json({ userId, deletedAll: true, v2AffectedThemes: v2AffectedThemes || 0 });
  } catch (err) {
    console.error("delete all themes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.delete("/users/:id/themes/:themeName", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const themeName = normalizeThemeName(decodeURIComponent(req.params.themeName || ""));
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }

  try {
    const v2AffectedRows = await softDeleteThemeV2(userId, themeName);
    if (Number(v2AffectedRows || 0) === 0) {
      return res.status(404).json({ error: "theme not found" });
    }
    res.json({ userId, themeName, deleted: true, v2AffectedRows: Number(v2AffectedRows || 0) });
  } catch (err) {
    console.error("delete theme failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.post("/auth/login", async (req, res) => {
  const id = normalizeUserId(req.body.id);
  const password = normalizePassword(req.body.password ?? req.body.passwordHash);
  if (!id || !password) {
    return res.status(400).json({ error: "missing fields" });
  }
  try {
    const [rows] = await pool.execute("SELECT password_hash FROM users WHERE id = ? LIMIT 1", [id]);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    const hashedInput = hashPassword(password);
    const ok = rows[0].password_hash === hashedInput;
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    res.json({ id, authenticated: true });
  } catch (err) {
    console.error("login failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("health check failed", err);
    res.status(500).json({ status: "ng", error: "db unreachable" });
  }
});

app.get("/hypotheses", async (req, res) => {
  const limit = safeLimit(req.query.limit, 100, 500);
  const userId = req.query.userId ? normalizeUserId(req.query.userId) : null;
  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Rows = await fetchHypothesesFromV2({ userId, limit });
    res.json(v2Rows);
  } catch (err) {
    console.error("fetch hypotheses failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/hypothesis-nodes", async (req, res) => {
  const limit = safeLimit(req.query.limit, 100, 500);
  const userId = req.query.userId ? normalizeUserId(req.query.userId) : null;
  const themeName = req.query.themeName ? normalizeThemeName(req.query.themeName) : null;
  if (userId && !isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid userId format" });
  }
  if (themeName && !isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Rows = await fetchHypothesisNodesFromV2({ userId, themeName, limit });
    res.json(v2Rows);
  } catch (err) {
    console.error("fetch hypothesis nodes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/graph/nodes", async (req, res) => {
  const limit = safeLimit(req.query.limit, 50, 200);
  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const themeVersionId = req.query.themeVersionId ? Number(req.query.themeVersionId) : null;
    const userId = req.query.userId ? normalizeUserId(req.query.userId) : null;
    const themeName = req.query.themeName ? normalizeThemeName(req.query.themeName) : null;

    const where = [];
    const params = [];
    if (Number.isInteger(themeVersionId) && themeVersionId > 0) {
      where.push("kn.theme_version_id = ?");
      params.push(themeVersionId);
    }
    if (userId) {
      where.push("t.user_id = ?");
      params.push(userId);
    }
    if (themeName) {
      where.push("t.theme_name = ?");
      params.push(themeName);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);

    const [rows] = await pool.query(
      `SELECT kn.id, kn.theme_version_id, kn.client_node_id, kn.label, kn.node_type, kn.x, kn.y, kn.props_json AS props, kn.created_at
         FROM ${V2_TABLES.keywordNodes} kn
         INNER JOIN ${V2_TABLES.themeVersions} tv ON tv.id = kn.theme_version_id
         INNER JOIN ${V2_TABLES.themes} t ON t.id = tv.theme_id
         ${whereSql}
        ORDER BY kn.id DESC LIMIT ?`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error("fetch nodes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.post("/graph/nodes", async (req, res) => {
  const {
    themeVersionId,
    label,
    clientNodeId,
    nodeType = "keyword",
    x = null,
    y = null,
    props = {},
  } = req.body;

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }
  if (!label || !themeVersionId) return res.status(400).json({ error: "missing label or themeVersionId" });

  const resolvedClientNodeId = String(clientNodeId || `node_${Date.now()}`);

  try {
    const [result] = await pool.execute(
      `INSERT INTO ${V2_TABLES.keywordNodes} (theme_version_id, client_node_id, label, node_type, x, y, props_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(themeVersionId),
        resolvedClientNodeId,
        String(label),
        String(nodeType || "keyword"),
        Number.isFinite(Number(x)) ? Number(x) : null,
        Number.isFinite(Number(y)) ? Number(y) : null,
        JSON.stringify(props),
      ]
    );
    res.status(201).json({ id: result.insertId, themeVersionId: Number(themeVersionId), clientNodeId: resolvedClientNodeId });
  } catch (err) {
    console.error("create node failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.post("/graph/edges", async (req, res) => {
  const {
    themeVersionId,
    srcClientNodeId,
    dstClientNodeId,
    srcId,
    dstId,
    relation = null,
    clientEdgeId,
    props = {},
  } = req.body;

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }

  const resolvedSrc = srcClientNodeId || srcId;
  const resolvedDst = dstClientNodeId || dstId;
  if (!themeVersionId || !resolvedSrc || !resolvedDst) {
    return res.status(400).json({ error: "missing themeVersionId or src/dst client node id" });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO ${V2_TABLES.keywordEdges} (theme_version_id, client_edge_id, src_client_node_id, dst_client_node_id, relation, props_json) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        Number(themeVersionId),
        clientEdgeId ? String(clientEdgeId) : null,
        String(resolvedSrc),
        String(resolvedDst),
        relation,
        JSON.stringify(props),
      ]
    );
    res.status(201).json({ id: result.insertId, themeVersionId: Number(themeVersionId) });
  } catch (err) {
    console.error("create edge failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/graph/edges", async (req, res) => {
  const limit = safeLimit(req.query.limit, 50, 200);
  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const themeVersionId = req.query.themeVersionId ? Number(req.query.themeVersionId) : null;
    const userId = req.query.userId ? normalizeUserId(req.query.userId) : null;
    const themeName = req.query.themeName ? normalizeThemeName(req.query.themeName) : null;

    const where = [];
    const params = [];
    if (Number.isInteger(themeVersionId) && themeVersionId > 0) {
      where.push("ke.theme_version_id = ?");
      params.push(themeVersionId);
    }
    if (userId) {
      where.push("t.user_id = ?");
      params.push(userId);
    }
    if (themeName) {
      where.push("t.theme_name = ?");
      params.push(themeName);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);

    const [rows] = await pool.query(
      `SELECT ke.id, ke.theme_version_id, ke.client_edge_id, ke.src_client_node_id, ke.dst_client_node_id, ke.relation, ke.props_json AS props, ke.created_at
         FROM ${V2_TABLES.keywordEdges} ke
         INNER JOIN ${V2_TABLES.themeVersions} tv ON tv.id = ke.theme_version_id
         INNER JOIN ${V2_TABLES.themes} t ON t.id = tv.theme_id
         ${whereSql}
        ORDER BY ke.id DESC LIMIT ?`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error("fetch edges failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.use((err, _req, res, _next) => {
  console.error("unhandled error", err);
  res.status(500).json({ error: "unexpected error" });
});

const PORT = process.env.PORT || 3000;
const startServer = async () => {
  try {
    await ensureSchema();
    v2SchemaReady = await checkV2SchemaReady();
    if (!v2SchemaReady) {
      console.warn("V2 tables are missing. Run scripts/sql/20260217_db_v2_up.sql to enable V2 APIs.");
    }
    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
      console.log(`V2 write: ${canWriteV2() ? "enabled" : "disabled"}`);
      console.log(`V2 read: ${canReadV2() ? "enabled" : "disabled"}`);
    });
  } catch (err) {
    console.error("failed to initialize schema", err);
    process.exit(1);
  }
};

startServer();
