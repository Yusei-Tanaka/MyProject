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
  hypothesisSpread: "hypothesis_spread",
};

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

const extractHypothesisHtml = (content) => {
  if (!content || typeof content !== "object") return "";
  const hypothesis = content.hypothesis;
  if (!hypothesis || typeof hypothesis !== "object") return "";
  const html = hypothesis.html;
  return typeof html === "string" ? html.trim() : "";
};

const extractHypothesisNodes = (content) => {
  if (!content || typeof content !== "object") return [];
  const hypothesis = content.hypothesis;
  if (!hypothesis || typeof hypothesis !== "object") return [];
  if (Array.isArray(hypothesis.nodes)) return hypothesis.nodes;

  const entries = hypothesis.entries && typeof hypothesis.entries === "object" ? hypothesis.entries : {};
  const hypothesisEntries = Array.isArray(entries.hypotheses) ? entries.hypotheses : [];
  const scamperEntries = Array.isArray(entries.scamper) ? entries.scamper : [];
  return [
    ...hypothesisEntries.map((row) => ({ ...row, kind: "hypothesis" })),
    ...scamperEntries.map((row) => ({ ...row, kind: "scamper" })),
  ];
};

const extractSavedAt = (content) => {
  if (!content || typeof content !== "object") return null;
  const savedAt = content?.hypothesis?.savedAt;
  if (typeof savedAt !== "string" || !savedAt.trim()) return null;
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date;
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

  for (const row of rows) {
    const userId = String(row.user_id);
    const themeName = String(row.theme_name);
    const content = parseContentJson(row.content_json);
    const html = extractHypothesisHtml(content);
    const nodes = extractHypothesisNodes(content);
    const hypothesisCount = nodes.filter((row) => String(row?.kind || "hypothesis") !== "scamper").length;
    const scamperCount = nodes.filter((row) => String(row?.kind || "") === "scamper").length;
    const savedAt = extractSavedAt(content);
    const summary = {
      schemaVersion: 2,
      hypothesisCount,
      scamperCount,
      totalCount: nodes.length,
    };

    if (!html) {
      skipped += 1;
      console.log(`[SKIP] user=${userId} theme=${themeName} (hypothesis.html がありません)`);
      continue;
    }

    if (dryRun) {
      processed += 1;
      console.log(`[DRY-RUN] user=${userId} theme=${themeName} htmlLength=${html.length}`);
      continue;
    }

    await pool.execute(
      `INSERT INTO ${TABLES.hypothesisSpread} (user_id, theme_name, hypothesis_html, hypothesis_saved_at, hypothesis_node_count, hypothesis_summary_json) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE hypothesis_html = VALUES(hypothesis_html), hypothesis_saved_at = VALUES(hypothesis_saved_at), hypothesis_node_count = VALUES(hypothesis_node_count), hypothesis_summary_json = VALUES(hypothesis_summary_json), updated_at = CURRENT_TIMESTAMP`,
      [userId, themeName, html, savedAt, nodes.length, JSON.stringify(summary)]
    );

    processed += 1;
    console.log(`[OK] user=${userId} theme=${themeName} htmlLength=${html.length}`);
  }

  console.log(`\n完了: processed=${processed}, skipped=${skipped}, dryRun=${dryRun}`);
})()
  .catch((error) => {
    console.error("バックフィル失敗:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
