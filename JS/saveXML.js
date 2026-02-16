const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.SAVE_XML_PORT || 3005);
const HOST = "0.0.0.0";

// CORSを有効化
const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1") ||
      origin.startsWith("http://10.158.102.153")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"], // 許可するHTTPメソッド
  allowedHeaders: ["Content-Type"], // 許可するヘッダー
};

app.use(cors(corsOptions)); // この行でCORSを有効化
app.options("/save-xml", cors(corsOptions)); // preflight

app.get("/xml-exists", (req, res) => {
  const safeName = sanitizeFileName(req.query.filename || "");
  if (!safeName) {
    return res.status(400).json({ error: "filename is required" });
  }
  const filePath = path.join(xmlDir, safeName);
  const exists = fs.existsSync(filePath);
  return res.json({ exists });
});

const xmlDir = path.join(__dirname, "XML");
const logDir = path.join(__dirname, "..", "log");
const MAX_FILE_PART_LENGTH = 24;

const sanitizeFileName = (name) => {
  if (typeof name !== "string") return "";
  return name.trim().replace(/[\\/:*?"<>|]/g, "_");
};

const sanitizeFilePart = (value) => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const hashString8 = (value) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const toShortFilePart = (value, fallback) => {
  const normalized = sanitizeFilePart(value) || fallback;
  if (normalized.length <= MAX_FILE_PART_LENGTH) {
    return normalized;
  }
  const headLength = MAX_FILE_PART_LENGTH - 9;
  const head = normalized.slice(0, headLength);
  return `${head}_${hashString8(normalized)}`;
};

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(xmlDir)) {
  fs.mkdirSync(xmlDir, { recursive: true });
}

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// XMLファイルを保存するエンドポイント
app.use(express.json());
app.post("/save-xml", (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!filename || typeof content !== "string") {
      console.error("ファイル名または内容がありません");
      return res.status(400).send("ファイル名と内容が必要です");
    }

    const safeName = sanitizeFileName(filename);
    if (!safeName) {
      console.error("不正なファイル名です:", filename);
      return res.status(400).send("不正なファイル名です");
    }

    const filePath = path.join(xmlDir, safeName);
    fs.writeFile(filePath, content, "utf-8", (writeErr) => {
      if (writeErr) {
        console.error("XMLファイルの保存に失敗しました:", writeErr);
        return res.status(500).send("ファイルの保存に失敗しました: " + writeErr.message);
      }
      console.log(`XMLファイルが保存されました: ${filePath}`);
      res.send("ファイルが保存されました");
    });
  } catch (e) {
    console.error("予期しないエラー:", e);
    res.status(500).send("サーバー内部エラー: " + e.message);
  }
});

app.options("/save-log", cors(corsOptions)); // preflight

// ログを保存するエンドポイント
app.post("/save-log", (req, res) => {
  const { userName, themeName, logText } = req.body;
  const safeName = toShortFilePart(userName, "user");
  const safeTheme = themeName ? toShortFilePart(themeName, "theme") : "";
  if (!safeName || typeof logText !== "string") {
    console.error("ユーザー名またはログ内容がありません");
    return res.status(400).send("ユーザー名とログ内容が必要です");
  }

  const fileName = safeTheme ? `${safeName}__${safeTheme}_log` : `${safeName}_log`;
  const filePath = path.join(logDir, fileName);
  const line = logText.endsWith("\n") ? logText : `${logText}\n`;

  fs.appendFile(filePath, line, "utf-8", (writeErr) => {
    if (writeErr) {
      console.error("ログの保存に失敗しました:", writeErr);
      return res.status(500).send("ログの保存に失敗しました");
    }
    console.log(`ログが保存されました: ${filePath}`);
    res.send("ログが保存されました");
  });
});

// サーバーを起動
app.listen(PORT, "0.0.0.0", () => {
  console.log(`サーバーが起動しました: http://0.0.0.0:${PORT}`);
});