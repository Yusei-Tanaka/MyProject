#!/usr/bin/env node
require("dotenv").config({ override: true });

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
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
const rootDir = path.resolve(__dirname, "..");
const xmlDir = path.resolve(argMap.get("--xml-dir") || path.join(rootDir, "XML"));
const logDir = path.resolve(argMap.get("--log-dir") || path.join(rootDir, "log"));
const protocol = String(argMap.get("--protocol") || process.env.APP_PROTOCOL || "http") === "https"
  ? "https"
  : "http";
const configuredHost = String(argMap.get("--host") || process.env.MIGRATE_API_HOST || process.env.APP_HOST || "").trim();
const apiHost = configuredHost && configuredHost.toLowerCase() !== "auto" ? configuredHost : "127.0.0.1";
const apiPort = Number(argMap.get("--port") || process.env.PORT || 3000);
const apiBase = `${protocol}://${apiHost}:${apiPort}`;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalizeSlashes = (value) => String(value || "").replace(/\\/g, "/");
const toSqlDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace("T", " ");
};

const sanitizeUserId = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return "usr_migrated";
  if (normalized.length < 3) return `${normalized}_u`;
  return normalized.slice(0, 32);
};

const normalizeThemeName = (value) => {
  const normalized = String(value || "").trim();
  return (normalized || "migrated_theme").slice(0, 255);
};

const decodeXml = (value) =>
  String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const readMetaTitle = (xml) => {
  const match = String(xml || "").match(/<\?meta\s+title="([\s\S]*?)"\?>/);
  return match ? decodeXml(match[1]).trim() : "";
};

const parseAttributes = (tagText) => {
  const attrs = {};
  const regex = /(\w+)="([\s\S]*?)"/g;
  let match;
  while ((match = regex.exec(tagText)) !== null) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
};

const parseNodeId = (value) => {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
};

const parseConceptMapXml = (xml) => {
  const nodes = [];
  const edges = [];
  const nodeRegex = /<Node\s+([^>]*?)\/>/g;
  let nodeMatch;
  while ((nodeMatch = nodeRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(nodeMatch[1]);
    if (!attrs.id) continue;
    nodes.push({
      id: parseNodeId(attrs.id),
      label: attrs.label || "",
      x: attrs.x === undefined || attrs.x === "" ? null : Number(attrs.x),
      y: attrs.y === undefined || attrs.y === "" ? null : Number(attrs.y),
    });
  }

  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  const edgeRegex = /<Edge\s+([^>]*?)\/>/g;
  let edgeMatch;
  while ((edgeMatch = edgeRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(edgeMatch[1]);
    if (!attrs.from || !attrs.to) continue;
    const from = parseNodeId(attrs.from);
    const to = parseNodeId(attrs.to);
    if (!nodeIds.has(String(from)) || !nodeIds.has(String(to))) continue;
    edges.push({
      id: attrs.id || "",
      from,
      to,
      label: attrs.label || "",
      arrows: attrs.arrows || "",
    });
  }
  return { nodes, edges };
};

const inferScopeFromStem = (stem, preferredTheme = "") => {
  if (stem.includes("__")) {
    const [rawUser, ...themeParts] = stem.split("__");
    return {
      userId: sanitizeUserId(rawUser),
      themeName: normalizeThemeName(preferredTheme || themeParts.join("__")),
    };
  }
  return {
    userId: sanitizeUserId(stem),
    themeName: normalizeThemeName(preferredTheme),
  };
};

const getMindmapRootText = (model) => {
  const nodes = model && Array.isArray(model.nodeDataArray) ? model.nodeDataArray : [];
  const root = nodes.find((node) => node && (node.key === 0 || node.parent === undefined || node.parent === null));
  return root && typeof root.text === "string" ? root.text.trim() : "";
};

const hasConceptMap = (content) => {
  const nodes = Array.isArray(content?.keywordNodes)
    ? content.keywordNodes
    : Array.isArray(content?.nodes)
      ? content.nodes
      : [];
  const edges = Array.isArray(content?.edges) ? content.edges : [];
  return nodes.length > 0 || edges.length > 0;
};

const hasMindmap = (content) =>
  Boolean(content?.mindmap && typeof content.mindmap.modelJson === "string" && content.mindmap.modelJson.trim());

const hasHypothesis = (content) =>
  Boolean(content?.hypothesis && typeof content.hypothesis.html === "string" && content.hypothesis.html.trim());

const createConnection = () =>
  mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "appuser",
    password: process.env.DB_PASSWORD || "app_pass",
    database: process.env.DB_NAME || "myapp",
    timezone: "Z",
  });

