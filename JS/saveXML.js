const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

// CORSを有効化
const corsOptions = {
  origin: (origin, callback) => {
    const allowed = [
      "http://localhost:8008",
      "http://10.158.102.153:8008",
    ];
    if (!origin || allowed.includes(origin)) {
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

// XML保存用ディレクトリ
const xmlDir = path.join(__dirname, "XML");

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(xmlDir)) {
  fs.mkdirSync(xmlDir);
}

// XMLファイルを保存するエンドポイント
app.use(express.json());
app.post("/save-xml", (req, res) => {
  console.log("リクエストを受信しました:", req.body); // リクエスト内容をログに出力
  console.log("save-xml 受信データ:", req.body); // ←追加

  const { filename, content } = req.body;

  if (!filename || !content) {
    console.error("リクエストに必要なデータがありません");
    return res.status(400).send("ファイル名と内容が必要です");
  }

  const filePath = path.join(xmlDir, filename);

  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.error("XMLファイルの保存に失敗しました:", err);
      return res.status(500).send("ファイルの保存に失敗しました");
    }

    console.log(`XMLファイルが保存されました: ${filePath}`);
    res.send("ファイルが保存されました");
  });
});

// サーバーを起動
app.listen(PORT, "0.0.0.0", () => {
  console.log(`サーバーが起動しました: http://0.0.0.0:${PORT}`);
});