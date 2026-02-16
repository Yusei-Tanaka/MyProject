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

const TABLES = {
  keywordNode: "node_keyword",
  keywordEdge: "node_edge",
  hypothesisNode: "node_hypothesis",
  hypothesisSpread: "hypothesis_spread",
};

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

const tryAlter = async (sql, ignorableCodes = []) => {
  try {
    await pool.execute(sql);
  } catch (err) {
    if (err && ignorableCodes.includes(err.code)) return;
    throw err;
  }
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

const extractHypothesisHtml = (content) => {
  if (!content || typeof content !== "object") return "";
  const hypothesis = content.hypothesis;
  if (!hypothesis || typeof hypothesis !== "object") return "";
  const html = hypothesis.html;
  return typeof html === "string" ? html : "";
};

const syncHypothesisTable = async (userId, themeName, content) => {
  const hypothesis = normalizeHypothesisPayload(content?.hypothesis);
  const hypothesisHtml = String(hypothesis.html || "").trim();
  const savedAt = toMysqlDateTimeOrNull(hypothesis.savedAt);
  const nodeCount = Array.isArray(hypothesis.nodes) ? hypothesis.nodes.length : 0;
  const summary = {
    schemaVersion: 2,
    hypothesisCount: hypothesis?.stats?.hypothesisCount || 0,
    scamperCount: hypothesis?.stats?.scamperCount || 0,
    totalCount: hypothesis?.stats?.total || nodeCount,
  };

  if (!hypothesisHtml) {
    await pool.execute(
      `DELETE FROM ${TABLES.hypothesisSpread} WHERE user_id = ? AND theme_name = ?`,
      [userId, themeName]
    );
    return;
  }

  await pool.execute(
    `INSERT INTO ${TABLES.hypothesisSpread} (user_id, theme_name, hypothesis_html, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE hypothesis_html = VALUES(hypothesis_html), hypothesis_saved_at = VALUES(hypothesis_saved_at), hypothesis_node_count = VALUES(hypothesis_node_count), hypothesis_summary_json = VALUES(hypothesis_summary_json), updated_at = CURRENT_TIMESTAMP`,
    [userId, themeName, hypothesisHtml, savedAt, nodeCount, JSON.stringify(summary)]
  );
};

const syncHypothesisNodesTable = async (userId, themeName, content) => {
  const rawNodes = extractHypothesisNodes(content);

  await pool.execute(
    `DELETE FROM ${TABLES.hypothesisNode} WHERE user_id = ? AND theme_name = ?`,
    [userId, themeName]
  );

  if (rawNodes.length === 0) return;

  let order = 0;
  for (const rawNode of rawNodes) {
    const normalized = toObjectOrEmpty(rawNode);
    const nodeText = String(normalized.text || normalized.label || "").trim();
    if (!nodeText) continue;
    const basedKeywords = String(normalized.basedKeywords || "").trim() || null;
    const scamperTag = String(normalized.tag || "").trim() || null;

    order += 1;
    const nodeKind = String(normalized.kind || "hypothesis").slice(0, 32) || "hypothesis";
    await pool.execute(
      `INSERT INTO ${TABLES.hypothesisNode} (user_id, theme_name, node_text, node_kind, node_order, based_keywords, scamper_tag, props_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, themeName, nodeText, nodeKind, order, basedKeywords, scamperTag, JSON.stringify(normalized)]
    );
  }
};

const syncGraphTables = async (userId, themeName, content) => {
  const snapshot = buildGraphSnapshot(content);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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
      await connection.commit();
      return;
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
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
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

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.keywordNode} (id BIGINT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(255) NOT NULL, props JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_node_keyword_label (label))`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.keywordEdge} (id BIGINT AUTO_INCREMENT PRIMARY KEY, src_id BIGINT NOT NULL, dst_id BIGINT NOT NULL, relation VARCHAR(255), props JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_node_edge_src (src_id), INDEX idx_node_edge_dst (dst_id), CONSTRAINT fk_node_edge_src FOREIGN KEY (src_id) REFERENCES ${TABLES.keywordNode}(id), CONSTRAINT fk_node_edge_dst FOREIGN KEY (dst_id) REFERENCES ${TABLES.keywordNode}(id))`
  );

  await pool.execute(
    "CREATE TABLE IF NOT EXISTS user_themes (user_id VARCHAR(64) NOT NULL, theme_name VARCHAR(255) NOT NULL, content_json JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (user_id, theme_name), INDEX idx_user_themes_user_updated (user_id, updated_at), CONSTRAINT fk_user_themes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.hypothesisSpread} (user_id VARCHAR(64) NOT NULL, theme_name VARCHAR(255) NOT NULL, hypothesis_html LONGTEXT NOT NULL, hypothesis_saved_at DATETIME NULL, hypothesis_node_count INT NOT NULL DEFAULT 0, hypothesis_summary_json JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (user_id, theme_name), INDEX idx_hypothesis_spread_user_updated (user_id, updated_at), CONSTRAINT fk_hypothesis_spread_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${TABLES.hypothesisNode} (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64) NOT NULL, theme_name VARCHAR(255) NOT NULL, node_text TEXT NOT NULL, node_kind VARCHAR(32) NOT NULL DEFAULT 'hypothesis', node_order INT NOT NULL DEFAULT 0, based_keywords TEXT NULL, scamper_tag VARCHAR(255) NULL, props_json JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_node_hypothesis_user_theme (user_id, theme_name), INDEX idx_node_hypothesis_user_created (user_id, created_at), CONSTRAINT fk_node_hypothesis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`
  );

  if (await tableExists("nodes")) {
    await pool.execute(
      `INSERT IGNORE INTO ${TABLES.keywordNode} (id, label, props, created_at) SELECT id, label, props, created_at FROM nodes`
    );
  }
  if (await tableExists("edges")) {
    await pool.execute(
      `INSERT IGNORE INTO ${TABLES.keywordEdge} (id, src_id, dst_id, relation, props, created_at) SELECT id, src_id, dst_id, relation, props, created_at FROM edges`
    );
  }
  if (await tableExists("hypotheses")) {
    await pool.execute(
      `INSERT IGNORE INTO ${TABLES.hypothesisSpread} (user_id, theme_name, hypothesis_html, created_at, updated_at) SELECT user_id, theme_name, hypothesis_html, created_at, updated_at FROM hypotheses`
    );
  }
  if (await tableExists("hypothesis_nodes")) {
    await pool.execute(
      `INSERT IGNORE INTO ${TABLES.hypothesisNode} (id, user_id, theme_name, node_text, node_kind, node_order, props_json, created_at) SELECT id, user_id, theme_name, node_text, node_kind, node_order, props_json, created_at FROM hypothesis_nodes`
    );
  }

  await tryAlter(
    "ALTER TABLE user_themes ADD COLUMN content_json JSON NULL",
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    "ALTER TABLE user_themes ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    "ALTER TABLE user_themes ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    "ALTER TABLE user_themes ADD INDEX idx_user_themes_user_updated (user_id, updated_at)",
    ["ER_DUP_KEYNAME"]
  );

  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisSpread} ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisSpread} ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisSpread} ADD INDEX idx_hypothesis_spread_user_updated (user_id, updated_at)`,
    ["ER_DUP_KEYNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisSpread} ADD COLUMN hypothesis_saved_at DATETIME NULL`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisSpread} ADD COLUMN hypothesis_node_count INT NOT NULL DEFAULT 0`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisSpread} ADD COLUMN hypothesis_summary_json JSON NULL`,
    ["ER_DUP_FIELDNAME"]
  );

  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisNode} ADD COLUMN node_kind VARCHAR(32) NOT NULL DEFAULT 'hypothesis'`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisNode} ADD COLUMN node_order INT NOT NULL DEFAULT 0`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisNode} ADD COLUMN props_json JSON NULL`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisNode} ADD COLUMN based_keywords TEXT NULL`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisNode} ADD COLUMN scamper_tag VARCHAR(255) NULL`,
    ["ER_DUP_FIELDNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisNode} ADD INDEX idx_node_hypothesis_user_theme (user_id, theme_name)`,
    ["ER_DUP_KEYNAME"]
  );
  await tryAlter(
    `ALTER TABLE ${TABLES.hypothesisNode} ADD INDEX idx_node_hypothesis_user_created (user_id, created_at)`,
    ["ER_DUP_KEYNAME"]
  );
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
  const userId = (req.params.id || "").trim();
  if (!userId) {
    return res.status(400).json({ error: "missing id" });
  }
  try {
    const [result] = await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "user not found" });
    }
    res.json({ id: userId, deleted: true });
  } catch (err) {
    console.error("delete user failed", err);
    res.status(500).json({ error: "db error" });
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
    const [rows] = await pool.query(
      "SELECT theme_name, content_json, updated_at FROM user_themes WHERE user_id = ? ORDER BY updated_at DESC, theme_name ASC",
      [userId]
    );

    const payload = rows.map((row) => ({
      themeName: row.theme_name,
      content: parseJsonField(row.content_json),
      updatedAt: row.updated_at,
    }));

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
    const [rows] = await pool.execute(
      "SELECT theme_name, content_json, updated_at FROM user_themes WHERE user_id = ? AND theme_name = ? LIMIT 1",
      [userId, themeName]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "theme not found" });
    }
    const row = rows[0];
    res.json({
      themeName: row.theme_name,
      content: parseJsonField(row.content_json),
      updatedAt: row.updated_at,
    });
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
    const [rows] = await pool.execute(
      `SELECT hypothesis_html, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json, updated_at FROM ${TABLES.hypothesisSpread} WHERE user_id = ? AND theme_name = ? LIMIT 1`,
      [userId, themeName]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "hypothesis not found" });
    }
    const row = rows[0];
    res.json({
      userId,
      themeName,
      html: row.hypothesis_html,
      savedAt: row.hypothesis_saved_at,
      nodeCount: row.hypothesis_node_count,
      summary: parseJsonField(row.hypothesis_summary_json),
      updatedAt: row.updated_at,
    });
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
    const [rows] = await pool.execute(
      `SELECT id, node_text, node_kind, node_order, based_keywords, scamper_tag, created_at, props_json FROM ${TABLES.hypothesisNode} WHERE user_id = ? AND theme_name = ? ORDER BY node_order ASC, id ASC`,
      [userId, themeName]
    );
    const payload = rows.map((row) => ({
      id: row.id,
      text: row.node_text,
      kind: row.node_kind,
      order: row.node_order,
      basedKeywords: row.based_keywords,
      tag: row.scamper_tag,
      createdAt: row.created_at,
      props: parseJsonField(row.props_json),
    }));
    res.json(payload);
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

  try {
    const [existingRows] = await pool.execute(
      "SELECT content_json FROM user_themes WHERE user_id = ? AND theme_name = ? LIMIT 1",
      [userId, themeName]
    );
    const existingContent =
      existingRows && existingRows.length > 0 ? parseJsonField(existingRows[0].content_json) : {};
    const mergedContent = mergeThemeContent(existingContent, incomingContent);

    await pool.execute(
      "INSERT INTO user_themes (user_id, theme_name, content_json) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content_json = VALUES(content_json), updated_at = CURRENT_TIMESTAMP",
      [userId, themeName, JSON.stringify(mergedContent)]
    );
    await syncHypothesisTable(userId, themeName, mergedContent);
    await syncHypothesisNodesTable(userId, themeName, mergedContent);
    await syncGraphTables(userId, themeName, mergedContent);
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

  try {
    await pool.execute("DELETE FROM user_themes WHERE user_id = ?", [userId]);
    await pool.execute(`DELETE FROM ${TABLES.hypothesisSpread} WHERE user_id = ?`, [userId]);
    await pool.execute(`DELETE FROM ${TABLES.hypothesisNode} WHERE user_id = ?`, [userId]);
    res.json({ userId, deletedAll: true });
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

  try {
    const [result] = await pool.execute(
      "DELETE FROM user_themes WHERE user_id = ? AND theme_name = ?",
      [userId, themeName]
    );
    await pool.execute(
      `DELETE FROM ${TABLES.hypothesisSpread} WHERE user_id = ? AND theme_name = ?`,
      [userId, themeName]
    );
    await pool.execute(
      `DELETE FROM ${TABLES.hypothesisNode} WHERE user_id = ? AND theme_name = ?`,
      [userId, themeName]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "theme not found" });
    }
    res.json({ userId, themeName, deleted: true });
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
    const sql = userId
      ? `SELECT user_id, theme_name, updated_at, CHAR_LENGTH(hypothesis_html) AS html_length FROM ${TABLES.hypothesisSpread} WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`
      : `SELECT user_id, theme_name, updated_at, CHAR_LENGTH(hypothesis_html) AS html_length FROM ${TABLES.hypothesisSpread} ORDER BY updated_at DESC LIMIT ?`;
    const params = userId ? [userId, limit] : [limit];
    const [rows] = await pool.query(sql, params);
    res.json(rows);
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
    const whereClause = [];
    const params = [];
    if (userId) {
      whereClause.push("user_id = ?");
      params.push(userId);
    }
    if (themeName) {
      whereClause.push("theme_name = ?");
      params.push(themeName);
    }

    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";
    params.push(limit);

    const sql = `SELECT id, user_id, theme_name, node_text, node_kind, node_order, created_at FROM ${TABLES.hypothesisNode} ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ?`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("fetch hypothesis nodes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/graph/nodes", async (req, res) => {
  const limit = safeLimit(req.query.limit, 50, 200);
  try {
    const [rows] = await pool.query(
      `SELECT id, label, props, created_at FROM ${TABLES.keywordNode} ORDER BY id DESC LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error("fetch nodes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.post("/graph/nodes", async (req, res) => {
  const { label, props = {} } = req.body;
  if (!label) return res.status(400).json({ error: "missing label" });
  try {
    const [result] = await pool.execute(
      `INSERT INTO ${TABLES.keywordNode} (label, props) VALUES (?, ?)`,
      [label, JSON.stringify(props)]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("create node failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.post("/graph/edges", async (req, res) => {
  const { srcId, dstId, relation = null, props = {} } = req.body;
  if (!srcId || !dstId) return res.status(400).json({ error: "missing srcId or dstId" });
  try {
    const [result] = await pool.execute(
      `INSERT INTO ${TABLES.keywordEdge} (src_id, dst_id, relation, props) VALUES (?, ?, ?, ?)`,
      [srcId, dstId, relation, JSON.stringify(props)]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("create edge failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/graph/edges", async (req, res) => {
  const limit = safeLimit(req.query.limit, 50, 200);
  try {
    const [rows] = await pool.query(
      `SELECT id, src_id, dst_id, relation, props, created_at FROM ${TABLES.keywordEdge} ORDER BY id DESC LIMIT ?`,
      [limit]
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
    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("failed to initialize schema", err);
    process.exit(1);
  }
};

startServer();