const tableExists = async (connection, tableName) => {
  const [rows] = await connection.execute(
    "SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1",
    [tableName]
  );
  return rows.length > 0;
};

const columnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.execute(
    "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1",
    [tableName, columnName]
  );
  return rows.length > 0;
};

const indexExists = async (connection, tableName, indexName) => {
  const [rows] = await connection.execute(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1",
    [tableName, indexName]
  );
  return rows.length > 0;
};

const ensureImportSchema = async (connection) => {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS user_action_logs (
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
  if (!(await columnExists(connection, "user_action_logs", "import_key"))) {
    await connection.execute("ALTER TABLE user_action_logs ADD COLUMN import_key CHAR(64) NULL");
  }
  if (!(await indexExists(connection, "user_action_logs", "uk_user_action_logs_import_key"))) {
    await connection.execute(
      "ALTER TABLE user_action_logs ADD UNIQUE INDEX uk_user_action_logs_import_key (import_key)"
    );
  }
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS legacy_file_imports (
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

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_error) {
    body = text;
  }
  return { response, body };
};

const ensureUserExists = async (userId) => {
  const password = `migrated-${crypto.randomBytes(12).toString("hex")}`;
  const { response, body } = await fetchJson(`${apiBase}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, passwordHash: password }),
  });
  if (response.ok || response.status === 409) return;
  throw new Error(`failed to create migrated user ${userId}: HTTP ${response.status} ${JSON.stringify(body)}`);
};

const getExistingTheme = async (userId, themeName) => {
  const { response, body } = await fetchJson(
    `${apiBase}/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(themeName)}`,
    { cache: "no-store" }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to read theme ${userId}/${themeName}: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
};

const putTheme = async (userId, themeName, language, content) => {
  const url = `${apiBase}/users/${encodeURIComponent(userId)}/themes`;
  const request = () =>
    fetchJson(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeName, language: language || undefined, content }),
    });
  let result = await request();
  if (result.response.status === 404) {
    await ensureUserExists(userId);
    result = await request();
  }
  if (!result.response.ok) {
    throw new Error(
      `failed to save theme ${userId}/${themeName}: HTTP ${result.response.status} ${JSON.stringify(result.body)}`
    );
  }
};

const readFiles = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "ja"))) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(directory, entry.name);
    const [buffer, stat] = await Promise.all([fs.readFile(fullPath), fs.stat(fullPath)]);
    result.push({ name: entry.name, fullPath, buffer, stat });
  }
  return result;
};

const classifyXmlFile = (name) => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mindmap.json")) return "mindmap_json";
  if (lower.endsWith(".hypothesis.json")) return "hypothesis_json";
  if (lower.endsWith(".xml")) return "xml";
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".json")) return "json";
  return "other";
};

const parseLogScope = (fileName) => {
  const baseName = fileName.replace(/\.txt$/i, "");
  const stem = baseName.endsWith("_log") ? baseName.slice(0, -4) : baseName;
  if (stem.includes("__")) {
    const [rawUser, ...themeParts] = stem.split("__");
    return { userId: sanitizeUserId(rawUser), themeName: normalizeThemeName(themeParts.join("__")) };
  }
  return { userId: sanitizeUserId(stem), themeName: null };
};

const getGroup = (groups, scope) => {
  const key = `${scope.userId}\u0000${scope.themeName}`;
  if (!groups.has(key)) {
    groups.set(key, { ...scope, xml: [], mindmap: [], hypothesis: [] });
  }
  return groups.get(key);
};

const newest = (items) =>
  items.slice().sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)[0] || null;

const countExistingKeys = async (connection, tableName, keys) => {
  if (keys.length === 0 || !(await tableExists(connection, tableName))) return 0;
  let count = 0;
  const batchSize = 500;
  for (let offset = 0; offset < keys.length; offset += batchSize) {
    const batch = keys.slice(offset, offset + batchSize);
    const placeholders = batch.map(() => "?").join(", ");
    const [rows] = await connection.execute(
      `SELECT import_key FROM ${tableName} WHERE import_key IN (${placeholders})`,
      batch
    );
    count += rows.length;
  }
  return count;
};

(async () => {
  const connection = await createConnection();
  const xmlFiles = await readFiles(xmlDir);
  const logFiles = await readFiles(logDir);
  const groups = new Map();
  const fileScopes = new Map();
  const xmlScopesByStem = new Map();
  const unscopedThemesByUser = new Map();

  for (const file of xmlFiles) {
    if (classifyXmlFile(file.name) !== "xml") continue;
    const raw = file.buffer.toString("utf8");
    const stem = file.name.replace(/\.xml$/i, "");
    const scope = inferScopeFromStem(stem, readMetaTitle(raw));
    const parsed = raw.includes("<ConceptMap")
      ? parseConceptMapXml(raw)
      : raw.match(/<root\b/i)
        ? { nodes: [], edges: [] }
        : null;
    xmlScopesByStem.set(stem, scope);
    fileScopes.set(normalizeSlashes(path.relative(rootDir, file.fullPath)), scope);
    if (parsed) getGroup(groups, scope).xml.push({ ...file, raw, parsed });
  }

  for (const file of xmlFiles) {
    if (classifyXmlFile(file.name) !== "mindmap_json") continue;
    const raw = file.buffer.toString("utf8");
    const model = JSON.parse(raw);
    const stem = file.name.replace(/\.mindmap\.json$/i, "");
    if (!stem.includes("__")) {
      unscopedThemesByUser.set(sanitizeUserId(stem), normalizeThemeName(getMindmapRootText(model)));
    }
  }

  for (const file of xmlFiles) {
    const type = classifyXmlFile(file.name);
    if (type !== "mindmap_json" && type !== "hypothesis_json") continue;
    const raw = file.buffer.toString("utf8");
    const parsed = JSON.parse(raw);
    const suffix = type === "mindmap_json" ? /\.mindmap\.json$/i : /\.hypothesis\.json$/i;
    const stem = file.name.replace(suffix, "");
    const baseScope = xmlScopesByStem.get(stem);
    let scope = baseScope;
    if (!scope) {
      const preferredTheme = stem.includes("__")
        ? ""
        : unscopedThemesByUser.get(sanitizeUserId(stem)) || "migrated_theme";
      scope = inferScopeFromStem(stem, preferredTheme);
    }
    fileScopes.set(normalizeSlashes(path.relative(rootDir, file.fullPath)), scope);
    const group = getGroup(groups, scope);
    if (type === "mindmap_json") group.mindmap.push({ ...file, raw, parsed });
    else group.hypothesis.push({ ...file, raw, parsed });
  }

  for (const file of logFiles) {
    const scope = parseLogScope(file.name);
    fileScopes.set(normalizeSlashes(path.relative(rootDir, file.fullPath)), scope);
  }

  let archiveInserted = 0;
  let archiveSkipped = 0;
  let logInserted = 0;
  let logSkipped = 0;

  if (!dryRun) {
    await ensureImportSchema(connection);
    await connection.beginTransaction();
    try {
      for (const file of [...xmlFiles, ...logFiles]) {
        const sourcePath = normalizeSlashes(path.relative(rootDir, file.fullPath));
        const contentHash = sha256(file.buffer);
        const importKey = sha256(`legacy-file-v1\u0000${sourcePath}\u0000${contentHash}`);
        const scope = fileScopes.get(sourcePath) || { userId: null, themeName: null };
        const fileType = sourcePath.startsWith("log/") ? "log" : classifyXmlFile(file.name);
        const [result] = await connection.execute(
          `INSERT IGNORE INTO legacy_file_imports
            (import_key, source_path, file_type, user_id, theme_name, content_blob, content_sha256, file_size, file_modified_at, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            importKey,
            sourcePath,
            fileType,
            scope.userId || null,
            scope.themeName || null,
            file.buffer,
            contentHash,
            file.stat.size,
            toSqlDate(file.stat.mtime),
            JSON.stringify({ originalName: file.name }),
          ]
        );
        if (result.affectedRows > 0) archiveInserted += 1;
        else archiveSkipped += 1;
      }

      for (const file of logFiles) {
        if (file.name.toLowerCase().endsWith(".zip")) continue;
        const sourcePath = normalizeSlashes(path.relative(rootDir, file.fullPath));
        const scope = parseLogScope(file.name);
        const lines = file.buffer.toString("utf8").split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          if (!line.trim()) continue;
          const sourceLine = index + 1;
          const importKey = sha256(`legacy-log-v1\u0000${sourcePath}\u0000${sourceLine}\u0000${line}`);
          const [result] = await connection.execute(
            `INSERT IGNORE INTO user_action_logs
              (user_id, theme_name, event_type, log_text, payload_json, import_key, created_at)
             VALUES (?, ?, 'legacy_file', ?, ?, ?, ?)`,
            [
              scope.userId,
              scope.themeName,
              line,
              JSON.stringify({ sourceFile: file.name, sourcePath, sourceLine }),
              importKey,
              toSqlDate(file.stat.mtime),
            ]
          );
          if (result.affectedRows > 0) logInserted += 1;
          else logSkipped += 1;
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } else {
    const archiveKeys = [...xmlFiles, ...logFiles].map((file) => {
      const sourcePath = normalizeSlashes(path.relative(rootDir, file.fullPath));
      return sha256(`legacy-file-v1\u0000${sourcePath}\u0000${sha256(file.buffer)}`);
    });
    archiveSkipped = await countExistingKeys(connection, "legacy_file_imports", archiveKeys);
    archiveInserted = archiveKeys.length - archiveSkipped;

    const logKeys = [];
    for (const file of logFiles) {
      if (file.name.toLowerCase().endsWith(".zip")) continue;
      const sourcePath = normalizeSlashes(path.relative(rootDir, file.fullPath));
      const lines = file.buffer.toString("utf8").split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim()) continue;
        logKeys.push(sha256(`legacy-log-v1\u0000${sourcePath}\u0000${index + 1}\u0000${line}`));
      }
    }
    const hasImportKey = await columnExists(connection, "user_action_logs", "import_key");
    logSkipped = hasImportKey
      ? await countExistingKeys(connection, "user_action_logs", logKeys)
      : 0;
    logInserted = logKeys.length - logSkipped;
  }

  let themesCreated = 0;
  let themesUpdated = 0;
  let themesUnchanged = 0;
  let graphImported = 0;
  let mindmapImported = 0;
  let hypothesisImported = 0;

  for (const group of groups.values()) {
    const existing = await getExistingTheme(group.userId, group.themeName);
    const existingContent = existing && existing.content && typeof existing.content === "object"
      ? existing.content
      : {};
    const incoming = { title: group.themeName };
    const sources = [];
    const importedSources = new Set(
      Array.isArray(existingContent?.legacyImport?.sourceFiles)
        ? existingContent.legacyImport.sourceFiles
        : []
    );
    let changed = false;

    const xml = newest(group.xml);
    if (xml && (!existing || (!hasConceptMap(existingContent) && !importedSources.has(xml.name)))) {
      incoming.nodes = xml.parsed.nodes;
      incoming.keywordNodes = xml.parsed.nodes;
      incoming.edges = xml.parsed.edges;
      sources.push(xml.name);
      graphImported += 1;
      changed = true;
    }

    const mindmap = newest(group.mindmap);
    if (mindmap && (!existing || (!hasMindmap(existingContent) && !importedSources.has(mindmap.name)))) {
      incoming.mindmap = {
        schemaVersion: 1,
        modelJson: mindmap.raw,
        savedAt: mindmap.stat.mtime.toISOString(),
      };
      sources.push(mindmap.name);
      mindmapImported += 1;
      changed = true;
    }

    const hypothesis = newest(group.hypothesis);
    if (
      hypothesis &&
      (!existing || (!hasHypothesis(existingContent) && !importedSources.has(hypothesis.name)))
    ) {
      incoming.hypothesis = {
        schemaVersion: 2,
        html: typeof hypothesis.parsed.html === "string" ? hypothesis.parsed.html : "",
        savedAt: hypothesis.stat.mtime.toISOString(),
      };
      sources.push(hypothesis.name);
      hypothesisImported += 1;
      changed = true;
    }

    if (!changed) {
      themesUnchanged += 1;
      continue;
    }

    incoming.legacyImport = {
      schemaVersion: 1,
      sourceFiles: [...new Set(sources)],
      importedAt: new Date().toISOString(),
      policy: "fill-missing-components-only",
    };

    console.log(
      `[${dryRun ? "DRY-RUN" : "IMPORT"}] ${group.userId} / ${group.themeName}: ${sources.join(", ")}`
    );
    if (!dryRun) {
      await putTheme(group.userId, group.themeName, existing?.language || "", incoming);
    }
    if (existing) themesUpdated += 1;
    else themesCreated += 1;
  }

  const summary = {
    dryRun,
    apiBase,
    localFiles: { xmlDirectory: xmlFiles.length, logDirectory: logFiles.length },
    archive: { inserted: archiveInserted, skipped: archiveSkipped },
    logs: { inserted: logInserted, skipped: logSkipped },
    themes: {
      groups: groups.size,
      created: themesCreated,
      updated: themesUpdated,
      unchanged: themesUnchanged,
      graphImported,
      mindmapImported,
      hypothesisImported,
    },
  };
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
  await connection.end();
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
