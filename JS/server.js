require("dotenv").config({ override: true });
const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json({ limit: "10mb" }));

// 静的ファイル配信を追加 (プロジェクトのルートディレクトリを配信対象にする)
const publicPath = path.join(__dirname, ".."); // JSディレクトリから一つ上の階層
console.log(`[Server] Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// ルートURL ('/') へのアクセス時に main.html を提供する
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "main.html"));
});

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
const JAPANESE_CHAR_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff60\u3000-\u303f]/;

const normalizeUserId = (value) => String(value || "").trim();
const normalizePassword = (value) => String(value || "").trim();
const normalizeThemeName = (value) => String(value || "").trim();
const normalizeLogText = (value) => String(value || "");
const normalizeEventType = (value) => {
  const normalized = String(value || "system").trim().toLowerCase();
  return normalized.replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 64) || "system";
};
const normalizeThemeLanguage = (value) => {
  const lang = String(value || "").trim().toLowerCase();
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ja")) return "ja";
  return "";
};
const normalizeAdminPanelPassword = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

const isValidUserId = (id) => USER_ID_PATTERN.test(id);
const isValidPassword = (password) => password.length >= 1;
const isValidThemeName = (themeName) => themeName.length >= 1 && themeName.length <= 255;
const isValidThemeLanguage = (themeLanguage) => themeLanguage === "ja" || themeLanguage === "en";

const inferThemeLanguageFromName = (themeName, fallback = "ja") => {
  const normalizedName = normalizeThemeName(themeName);
  if (!normalizedName) return fallback;
  if (JAPANESE_CHAR_PATTERN.test(normalizedName)) return "ja";
  if (/[A-Za-z]/.test(normalizedName)) return "en";
  return fallback;
};

const resolveRequestedThemeLanguage = ({
  queryLanguage,
  bodyLanguage,
  contentLanguage,
  themeName,
  fallback = "ja",
}) => {
  const resolved =
    normalizeThemeLanguage(queryLanguage) ||
    normalizeThemeLanguage(bodyLanguage) ||
    normalizeThemeLanguage(contentLanguage);
  if (resolved) return resolved;
  return inferThemeLanguageFromName(themeName, fallback);
};

const V2_TABLES = {
  themes: "themes",
  themeVersions: "theme_versions",
  keywordNodes: "keyword_nodes",
  keywordEdges: "keyword_edges",
  hypothesisSpreads: "hypothesis_spreads",
  hypothesisNodes: "hypothesis_nodes",
  themeVersionPayloads: "theme_version_payloads",
};
const USER_ACTION_LOGS_TABLE = "user_action_logs";
const LEGACY_FILE_IMPORTS_TABLE = "legacy_file_imports";
const PROCESS_TABLES = {
  maps: "process_maps",
  nodes: "process_nodes",
  edges: "process_edges",
  hierarchy: "process_hierarchy",
};

const PROCESS_NODE_TYPE_ALIASES = new Map([
  ["problem_question", "problem"],
  ["idea_working_hypothesis", "idea"],
  ["working_hypothesis", "operational_hypothesis"],
]);

const PROCESS_NODE_TYPES = new Set([
  "problem",
  "suggestion",
  "idea",
  "explanatory_hypothesis",
  "operational_hypothesis",
  // 旧版で保存済みのデータを失わず再保存できるよう、非表示種別はAPI互換だけ残す。
  "reasoning",
  "information_work",
  "result",
  "revision_update",
]);

const PROCESS_EDGE_TYPES = new Set([
  "directed",
  "suggestion_generation",
  "selection_retention",
  "explanation",
  "reasoning",
  "operationalization",
  "verification",
  "support",
  "rejection",
  "revision",
]);

const normalizeProcessNodeType = (value) => {
  const normalized = String(value || "").trim();
  return PROCESS_NODE_TYPE_ALIASES.get(normalized) || normalized;
};

const ENABLE_V2_READ = String(process.env.ENABLE_V2_READ || "false").toLowerCase() === "true";
let v2SchemaReady = false;
let v2ThemeLanguageColumnReady = false;
let processMapSchemaReady = false;

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

const tableColumnExists = async (tableName, columnName) => {
  const [rows] = await pool.execute(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1",
    [tableName, columnName]
  );
  return rows.length > 0;
};

const resolveThemeLanguageFromData = ({
  themeName,
  rowLanguage,
  content,
  fallback = "ja",
}) => {
  const contentLanguage =
    content && typeof content === "object" && !Array.isArray(content)
      ? normalizeThemeLanguage(content.language)
      : "";
  return (
    normalizeThemeLanguage(rowLanguage) ||
    contentLanguage ||
    inferThemeLanguageFromName(themeName, fallback)
  );
};

const toObjectOrEmpty = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const canonicalizeJson = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }
  if (value && typeof value === "object") {
    const ordered = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        ordered[key] = canonicalizeJson(value[key]);
      });
    return ordered;
  }
  return value;
};

const isSameThemeContent = (left, right) =>
  JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));

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
  const hasPrimaryNodes = Array.isArray(hypothesis.nodes) && hypothesis.nodes.length > 0;

  if (hasPrimaryNodes) {
    for (let i = 0; i < hypothesis.nodes.length; i += 1) {
      const node = normalizeHypothesisNode(hypothesis.nodes[i], i);
      if (node && node.source !== "mindmap") result.push(node);
    }
  }

  const entries = toObjectOrEmpty(hypothesis.entries);
  const hypothesisEntries = Array.isArray(entries.hypotheses) ? entries.hypotheses : [];
  const scamperEntries = Array.isArray(entries.scamper) ? entries.scamper : [];
  const mapEntries = Array.isArray(hypothesis.mapNodes) ? hypothesis.mapNodes : [];

  if (!hasPrimaryNodes) {
    const startIndex = result.length;
    for (let i = 0; i < hypothesisEntries.length; i += 1) {
      const node = normalizeHypothesisNode({ ...hypothesisEntries[i], kind: "hypothesis" }, startIndex + i);
      if (node && node.source !== "mindmap") result.push(node);
    }
    for (let i = 0; i < scamperEntries.length; i += 1) {
      const node = normalizeHypothesisNode({ ...scamperEntries[i], kind: "scamper" }, result.length + i);
      if (node) result.push(node);
    }
  }

  for (let i = 0; i < mapEntries.length; i += 1) {
    const raw = toObjectOrEmpty(mapEntries[i]);
    const node = normalizeHypothesisNode({
      ...raw,
      kind: "hypothesis",
      source: raw.source || "mindmap",
    }, result.length + i);
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

const buildHypothesisNodeSignature = (node) => {
  const normalized = toObjectOrEmpty(node);
  return [
    String(normalized.kind || "hypothesis"),
    String(normalized.text || ""),
    String(normalized.basedKeywords || ""),
    String(normalized.tag || ""),
    String(normalized.source || ""),
  ].join("\u001f");
};

const diffHypothesisNodes = (previousNodes, currentNodes) => {
  const prev = Array.isArray(previousNodes) ? previousNodes : [];
  const curr = Array.isArray(currentNodes) ? currentNodes : [];

  const prevBuckets = new Map();
  for (const node of prev) {
    const normalized = toObjectOrEmpty(node);
    const sig = buildHypothesisNodeSignature(normalized);
    if (!prevBuckets.has(sig)) prevBuckets.set(sig, []);
    prevBuckets.get(sig).push(normalized);
  }

  const deltas = [];

  for (const node of curr) {
    const normalized = toObjectOrEmpty(node);
    const sig = buildHypothesisNodeSignature(normalized);
    const bucket = prevBuckets.get(sig);
    if (bucket && bucket.length > 0) {
      bucket.pop();
      continue;
    }
    deltas.push({
      ...normalized,
      op: "upsert",
    });
  }

  for (const bucket of prevBuckets.values()) {
    for (const node of bucket) {
      deltas.push({
        ...node,
        op: "delete",
      });
    }
  }

  return deltas;
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

const fetchThemesFromV2 = async (userId, themeLanguage = null) => {
  const whereClause = ["t.user_id = ?", "t.deleted_at IS NULL"];
  const params = [userId];
  const canFilterByThemeLanguage = Boolean(themeLanguage) && v2ThemeLanguageColumnReady;
  if (canFilterByThemeLanguage) {
    whereClause.push("t.theme_language = ?");
    params.push(themeLanguage);
  }

  const [rows] = await pool.execute(
    `SELECT t.theme_name, ${
      v2ThemeLanguageColumnReady ? "t.theme_language" : "NULL AS theme_language"
    }, tv.created_at AS updated_at, p.content_json
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       LEFT JOIN ${V2_TABLES.themeVersionPayloads} p
         ON p.theme_version_id = tv.id
      WHERE ${whereClause.join(" AND ")}
      ORDER BY tv.created_at DESC, t.theme_name ASC`,
    params
  );

  const mapped = rows.map((row) => {
    const content = parseJsonField(row.content_json);
    return {
      themeName: row.theme_name,
      language: resolveThemeLanguageFromData({
        themeName: row.theme_name,
        rowLanguage: row.theme_language,
        content,
      }),
      content,
      updatedAt: row.updated_at,
    };
  });

  if (themeLanguage && !v2ThemeLanguageColumnReady) {
    return mapped.filter((row) => row.language === themeLanguage);
  }

  return mapped;
};

const fetchThemeFromV2 = async (userId, themeName, themeLanguage = null) => {
  const whereClause = ["t.user_id = ?", "t.theme_name = ?", "t.deleted_at IS NULL"];
  const params = [userId, themeName];
  const canFilterByThemeLanguage = Boolean(themeLanguage) && v2ThemeLanguageColumnReady;
  if (canFilterByThemeLanguage) {
    whereClause.push("t.theme_language = ?");
    params.push(themeLanguage);
  }

  const [rows] = await pool.execute(
    `SELECT t.theme_name, ${
      v2ThemeLanguageColumnReady ? "t.theme_language" : "NULL AS theme_language"
    }, tv.created_at AS updated_at, p.content_json
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       LEFT JOIN ${V2_TABLES.themeVersionPayloads} p
         ON p.theme_version_id = tv.id
      WHERE ${whereClause.join(" AND ")}
      ORDER BY tv.created_at DESC
      LIMIT 1`,
    params
  );

  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const content = parseJsonField(row.content_json);
  const resolvedLanguage = resolveThemeLanguageFromData({
    themeName: row.theme_name,
    rowLanguage: row.theme_language,
    content,
  });
  if (themeLanguage && !v2ThemeLanguageColumnReady && resolvedLanguage !== themeLanguage) {
    return null;
  }

  return {
    themeName: row.theme_name,
    language: resolvedLanguage,
    content,
    updatedAt: row.updated_at,
  };
};

const fetchThemeHypothesisFromV2 = async (userId, themeName, themeLanguage = null) => {
  const whereClause = ["t.user_id = ?", "t.theme_name = ?", "t.deleted_at IS NULL"];
  const params = [userId, themeName];
  const canFilterByThemeLanguage = Boolean(themeLanguage) && v2ThemeLanguageColumnReady;
  if (canFilterByThemeLanguage) {
    whereClause.push("t.theme_language = ?");
    params.push(themeLanguage);
  }

  const [rows] = await pool.execute(
    `SELECT hs.hypothesis_saved_at, hs.hypothesis_node_count, hs.hypothesis_summary_json, hs.updated_at, t.theme_name, ${
      v2ThemeLanguageColumnReady ? "t.theme_language" : "NULL AS theme_language"
    }
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       INNER JOIN ${V2_TABLES.hypothesisSpreads} hs
         ON hs.theme_version_id = tv.id
      WHERE ${whereClause.join(" AND ")}
      ORDER BY hs.updated_at DESC
      LIMIT 1`,
    params
  );

  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const resolvedLanguage = resolveThemeLanguageFromData({
    themeName: row.theme_name || themeName,
    rowLanguage: row.theme_language,
    content: null,
  });
  if (themeLanguage && !v2ThemeLanguageColumnReady && resolvedLanguage !== themeLanguage) {
    return null;
  }

  return {
    userId,
    themeName,
    language: resolvedLanguage,
    html: "",
    savedAt: row.hypothesis_saved_at,
    nodeCount: row.hypothesis_node_count,
    summary: parseJsonField(row.hypothesis_summary_json),
    updatedAt: row.updated_at,
  };
};

const fetchThemeHypothesisNodesFromV2 = async (userId, themeName, themeLanguage = null) => {
  const whereClause = ["t.user_id = ?", "t.theme_name = ?", "t.deleted_at IS NULL"];
  const params = [userId, themeName];
  const canFilterByThemeLanguage = Boolean(themeLanguage) && v2ThemeLanguageColumnReady;
  if (canFilterByThemeLanguage) {
    whereClause.push("t.theme_language = ?");
    params.push(themeLanguage);
  }

  if (themeLanguage && !v2ThemeLanguageColumnReady) {
    const inferred = inferThemeLanguageFromName(themeName, "ja");
    if (inferred !== themeLanguage) {
      return null;
    }
  }

  const [rows] = await pool.execute(
    `SELECT hn.id, hn.node_text, hn.node_kind, hn.node_order, hn.based_keywords, hn.scamper_tag, hn.created_at, hn.props_json
       FROM ${V2_TABLES.themes} t
       INNER JOIN ${V2_TABLES.themeVersions} tv
         ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
       INNER JOIN ${V2_TABLES.hypothesisSpreads} hs
         ON hs.theme_version_id = tv.id
       INNER JOIN ${V2_TABLES.hypothesisNodes} hn
         ON hn.hypothesis_spread_id = hs.id
      WHERE ${whereClause.join(" AND ")}
      ORDER BY hn.node_order ASC, hn.id ASC`,
    params
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

const fetchHypothesisNodesFromV2 = async ({ userId, themeName, themeLanguage, limit }) => {
  const whereClause = ["t.deleted_at IS NULL"];
  const params = [];
  const shouldFilterByInferredLanguage = Boolean(themeLanguage) && !v2ThemeLanguageColumnReady;

  if (userId) {
    whereClause.push("t.user_id = ?");
    params.push(userId);
  }
  if (themeName) {
    whereClause.push("t.theme_name = ?");
    params.push(themeName);
  }
  if (themeLanguage && v2ThemeLanguageColumnReady) {
    whereClause.push("t.theme_language = ?");
    params.push(themeLanguage);
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

  if (!shouldFilterByInferredLanguage) {
    return rows;
  }

  return rows.filter((row) => inferThemeLanguageFromName(row.theme_name, "ja") === themeLanguage);
};

const resolveOrCreateThemeV2 = async (connection, userId, themeName, themeLanguage) => {
  const selectSql = v2ThemeLanguageColumnReady
    ? `SELECT id, latest_version_no, deleted_at FROM ${V2_TABLES.themes} WHERE user_id = ? AND theme_name = ? AND theme_language = ? ORDER BY id DESC LIMIT 1`
    : `SELECT id, latest_version_no, deleted_at FROM ${V2_TABLES.themes} WHERE user_id = ? AND theme_name = ? ORDER BY id DESC LIMIT 1`;
  const selectParams = v2ThemeLanguageColumnReady
    ? [userId, themeName, themeLanguage]
    : [userId, themeName];
  const [rows] = await connection.execute(selectSql, selectParams);

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

  const insertSql = v2ThemeLanguageColumnReady
    ? `INSERT INTO ${V2_TABLES.themes} (user_id, theme_name, theme_language, latest_version_no, lock_version) VALUES (?, ?, ?, 0, 0)`
    : `INSERT INTO ${V2_TABLES.themes} (user_id, theme_name, latest_version_no, lock_version) VALUES (?, ?, 0, 0)`;
  const insertParams = v2ThemeLanguageColumnReady
    ? [userId, themeName, themeLanguage]
    : [userId, themeName];
  const [insertResult] = await connection.execute(insertSql, insertParams);

  return {
    themeId: insertResult.insertId,
    latestVersionNo: 0,
  };
};

const syncThemeToV2 = async (
  userId,
  themeName,
  themeLanguage,
  content,
  note = "dual-write from /users/:id/themes",
  previousContent = null
) => {
  if (!canWriteV2()) return;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const theme = await resolveOrCreateThemeV2(connection, userId, themeName, themeLanguage);
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
          themeLanguage,
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
          themeLanguage,
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
    const normalizedPreviousHypothesis = normalizeHypothesisPayload(previousContent?.hypothesis);
    const hypothesisHtml = String(normalizedHypothesis.html || "").trim();
    const hypothesisNodes = Array.isArray(normalizedHypothesis.nodes) ? normalizedHypothesis.nodes : [];
    const previousHypothesisNodes = Array.isArray(normalizedPreviousHypothesis.nodes)
      ? normalizedPreviousHypothesis.nodes
      : [];
    const hypothesisNodeDeltas = diffHypothesisNodes(previousHypothesisNodes, hypothesisNodes);
    const savedAt = toMysqlDateTimeOrNull(normalizedHypothesis.savedAt);
    const summary = {
      schemaVersion: 2,
      hypothesisCount: normalizedHypothesis?.stats?.hypothesisCount || 0,
      scamperCount: normalizedHypothesis?.stats?.scamperCount || 0,
      totalCount: hypothesisNodeDeltas.length,
    };

    const hasHypothesisData =
      Boolean(hypothesisHtml) || hypothesisNodeDeltas.length > 0 || Boolean(savedAt);
    let hypothesisSpreadId = null;
    if (hasHypothesisData) {
      const [spreadResult] = await connection.execute(
        `INSERT INTO ${V2_TABLES.hypothesisSpreads} (theme_version_id, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json) VALUES (?, ?, ?, ?)`,
        [themeVersionId, savedAt, hypothesisNodeDeltas.length, JSON.stringify(summary)]
      );
      hypothesisSpreadId = spreadResult.insertId;
    }

    let nodeOrder = 0;
    for (const node of hypothesisNodeDeltas) {
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
          JSON.stringify({
            ...normalizedNode,
            op: String(normalizedNode.op || "upsert"),
          }),
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

const softDeleteThemeV2 = async (userId, themeName, themeLanguage = null) => {
  if (!canWriteV2()) return 0;

  if (themeLanguage && !v2ThemeLanguageColumnReady) {
    const [rows] = await pool.execute(
      `SELECT t.id, t.theme_name, p.content_json
         FROM ${V2_TABLES.themes} t
         INNER JOIN ${V2_TABLES.themeVersions} tv
           ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
         LEFT JOIN ${V2_TABLES.themeVersionPayloads} p
           ON p.theme_version_id = tv.id
        WHERE t.user_id = ? AND t.theme_name = ? AND t.deleted_at IS NULL
        ORDER BY t.id DESC
        LIMIT 1`,
      [userId, themeName]
    );
    if (!rows || rows.length === 0) {
      return 0;
    }
    const row = rows[0];
    const content = parseJsonField(row.content_json);
    const resolvedLanguage = resolveThemeLanguageFromData({
      themeName: row.theme_name,
      rowLanguage: null,
      content,
    });
    if (resolvedLanguage !== themeLanguage) {
      return 0;
    }
    const [result] = await pool.execute(
      `UPDATE ${V2_TABLES.themes} SET deleted_at = CURRENT_TIMESTAMP, lock_version = lock_version + 1 WHERE id = ?`,
      [row.id]
    );
    return Number(result.affectedRows || 0);
  }

  const whereClause = ["user_id = ?", "theme_name = ?", "deleted_at IS NULL"];
  const params = [userId, themeName];
  if (themeLanguage && v2ThemeLanguageColumnReady) {
    whereClause.push("theme_language = ?");
    params.push(themeLanguage);
  }
  const [result] = await pool.execute(
    `UPDATE ${V2_TABLES.themes} SET deleted_at = CURRENT_TIMESTAMP, lock_version = lock_version + 1 WHERE ${whereClause.join(" AND ")}`,
    params
  );
  return Number(result.affectedRows || 0);
};

const softDeleteThemesByUserV2 = async (userId, themeLanguage = null) => {
  if (!canWriteV2()) return 0;

  if (themeLanguage && !v2ThemeLanguageColumnReady) {
    const [rows] = await pool.execute(
      `SELECT t.id, t.theme_name, p.content_json
         FROM ${V2_TABLES.themes} t
         INNER JOIN ${V2_TABLES.themeVersions} tv
           ON tv.theme_id = t.id AND tv.version_no = t.latest_version_no
         LEFT JOIN ${V2_TABLES.themeVersionPayloads} p
           ON p.theme_version_id = tv.id
        WHERE t.user_id = ? AND t.deleted_at IS NULL`,
      [userId]
    );
    const targetIds = rows
      .filter((row) => {
        const content = parseJsonField(row.content_json);
        const resolvedLanguage = resolveThemeLanguageFromData({
          themeName: row.theme_name,
          rowLanguage: null,
          content,
        });
        return resolvedLanguage === themeLanguage;
      })
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (targetIds.length === 0) {
      return 0;
    }

    const placeholders = targetIds.map(() => "?").join(", ");
    const [result] = await pool.execute(
      `UPDATE ${V2_TABLES.themes} SET deleted_at = CURRENT_TIMESTAMP, lock_version = lock_version + 1 WHERE id IN (${placeholders})`,
      targetIds
    );
    return Number(result.affectedRows || 0);
  }

  const whereClause = ["user_id = ?", "deleted_at IS NULL"];
  const params = [userId];
  if (themeLanguage && v2ThemeLanguageColumnReady) {
    whereClause.push("theme_language = ?");
    params.push(themeLanguage);
  }
  const [result] = await pool.execute(
    `UPDATE ${V2_TABLES.themes} SET deleted_at = CURRENT_TIMESTAMP, lock_version = lock_version + 1 WHERE ${whereClause.join(" AND ")}`,
    params
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

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${USER_ACTION_LOGS_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      theme_name VARCHAR(255) NULL,
      event_type VARCHAR(64) NOT NULL DEFAULT 'system',
      log_text TEXT NOT NULL,
      payload_json JSON NULL,
      import_key CHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_action_logs_import_key (import_key),
      INDEX idx_user_action_logs_user_time (user_id, created_at),
      INDEX idx_user_action_logs_theme_time (user_id, theme_name, created_at)
    )`
  );

  try {
    await pool.execute(`ALTER TABLE ${USER_ACTION_LOGS_TABLE} ADD COLUMN import_key CHAR(64) NULL`);
  } catch (err) {
    if (!(err && err.code === "ER_DUP_FIELDNAME")) throw err;
  }

  try {
    await pool.execute(
      `ALTER TABLE ${USER_ACTION_LOGS_TABLE} ADD UNIQUE INDEX uk_user_action_logs_import_key (import_key)`
    );
  } catch (err) {
    if (!(err && err.code === "ER_DUP_KEYNAME")) throw err;
  }

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${LEGACY_FILE_IMPORTS_TABLE} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      import_key CHAR(64) NOT NULL,
      source_path VARCHAR(1024) NOT NULL,
      file_type VARCHAR(32) NOT NULL,
      user_id VARCHAR(64) NULL,
      theme_name VARCHAR(255) NULL,
      content_blob LONGBLOB NOT NULL,
      content_sha256 CHAR(64) NOT NULL,
      file_size BIGINT NOT NULL,
      file_modified_at DATETIME(3) NULL,
      metadata_json JSON NULL,
      imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_legacy_file_imports_key (import_key),
      INDEX idx_legacy_file_imports_type (file_type),
      INDEX idx_legacy_file_imports_user_theme (user_id, theme_name)
    )`
  );
};

const ensureProcessMapSchema = async () => {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${PROCESS_TABLES.maps} (
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
      CONSTRAINT fk_process_maps_theme FOREIGN KEY (theme_id) REFERENCES ${V2_TABLES.themes}(id) ON DELETE CASCADE,
      UNIQUE KEY uk_process_maps_root (user_id, root_theme_id),
      INDEX idx_process_maps_theme_updated (theme_id, updated_at)
    )`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${PROCESS_TABLES.nodes} (
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
      CONSTRAINT fk_process_nodes_map FOREIGN KEY (map_id) REFERENCES ${PROCESS_TABLES.maps}(map_id) ON DELETE CASCADE,
      INDEX idx_process_nodes_map_updated (map_id, updated_at),
      INDEX idx_process_nodes_parent (parent_node_id)
    )`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${PROCESS_TABLES.edges} (
      edge_id VARCHAR(64) PRIMARY KEY,
      map_id BIGINT NOT NULL,
      source_node_id VARCHAR(64) NOT NULL,
      target_node_id VARCHAR(64) NOT NULL,
      edge_type VARCHAR(64) NOT NULL DEFAULT 'directed',
      reasoning_text TEXT NULL,
      memo TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_process_edges_map FOREIGN KEY (map_id) REFERENCES ${PROCESS_TABLES.maps}(map_id) ON DELETE CASCADE,
      CONSTRAINT fk_process_edges_source FOREIGN KEY (source_node_id) REFERENCES ${PROCESS_TABLES.nodes}(node_id) ON DELETE CASCADE,
      CONSTRAINT fk_process_edges_target FOREIGN KEY (target_node_id) REFERENCES ${PROCESS_TABLES.nodes}(node_id) ON DELETE CASCADE,
      INDEX idx_process_edges_map (map_id),
      INDEX idx_process_edges_source (source_node_id),
      INDEX idx_process_edges_target (target_node_id)
    )`
  );

  if (!(await tableColumnExists(PROCESS_TABLES.edges, "reasoning_text"))) {
    await pool.execute(`ALTER TABLE ${PROCESS_TABLES.edges} ADD COLUMN reasoning_text TEXT NULL AFTER edge_type`);
  }
  if (!(await tableColumnExists(PROCESS_TABLES.edges, "memo"))) {
    await pool.execute(`ALTER TABLE ${PROCESS_TABLES.edges} ADD COLUMN memo TEXT NULL AFTER reasoning_text`);
  }
  if (!(await tableColumnExists(PROCESS_TABLES.edges, "updated_at"))) {
    await pool.execute(
      `ALTER TABLE ${PROCESS_TABLES.edges}
       ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`
    );
  }

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${PROCESS_TABLES.hierarchy} (
      parent_map_id BIGINT NOT NULL,
      child_map_id BIGINT NOT NULL,
      parent_node_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (parent_map_id, child_map_id),
      UNIQUE KEY uk_process_hierarchy_child (child_map_id),
      UNIQUE KEY uk_process_hierarchy_parent_node (parent_node_id),
      CONSTRAINT fk_process_hierarchy_parent_map FOREIGN KEY (parent_map_id) REFERENCES ${PROCESS_TABLES.maps}(map_id) ON DELETE CASCADE,
      CONSTRAINT fk_process_hierarchy_child_map FOREIGN KEY (child_map_id) REFERENCES ${PROCESS_TABLES.maps}(map_id) ON DELETE CASCADE,
      CONSTRAINT fk_process_hierarchy_parent_node FOREIGN KEY (parent_node_id) REFERENCES ${PROCESS_TABLES.nodes}(node_id) ON DELETE RESTRICT,
      INDEX idx_process_hierarchy_parent (parent_map_id)
    )`
  );
};

const normalizeProcessText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);
const PROCESS_CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const parseProcessMapId = (value) => {
  const mapId = Number(value);
  return Number.isInteger(mapId) && mapId > 0 ? mapId : null;
};

const resolveProcessTheme = async (executor, { userId, themeName, language, forUpdate = false }) => {
  const where = ["user_id = ?", "theme_name = ?", "deleted_at IS NULL"];
  const params = [userId, themeName];
  if (language && v2ThemeLanguageColumnReady) {
    where.push("theme_language = ?");
    params.push(language);
  }
  const [rows] = await executor.execute(
    `SELECT id, user_id, theme_name${v2ThemeLanguageColumnReady ? ", theme_language" : ""}
       FROM ${V2_TABLES.themes}
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    params
  );
  return rows[0] || null;
};

