#!/usr/bin/env node
require("dotenv").config({ override: true });

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

const logDir = path.resolve(argMap.get("--log-dir") || path.join(__dirname, "..", "log"));
const dryRun = argMap.get("--dry-run") === "true";

const parseLogScope = (fileName) => {
  const baseName = path.basename(fileName).replace(/\.txt$/i, "");
  const withoutSuffix = baseName.endsWith("_log") ? baseName.slice(0, -4) : baseName;

  if (withoutSuffix.includes("__")) {
    const [rawUser, ...themeParts] = withoutSuffix.split("__");
    return {
      userId: String(rawUser || "unknown").slice(0, 64),
      themeName: String(themeParts.join("__") || "").slice(0, 255) || null,
    };
  }

  return {
    userId: String(withoutSuffix || "unknown").slice(0, 64),
    themeName: null,
  };
};

const createPool = () =>
  mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "appuser",
    password: process.env.DB_PASSWORD || "app_pass",
    database: process.env.DB_NAME || "myapp",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
    timezone: "Z",
  });

const ensureLogTable = async (pool) => {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS user_action_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      theme_name VARCHAR(255) NULL,
      event_type VARCHAR(64) NOT NULL DEFAULT 'system',
      log_text TEXT NOT NULL,
      payload_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_action_logs_user_time (user_id, created_at),
      INDEX idx_user_action_logs_theme_time (user_id, theme_name, created_at)
    )`
  );
};

(async () => {
  const entries = await fs.readdir(logDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && !entry.name.toLowerCase().endsWith(".zip"))
    .map((entry) => entry.name)
    .sort();

  let processedFiles = 0;
  let insertedLines = 0;
  let skippedLines = 0;

  const pool = dryRun ? null : createPool();
  try {
    if (pool) {
      await ensureLogTable(pool);
    }

    for (const fileName of files) {
      const fullPath = path.join(logDir, fileName);
      const raw = await fs.readFile(fullPath, "utf8");
      const lines = raw.split(/\r?\n/).filter((line) => line.trim());
      const { userId, themeName } = parseLogScope(fileName);
      processedFiles += 1;

      if (dryRun) {
        console.log(`[DRY-RUN] ${fileName}: user=${userId}, theme=${themeName || ""}, lines=${lines.length}`);
        insertedLines += lines.length;
        continue;
      }

      let lineNo = 0;
      for (const line of lines) {
        lineNo += 1;
        const logText = String(line || "");
        if (!logText.trim()) {
          skippedLines += 1;
          continue;
        }

        await pool.execute(
          "INSERT INTO user_action_logs (user_id, theme_name, event_type, log_text, payload_json) VALUES (?, ?, ?, ?, ?)",
          [
            userId,
            themeName,
            "legacy_file",
            logText,
            JSON.stringify({ sourceFile: fileName, sourceLine: lineNo }),
          ]
        );
        insertedLines += 1;
      }

      console.log(`[OK] ${fileName}: inserted=${lines.length}`);
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  console.log(
    `Done: files=${processedFiles}, insertedLines=${insertedLines}, skippedLines=${skippedLines}, dryRun=${dryRun}`
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
