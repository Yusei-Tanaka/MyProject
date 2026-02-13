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

const xmlDir = path.join(__dirname, "XML");
const logDir = path.join(__dirname, "..", "log");

const sanitizeFileName = (name) => {
  if (typeof name !== "string") return "";
  return name.trim().replace(/[\\/:*?"<>|]/g, "_");
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
  const { userName, logText } = req.body;
  const safeName = sanitizeFileName(userName);
  if (!safeName || typeof logText !== "string") {
    console.error("ユーザー名またはログ内容がありません");
    return res.status(400).send("ユーザー名とログ内容が必要です");
  }

  const fileName = `${safeName}_log`;
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