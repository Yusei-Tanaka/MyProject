#!/usr/bin/env node
require("dotenv").config({ override: true });

const fs = require("fs/promises");
const path = require("path");

const args = process.argv.slice(2);
const argMap = new Map();
for (let i = 0; i < args.length; i += 1) {
  const key = args[i];
  const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
  if (value !== "true") i += 1;
  argMap.set(key, value);
}

const host = argMap.get("--host") || process.env.MIGRATE_API_HOST || "127.0.0.1";
const port = Number(argMap.get("--port") || process.env.PORT || 3000);
const xmlDir = path.resolve(argMap.get("--xml-dir") || path.join(__dirname, "..", "JS", "XML"));
const dryRun = argMap.get("--dry-run") === "true";

const apiBase = `http://${host}:${port}`;

const sanitizeUserId = (value) => {
  const source = String(value || "").trim();
  const normalized = source.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  const trimmed = normalized.replace(/^_+|_+$/g, "");
  if (!trimmed) return "usr_migrated";
  if (trimmed.length < 3) return `${trimmed}_u`;
  return trimmed.slice(0, 32);
};

const normalizeTheme = (value) => {
  const theme = String(value || "").trim();
  return theme.length > 0 ? theme.slice(0, 255) : "migrated_theme";
};

const readMetaTitle = (xml) => {
  const matched = xml.match(/<\?meta\s+title="([\s\S]*?)"\?>/);
  return matched ? String(matched[1] || "").trim() : "";
};

const parseNodeId = (value) => {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
};

const parseAttributes = (tagText) => {
  const attrs = {};
  const regex = /(\w+)="([\s\S]*?)"/g;
  let m;
  while ((m = regex.exec(tagText)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
};

const parseConceptMapXml = (xml) => {
  const nodes = [];
  const edges = [];

  const nodeRegex = /<Node\s+([^>]*?)\/>/g;
  let m;
  while ((m = nodeRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(m[1]);
    if (!attrs.id) continue;
    nodes.push({
      id: parseNodeId(attrs.id),
      label: attrs.label || "",
      x: attrs.x === undefined || attrs.x === "" ? null : Number(attrs.x),
      y: attrs.y === undefined || attrs.y === "" ? null : Number(attrs.y),
    });
  }

  const nodeSet = new Set(nodes.map((n) => String(n.id)));
  const edgeRegex = /<Edge\s+([^>]*?)\/>/g;
  let e;
  while ((e = edgeRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(e[1]);
    if (!attrs.from || !attrs.to) continue;
    const from = parseNodeId(attrs.from);
    const to = parseNodeId(attrs.to);
    if (!nodeSet.has(String(from)) || !nodeSet.has(String(to))) continue;
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

const parseFallbackXmlAsEmptyConceptMap = (xml) => {
  const trimmed = String(xml || "").trim();
  if (!trimmed) return null;
  if (trimmed.includes("<root") || trimmed.includes("<Root")) {
    return { nodes: [], edges: [], fallback: true };
  }
  return null;
};

const ensureUserExists = async (userId) => {
  const password = `migrated-${Date.now()}`;
  const res = await fetch(`${apiBase}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, passwordHash: password }),
  });

  if (res.ok) return true;
  if (res.status === 409) return true;

  const body = await res.text();
  throw new Error(`ユーザー作成失敗 user=${userId} status=${res.status} body=${body}`);
};

const upsertTheme = async (userId, themeName, content) => {
  const res = await fetch(`${apiBase}/users/${encodeURIComponent(userId)}/themes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themeName, content }),
  });

  if (res.ok) return;
  if (res.status === 404) {
    await ensureUserExists(userId);
    const retry = await fetch(`${apiBase}/users/${encodeURIComponent(userId)}/themes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeName, content }),
    });
    if (retry.ok) return;
    const retryBody = await retry.text();
    throw new Error(`テーマ保存リトライ失敗 user=${userId} theme=${themeName} status=${retry.status} body=${retryBody}`);
  }

  const body = await res.text();
  throw new Error(`テーマ保存失敗 user=${userId} theme=${themeName} status=${res.status} body=${body}`);
};

const inferScopeFromFilename = (baseName, metaTitle) => {
  if (baseName.includes("__")) {
    const [rawUser, ...themeParts] = baseName.split("__");
    return {
      userId: sanitizeUserId(rawUser),
      themeName: normalizeTheme(themeParts.join("__") || metaTitle || baseName),
    };
  }

  return {
    userId: sanitizeUserId(baseName),
    themeName: normalizeTheme(metaTitle || baseName),
  };
};

(async () => {
  const files = await fs.readdir(xmlDir, { withFileTypes: true });
  const xmlFiles = files
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".xml"))
    .map((entry) => entry.name)
    .sort();

  let migratedCount = 0;
  let skippedCount = 0;
  let fallbackCount = 0;

  for (const fileName of xmlFiles) {
    const fullPath = path.join(xmlDir, fileName);
    const xml = await fs.readFile(fullPath, "utf-8");

    const baseName = path.basename(fileName, ".xml");
    const metaTitle = readMetaTitle(xml);
    const { userId, themeName } = inferScopeFromFilename(baseName, metaTitle);
    let mapData;
    let usedFallback = false;

    if (xml.includes("<ConceptMap")) {
      mapData = parseConceptMapXml(xml);
    } else {
      const fallback = parseFallbackXmlAsEmptyConceptMap(xml);
      if (!fallback) {
        skippedCount += 1;
        console.log(`[SKIP] ${fileName} (ConceptMapではない)`);
        continue;
      }
      mapData = fallback;
      usedFallback = true;
      fallbackCount += 1;
    }

    const content = {
      title: themeName,
      nodes: mapData.nodes,
      edges: mapData.edges,
      migratedFromXml: true,
      migratedFromFallbackRoot: usedFallback,
      sourceFile: fileName,
      migratedAt: new Date().toISOString(),
    };

    if (dryRun) {
      const prefix = usedFallback ? "[DRY-RUN-FALLBACK]" : "[DRY-RUN]";
      console.log(`${prefix} ${fileName} -> user=${userId}, theme=${themeName}, nodes=${mapData.nodes.length}, edges=${mapData.edges.length}`);
      migratedCount += 1;
      continue;
    }

    await upsertTheme(userId, themeName, content);
    migratedCount += 1;
    const okPrefix = usedFallback ? "[OK-FALLBACK]" : "[OK]";
    console.log(`${okPrefix} ${fileName} -> user=${userId}, theme=${themeName}, nodes=${mapData.nodes.length}, edges=${mapData.edges.length}`);
  }

  console.log(`\n完了: migrated=${migratedCount}, skipped=${skippedCount}, fallback=${fallbackCount}, xmlDir=${xmlDir}`);
})().catch((error) => {
  console.error("移行失敗:", error.message || error);
  process.exit(1);
});
