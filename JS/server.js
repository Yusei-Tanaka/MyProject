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
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

const isValidUserId = (id) => USER_ID_PATTERN.test(id);
const isValidPassword = (password) => password.length >= 1;

const hashPassword = (password) => crypto.createHash("sha256").update(password).digest("hex");

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
    "CREATE TABLE IF NOT EXISTS logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64) NULL, level VARCHAR(16), message TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_logs_user_id (user_id), CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL)"
  );

  await pool.execute(
    "CREATE TABLE IF NOT EXISTS nodes (id BIGINT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(255) NOT NULL, props JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_nodes_label (label))"
  );

  await pool.execute(
    "CREATE TABLE IF NOT EXISTS edges (id BIGINT AUTO_INCREMENT PRIMARY KEY, src_id BIGINT NOT NULL, dst_id BIGINT NOT NULL, relation VARCHAR(255), props JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_edges_src (src_id), INDEX idx_edges_dst (dst_id), CONSTRAINT fk_edges_src FOREIGN KEY (src_id) REFERENCES nodes(id), CONSTRAINT fk_edges_dst FOREIGN KEY (dst_id) REFERENCES nodes(id))"
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

app.get("/logs", async (req, res) => {
  const limit = safeLimit(req.query.limit, 100, 500);
  const userId = req.query.userId ? normalizeUserId(req.query.userId) : null;
  try {
    const sql = userId
      ? "SELECT id, user_id, level, message, created_at FROM logs WHERE user_id = ? ORDER BY id DESC LIMIT ?"
      : "SELECT id, user_id, level, message, created_at FROM logs ORDER BY id DESC LIMIT ?";
    const params = userId ? [userId, limit] : [limit];
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("fetch logs failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.post("/logs", async (req, res) => {
  const userId = req.body.userId ? normalizeUserId(req.body.userId) : null;
  const { level = "info", message } = req.body;
  if (!message) return res.status(400).json({ error: "missing message" });
  if (userId && !isValidUserId(userId)) {
    return res.status(400).json({ error: "invalid userId format" });
  }
  try {
    const [result] = await pool.execute(
      "INSERT INTO logs (user_id, level, message) VALUES (?, ?, ?)",
      [userId ?? null, level, message]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("create log failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/graph/nodes", async (req, res) => {
  const limit = safeLimit(req.query.limit, 50, 200);
  try {
    const [rows] = await pool.query(
      "SELECT id, label, props, created_at FROM nodes ORDER BY id DESC LIMIT ?",
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
      "INSERT INTO nodes (label, props) VALUES (?, ?)",
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
      "INSERT INTO edges (src_id, dst_id, relation, props) VALUES (?, ?, ?, ?)",
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
      "SELECT id, src_id, dst_id, relation, props, created_at FROM edges ORDER BY id DESC LIMIT ?",
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