const processMapRowToJson = (row) => ({
  mapId: Number(row.map_id),
  userId: row.user_id,
  themeId: Number(row.theme_id),
  title: row.title,
  grainSize: row.grain_size,
  isRoot: Boolean(row.is_root),
  parentMapId: row.parent_map_id === null || row.parent_map_id === undefined ? null : Number(row.parent_map_id),
  parentNodeId: row.parent_node_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fetchProcessMapBundle = async (executor, mapId, userId) => {
  const [mapRows] = await executor.execute(
    `SELECT m.map_id, m.user_id, m.theme_id, m.title, m.grain_size, m.is_root,
            m.created_at, m.updated_at, h.parent_map_id, h.parent_node_id
       FROM ${PROCESS_TABLES.maps} m
       LEFT JOIN ${PROCESS_TABLES.hierarchy} h ON h.child_map_id = m.map_id
      WHERE m.map_id = ? AND m.user_id = ?
      LIMIT 1`,
    [mapId, userId]
  );
  if (mapRows.length === 0) return null;

  const [nodeRows] = await executor.execute(
    `SELECT node_id, map_id, node_type, content, memo, related_keywords_json,
            related_reference, parent_node_id, existing_reference_type, existing_reference_id,
            x, y, created_at, updated_at
       FROM ${PROCESS_TABLES.nodes}
      WHERE map_id = ?
      ORDER BY created_at, node_id`,
    [mapId]
  );
  const [edgeRows] = await executor.execute(
    `SELECT edge_id, map_id, source_node_id, target_node_id, edge_type,
            reasoning_text, memo, created_at, updated_at
       FROM ${PROCESS_TABLES.edges}
      WHERE map_id = ?
      ORDER BY created_at, edge_id`,
    [mapId]
  );
  const [childRows] = await executor.execute(
    `SELECT h.parent_node_id, h.child_map_id, m.title, m.grain_size, m.created_at, m.updated_at
       FROM ${PROCESS_TABLES.hierarchy} h
       INNER JOIN ${PROCESS_TABLES.maps} m ON m.map_id = h.child_map_id
      WHERE h.parent_map_id = ?
      ORDER BY h.created_at, h.child_map_id`,
    [mapId]
  );

  const breadcrumbs = [];
  let cursor = mapRows[0];
  const visited = new Set();
  while (cursor && breadcrumbs.length < 50 && !visited.has(Number(cursor.map_id))) {
    visited.add(Number(cursor.map_id));
    breadcrumbs.unshift({
      mapId: Number(cursor.map_id),
      title: cursor.title,
      grainSize: cursor.grain_size,
    });
    const [parentRows] = await executor.execute(
      `SELECT parent.map_id, parent.user_id, parent.theme_id, parent.title, parent.grain_size,
              parent.is_root, parent.created_at, parent.updated_at
         FROM ${PROCESS_TABLES.hierarchy} h
         INNER JOIN ${PROCESS_TABLES.maps} parent ON parent.map_id = h.parent_map_id
        WHERE h.child_map_id = ?
        LIMIT 1`,
      [cursor.map_id]
    );
    cursor = parentRows[0] || null;
  }

  return {
    map: processMapRowToJson(mapRows[0]),
    breadcrumbs,
    nodes: nodeRows.map((row) => ({
      nodeId: row.node_id,
      mapId: Number(row.map_id),
      nodeType: normalizeProcessNodeType(row.node_type),
      content: row.content,
      memo: row.memo || "",
      relatedKeywords: parseJsonField(row.related_keywords_json) || [],
      relatedReference: row.related_reference || "",
      parentNodeId: row.parent_node_id || null,
      existingReferenceType: row.existing_reference_type || "",
      existingReferenceId: row.existing_reference_id || "",
      x: row.x === null ? null : Number(row.x),
      y: row.y === null ? null : Number(row.y),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    edges: edgeRows.map((row) => ({
      edgeId: row.edge_id,
      mapId: Number(row.map_id),
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      edgeType: row.edge_type,
      reasoningText: row.reasoning_text || "",
      memo: row.memo || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    childMaps: childRows.map((row) => ({
      parentNodeId: row.parent_node_id,
      childMapId: Number(row.child_map_id),
      title: row.title,
      grainSize: row.grain_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
};

const validateProcessSnapshot = (body) => {
  const nodes = Array.isArray(body.nodes) ? body.nodes : null;
  const edges = Array.isArray(body.edges) ? body.edges : null;
  if (!nodes || !edges) return { error: "nodes and edges must be arrays" };
  if (nodes.length > 1000 || edges.length > 2000) return { error: "process map is too large" };

  const nodeIds = new Set();
  const normalizedNodes = [];
  for (const node of nodes) {
    const nodeId = String(node.nodeId || "").trim();
    const nodeType = normalizeProcessNodeType(node.nodeType);
    const content = String(node.content || "").trim();
    if (!PROCESS_CLIENT_ID_PATTERN.test(nodeId)) return { error: "invalid nodeId" };
    if (nodeIds.has(nodeId)) return { error: "duplicate nodeId" };
    if (!PROCESS_NODE_TYPES.has(nodeType)) return { error: "invalid nodeType" };
    if (!content || content.length > 10000) return { error: "invalid node content" };
    const relatedKeywords = Array.isArray(node.relatedKeywords)
      ? [...new Set(node.relatedKeywords.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 100)
      : [];
    nodeIds.add(nodeId);
    normalizedNodes.push({
      nodeId,
      nodeType,
      content,
      memo: String(node.memo || "").slice(0, 50000),
      relatedKeywords,
      relatedReference: String(node.relatedReference || "").slice(0, 50000),
      parentNodeId: node.parentNodeId && PROCESS_CLIENT_ID_PATTERN.test(String(node.parentNodeId)) ? String(node.parentNodeId) : null,
      existingReferenceType: normalizeProcessText(node.existingReferenceType, 64) || null,
      existingReferenceId: normalizeProcessText(node.existingReferenceId, 255) || null,
      x: Number.isFinite(Number(node.x)) ? Number(node.x) : null,
      y: Number.isFinite(Number(node.y)) ? Number(node.y) : null,
    });
  }

  const edgeIds = new Set();
  const normalizedEdges = [];
  for (const edge of edges) {
    const edgeId = String(edge.edgeId || "").trim();
    const sourceNodeId = String(edge.sourceNodeId || "").trim();
    const targetNodeId = String(edge.targetNodeId || "").trim();
    const edgeType = String(edge.edgeType || "directed").trim();
    if (!PROCESS_CLIENT_ID_PATTERN.test(edgeId)) return { error: "invalid edgeId" };
    if (edgeIds.has(edgeId)) return { error: "duplicate edgeId" };
    if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) return { error: "edge endpoint is missing" };
    if (sourceNodeId === targetNodeId) return { error: "self links are not supported" };
    if (!PROCESS_EDGE_TYPES.has(edgeType)) return { error: "invalid edgeType" };
    edgeIds.add(edgeId);
    normalizedEdges.push({
      edgeId,
      sourceNodeId,
      targetNodeId,
      edgeType,
      reasoningText: String(edge.reasoningText || "").slice(0, 50000),
      memo: String(edge.memo || "").slice(0, 50000),
    });
  }

  return { nodes: normalizedNodes, edges: normalizedEdges };
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
  const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : "";
  if (!userId) {
    return res.status(400).json({ error: "missing id" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (req.query.language && !themeLanguage) {
    return res.status(400).json({ error: "invalid language" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const payload = await fetchThemesFromV2(userId, themeLanguage || null);
    res.json(payload);
  } catch (err) {
    console.error("fetch themes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/users/:id/themes/:themeName", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const themeName = normalizeThemeName(req.params.themeName || "");
  const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : "";
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }
  if (req.query.language && !themeLanguage) {
    return res.status(400).json({ error: "invalid language" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Theme = await fetchThemeFromV2(userId, themeName, themeLanguage || null);
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
  const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : "";
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }
  if (req.query.language && !themeLanguage) {
    return res.status(400).json({ error: "invalid language" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Hypothesis = await fetchThemeHypothesisFromV2(userId, themeName, themeLanguage || null);
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
  const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : "";
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }
  if (req.query.language && !themeLanguage) {
    return res.status(400).json({ error: "invalid language" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Nodes = await fetchThemeHypothesisNodesFromV2(userId, themeName, themeLanguage || null);
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
  const themeLanguage = resolveRequestedThemeLanguage({
    queryLanguage: req.query.language,
    bodyLanguage: req.body.language,
    contentLanguage: incomingContent && typeof incomingContent === "object" ? incomingContent.language : "",
    themeName,
  });

  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (!isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }
  if (!isValidThemeLanguage(themeLanguage)) {
    return res.status(400).json({ error: "invalid language" });
  }

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }

  try {
    const existingTheme = await fetchThemeFromV2(userId, themeName, themeLanguage);
    const existingContent = existingTheme && existingTheme.content ? existingTheme.content : {};
    const mergedContent = mergeThemeContent(existingContent, incomingContent);
    mergedContent.language = themeLanguage;

    if (existingTheme && isSameThemeContent(existingContent, mergedContent)) {
      return res.json({ userId, themeName, saved: true, skipped: true, reason: "no content change" });
    }

    await syncThemeToV2(
      userId,
      themeName,
      themeLanguage,
      mergedContent,
      "v2-primary write from /users/:id/themes",
      existingContent
    );

    res.json({ userId, themeName, language: themeLanguage, saved: true });
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
  const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : "";
  if (!userId) {
    return res.status(400).json({ error: "missing id" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (req.query.language && !themeLanguage) {
    return res.status(400).json({ error: "invalid language" });
  }

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }

  try {
    const v2AffectedThemes = await softDeleteThemesByUserV2(userId, themeLanguage || null);
    res.json({ userId, language: themeLanguage || null, deletedAll: true, v2AffectedThemes: v2AffectedThemes || 0 });
  } catch (err) {
    console.error("delete all themes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.delete("/users/:id/themes/:themeName", async (req, res) => {
  const userId = normalizeUserId(req.params.id);
  const themeName = normalizeThemeName(decodeURIComponent(req.params.themeName || ""));
  const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : "";
  if (!userId || !themeName) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid id format" });
  }
  if (req.query.language && !themeLanguage) {
    return res.status(400).json({ error: "invalid language" });
  }

  if (!canWriteV2()) {
    return res.status(503).json({ error: "v2 write is disabled or schema is not ready" });
  }

  try {
    const v2AffectedRows = await softDeleteThemeV2(userId, themeName, themeLanguage || null);
    if (Number(v2AffectedRows || 0) === 0) {
      return res.status(404).json({ error: "theme not found" });
    }
    res.json({ userId, themeName, language: themeLanguage || null, deleted: true, v2AffectedRows: Number(v2AffectedRows || 0) });
  } catch (err) {
    console.error("delete theme failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/process-maps/root", async (req, res) => {
  if (!processMapSchemaReady) {
    return res.status(503).json({ error: "process map schema is not ready" });
  }
  const userId = normalizeUserId(req.query.userId);
  const themeName = normalizeThemeName(req.query.themeName);
  const language = req.query.language ? normalizeThemeLanguage(req.query.language) : "";
  if (!isValidUserId(userId) || !isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid userId or themeName" });
  }
  if (req.query.language && !language) {
    return res.status(400).json({ error: "invalid language" });
  }

  try {
    const theme = await resolveProcessTheme(pool, { userId, themeName, language });
    if (!theme) return res.status(404).json({ error: "theme not found" });
    const [mapRows] = await pool.execute(
      `SELECT map_id
         FROM ${PROCESS_TABLES.maps}
        WHERE user_id = ? AND theme_id = ? AND is_root = 1
        ORDER BY map_id
        LIMIT 1`,
      [userId, theme.id]
    );
    if (mapRows.length === 0) return res.status(404).json({ error: "process map not found" });
    const bundle = await fetchProcessMapBundle(pool, Number(mapRows[0].map_id), userId);
    return res.json(bundle);
  } catch (err) {
    console.error("fetch root process map failed", err);
    return res.status(500).json({ error: "db error" });
  }
});

app.post("/process-maps/root", async (req, res) => {
  if (!processMapSchemaReady) {
    return res.status(503).json({ error: "process map schema is not ready" });
  }
  const userId = normalizeUserId(req.body.userId);
  const themeName = normalizeThemeName(req.body.themeName);
  const language = normalizeThemeLanguage(req.body.language) || inferThemeLanguageFromName(themeName);
  const title = normalizeProcessText(req.body.title || themeName, 255);
  if (!isValidUserId(userId) || !isValidThemeName(themeName) || !isValidThemeLanguage(language) || !title) {
    return res.status(400).json({ error: "invalid process map fields" });
  }

  const connection = await pool.getConnection();
  let mapId = null;
  let created = false;
  try {
    await connection.beginTransaction();
    const theme = await resolveProcessTheme(connection, {
      userId,
      themeName,
      language,
      forUpdate: true,
    });
    if (!theme) {
      await connection.rollback();
      return res.status(404).json({ error: "theme not found" });
    }
    const [existingRows] = await connection.execute(
      `SELECT map_id
         FROM ${PROCESS_TABLES.maps}
        WHERE user_id = ? AND theme_id = ? AND is_root = 1
        LIMIT 1 FOR UPDATE`,
      [userId, theme.id]
    );
    if (existingRows.length > 0) {
      mapId = Number(existingRows[0].map_id);
    } else {
      const [result] = await connection.execute(
        `INSERT INTO ${PROCESS_TABLES.maps} (user_id, theme_id, title, grain_size, is_root)
         VALUES (?, ?, ?, '研究全体', 1)`,
        [userId, theme.id, title]
      );
      mapId = Number(result.insertId);
      created = true;
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error("create root process map failed", err);
    return res.status(500).json({ error: "db error" });
  } finally {
    connection.release();
  }

  try {
    const bundle = await fetchProcessMapBundle(pool, mapId, userId);
    return res.status(created ? 201 : 200).json(bundle);
  } catch (err) {
    console.error("fetch created root process map failed", err);
    return res.status(500).json({ error: "db error" });
  }
});

app.get("/process-maps/:mapId", async (req, res) => {
  if (!processMapSchemaReady) {
    return res.status(503).json({ error: "process map schema is not ready" });
  }
  const mapId = parseProcessMapId(req.params.mapId);
  const userId = normalizeUserId(req.query.userId);
  if (!mapId || !isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid mapId or userId" });
  }
  try {
    const bundle = await fetchProcessMapBundle(pool, mapId, userId);
    if (!bundle) return res.status(404).json({ error: "process map not found" });
    return res.json(bundle);
  } catch (err) {
    console.error("fetch process map failed", err);
    return res.status(500).json({ error: "db error" });
  }
});

app.put("/process-maps/:mapId/snapshot", async (req, res) => {
  if (!processMapSchemaReady) {
    return res.status(503).json({ error: "process map schema is not ready" });
  }
  const mapId = parseProcessMapId(req.params.mapId);
  const userId = normalizeUserId(req.body.userId);
  const title = normalizeProcessText(req.body.title, 255);
  const grainSize = normalizeProcessText(req.body.grainSize, 64);
  const snapshot = validateProcessSnapshot(req.body);
  if (!mapId || !isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid mapId or userId" });
  }
  if (snapshot.error) return res.status(400).json({ error: snapshot.error });
  if (!title || !grainSize) return res.status(400).json({ error: "title and grainSize are required" });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [mapRows] = await connection.execute(
      `SELECT map_id FROM ${PROCESS_TABLES.maps} WHERE map_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [mapId, userId]
    );
    if (mapRows.length === 0) {
      const error = new Error("process map not found");
      error.status = 404;
      throw error;
    }

    const incomingNodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));
    const [protectedRows] = await connection.execute(
      `SELECT parent_node_id FROM ${PROCESS_TABLES.hierarchy} WHERE parent_map_id = ?`,
      [mapId]
    );
    const missingProtectedNode = protectedRows.find((row) => !incomingNodeIds.has(String(row.parent_node_id)));
    if (missingProtectedNode) {
      const error = new Error("a node with a child process map cannot be deleted");
      error.status = 409;
      error.nodeId = missingProtectedNode.parent_node_id;
      throw error;
    }

    if (snapshot.nodes.length > 0) {
      const placeholders = snapshot.nodes.map(() => "?").join(", ");
      const [collisionRows] = await connection.query(
        `SELECT node_id FROM ${PROCESS_TABLES.nodes} WHERE node_id IN (${placeholders}) AND map_id <> ? LIMIT 1`,
        [...snapshot.nodes.map((node) => node.nodeId), mapId]
      );
      if (collisionRows.length > 0) {
        const error = new Error("nodeId already belongs to another process map");
        error.status = 409;
        throw error;
      }
    }
    if (snapshot.edges.length > 0) {
      const placeholders = snapshot.edges.map(() => "?").join(", ");
      const [collisionRows] = await connection.query(
        `SELECT edge_id FROM ${PROCESS_TABLES.edges} WHERE edge_id IN (${placeholders}) AND map_id <> ? LIMIT 1`,
        [...snapshot.edges.map((edge) => edge.edgeId), mapId]
      );
      if (collisionRows.length > 0) {
        const error = new Error("edgeId already belongs to another process map");
        error.status = 409;
        throw error;
      }
    }

    await connection.execute(`DELETE FROM ${PROCESS_TABLES.edges} WHERE map_id = ?`, [mapId]);

    for (const node of snapshot.nodes) {
      await connection.execute(
        `INSERT INTO ${PROCESS_TABLES.nodes}
          (node_id, map_id, node_type, content, memo, related_keywords_json, related_reference,
           parent_node_id, existing_reference_type, existing_reference_id, x, y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           node_type = VALUES(node_type),
           content = VALUES(content),
           memo = VALUES(memo),
           related_keywords_json = VALUES(related_keywords_json),
           related_reference = VALUES(related_reference),
           parent_node_id = VALUES(parent_node_id),
           existing_reference_type = VALUES(existing_reference_type),
           existing_reference_id = VALUES(existing_reference_id),
           x = VALUES(x),
           y = VALUES(y),
           updated_at = CURRENT_TIMESTAMP`,
        [
          node.nodeId,
          mapId,
          node.nodeType,
          node.content,
          node.memo || null,
          JSON.stringify(node.relatedKeywords),
          node.relatedReference || null,
          node.parentNodeId,
          node.existingReferenceType,
          node.existingReferenceId,
          node.x,
          node.y,
        ]
      );
    }

    if (snapshot.nodes.length > 0) {
      const placeholders = snapshot.nodes.map(() => "?").join(", ");
      await connection.query(
        `DELETE FROM ${PROCESS_TABLES.nodes} WHERE map_id = ? AND node_id NOT IN (${placeholders})`,
        [mapId, ...snapshot.nodes.map((node) => node.nodeId)]
      );
    } else {
      await connection.execute(`DELETE FROM ${PROCESS_TABLES.nodes} WHERE map_id = ?`, [mapId]);
    }

    for (const edge of snapshot.edges) {
      await connection.execute(
        `INSERT INTO ${PROCESS_TABLES.edges}
          (edge_id, map_id, source_node_id, target_node_id, edge_type, reasoning_text, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          edge.edgeId,
          mapId,
          edge.sourceNodeId,
          edge.targetNodeId,
          edge.edgeType,
          edge.reasoningText || null,
          edge.memo || null,
        ]
      );
    }

    await connection.execute(
      `UPDATE ${PROCESS_TABLES.maps}
          SET title = ?, grain_size = ?, updated_at = CURRENT_TIMESTAMP
        WHERE map_id = ?`,
      [title, grainSize, mapId]
    );
    await connection.commit();
    return res.json({ saved: true, mapId, nodeCount: snapshot.nodes.length, edgeCount: snapshot.edges.length });
  } catch (err) {
    await connection.rollback();
    if (err.status) {
      return res.status(err.status).json({ error: err.message, nodeId: err.nodeId || null });
    }
    console.error("save process map snapshot failed", err);
    return res.status(500).json({ error: "db error" });
  } finally {
    connection.release();
  }
});

app.post("/process-maps/:mapId/children", async (req, res) => {
  if (!processMapSchemaReady) {
    return res.status(503).json({ error: "process map schema is not ready" });
  }
  const parentMapId = parseProcessMapId(req.params.mapId);
  const userId = normalizeUserId(req.body.userId);
  const parentNodeId = String(req.body.parentNodeId || "").trim();
  const title = normalizeProcessText(req.body.title, 255);
  const grainSize = normalizeProcessText(req.body.grainSize || "個別作業", 64);
  if (
    !parentMapId ||
    !isValidUserId(userId) ||
    !PROCESS_CLIENT_ID_PATTERN.test(parentNodeId) ||
    !title ||
    !grainSize
  ) {
    return res.status(400).json({ error: "invalid child process map fields" });
  }

  const connection = await pool.getConnection();
  let childMapId = null;
  let created = false;
  try {
    await connection.beginTransaction();
    const [parentRows] = await connection.execute(
      `SELECT map_id, theme_id FROM ${PROCESS_TABLES.maps} WHERE map_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [parentMapId, userId]
    );
    if (parentRows.length === 0) {
      const error = new Error("parent process map not found");
      error.status = 404;
      throw error;
    }
    const [nodeRows] = await connection.execute(
      `SELECT node_id FROM ${PROCESS_TABLES.nodes} WHERE node_id = ? AND map_id = ? LIMIT 1 FOR UPDATE`,
      [parentNodeId, parentMapId]
    );
    if (nodeRows.length === 0) {
      const error = new Error("parent node not found; save the map before creating a child grain");
      error.status = 404;
      throw error;
    }
    const [existingRows] = await connection.execute(
      `SELECT child_map_id FROM ${PROCESS_TABLES.hierarchy} WHERE parent_node_id = ? LIMIT 1 FOR UPDATE`,
      [parentNodeId]
    );
    if (existingRows.length > 0) {
      childMapId = Number(existingRows[0].child_map_id);
    } else {
      const [insertMapResult] = await connection.execute(
        `INSERT INTO ${PROCESS_TABLES.maps} (user_id, theme_id, title, grain_size, is_root)
         VALUES (?, ?, ?, ?, 0)`,
        [userId, parentRows[0].theme_id, title, grainSize]
      );
      childMapId = Number(insertMapResult.insertId);
      await connection.execute(
        `INSERT INTO ${PROCESS_TABLES.hierarchy} (parent_map_id, child_map_id, parent_node_id)
         VALUES (?, ?, ?)`,
        [parentMapId, childMapId, parentNodeId]
      );
      created = true;
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("create child process map failed", err);
    return res.status(500).json({ error: "db error" });
  } finally {
    connection.release();
  }

  try {
    const bundle = await fetchProcessMapBundle(pool, childMapId, userId);
    return res.status(created ? 201 : 200).json(bundle);
  } catch (err) {
    console.error("fetch child process map failed", err);
    return res.status(500).json({ error: "db error" });
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

app.post("/logs", async (req, res) => {
  const userId = normalizeUserId(req.body.userId || req.body.userName);
  const themeName = normalizeThemeName(req.body.themeName || "");
  const eventType = normalizeEventType(req.body.eventType);
  const logText = normalizeLogText(req.body.logText || req.body.message);
  const payload =
    req.body.payload && typeof req.body.payload === "object" && !Array.isArray(req.body.payload)
      ? req.body.payload
      : null;

  if (!userId || !logText) {
    return res.status(400).json({ error: "userId and logText are required" });
  }
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid userId" });
  }
  if (themeName && !isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO ${USER_ACTION_LOGS_TABLE} (user_id, theme_name, event_type, log_text, payload_json) VALUES (?, ?, ?, ?, ?)`,
      [userId, themeName || null, eventType, logText, payload ? JSON.stringify(payload) : null]
    );
    res.status(201).json({ id: result.insertId, saved: true });
  } catch (err) {
    console.error("save log failed", err);
    res.status(500).json({ error: "failed to save log" });
  }
});

app.get("/logs", async (req, res) => {
  const userId = req.query.userId ? normalizeUserId(req.query.userId) : "";
  const themeName = req.query.themeName ? normalizeThemeName(req.query.themeName) : "";
  const limit = safeLimit(req.query.limit, 50, 200);

  if (userId && !isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid userId" });
  }
  if (themeName && !isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }

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
  params.push(limit);

  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, theme_name, event_type, log_text, payload_json, created_at
         FROM ${USER_ACTION_LOGS_TABLE}
        ${whereClause.length ? `WHERE ${whereClause.join(" AND ")}` : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      params
    );
    res.json(
      rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        themeName: row.theme_name,
        eventType: row.event_type,
        logText: row.log_text,
        payload: parseJsonField(row.payload_json),
        createdAt: row.created_at,
      }))
    );
  } catch (err) {
    console.error("fetch logs failed", err);
    res.status(500).json({ error: "failed to fetch logs" });
  }
});

app.post("/admin/auth", async (req, res) => {
  const inputPassword = normalizeAdminPanelPassword(req.body.password);
  const expectedPassword = normalizeAdminPanelPassword(process.env.ADMIN_PANEL_PASSWORD || "kslabkslab");

  if (!inputPassword) {
    return res.status(400).json({ error: "missing password" });
  }

  if (inputPassword !== expectedPassword) {
    return res.status(401).json({ error: "invalid admin password" });
  }

  return res.json({ authenticated: true });
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
  const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : null;
  if (userId && !isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid userId format" });
  }
  if (themeName && !isValidThemeName(themeName)) {
    return res.status(400).json({ error: "invalid themeName" });
  }
  if (req.query.language && !themeLanguage) {
    return res.status(400).json({ error: "invalid language" });
  }

  try {
    if (!canReadV2()) {
      return res.status(503).json({ error: "v2 read is disabled or schema is not ready" });
    }

    const v2Rows = await fetchHypothesisNodesFromV2({ userId, themeName, themeLanguage, limit });
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
    const themeLanguage = req.query.language ? normalizeThemeLanguage(req.query.language) : null;

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
    if (req.query.language) {
      if (!themeLanguage) {
        return res.status(400).json({ error: "invalid language" });
      }
      if (!v2ThemeLanguageColumnReady) {
        return res.status(503).json({ error: "theme language schema is not ready" });
      }
      where.push("t.theme_language = ?");
      params.push(themeLanguage);
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

const PORT = process.env.PORT || 8008;
const startServer = async () => {
  try {
    await ensureSchema();
    v2SchemaReady = await checkV2SchemaReady();
    if (!v2SchemaReady) {
      console.warn("V2 tables are missing. Run scripts/sql/20260217_db_v2_up.sql to enable V2 APIs.");
    } else {
      v2ThemeLanguageColumnReady = await tableColumnExists(V2_TABLES.themes, "theme_language");
      if (!v2ThemeLanguageColumnReady) {
        console.warn(
          "themes.theme_language is missing. Run scripts/sql/20260422_theme_language_partition_up.sql for full language filtering."
        );
      }
      await ensureProcessMapSchema();
      processMapSchemaReady = true;
    }
    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
      console.log(`V2 write: ${canWriteV2() ? "enabled" : "disabled"}`);
      console.log(`V2 read: ${canReadV2() ? "enabled" : "disabled"}`);
      console.log(`Theme language column: ${v2ThemeLanguageColumnReady ? "enabled" : "missing"}`);
      console.log(`Process maps: ${processMapSchemaReady ? "enabled" : "disabled"}`);
    });
  } catch (err) {
    console.error("failed to initialize schema", err);
    process.exit(1);
  }
};

startServer();
