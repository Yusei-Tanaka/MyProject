const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.SAVE_XML_PORT || 3005);
const HOST = "0.0.0.0";

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (/^10\.158\.102\.\d{1,3}$/.test(hostname)) return true;
    return false;
  } catch (_error) {
    return false;
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

app.options("/save-xml", cors(corsOptions));
app.options("/xml-exists", cors(corsOptions));
app.options("/save-log", cors(corsOptions));

app.get("/xml-exists", (_req, res) => {
  res.json({ exists: false, disabled: true, storage: "mariadb" });
});

app.post("/save-xml", (_req, res) => {
  res.json({ saved: false, disabled: true, storage: "mariadb" });
});

app.post("/save-log", (_req, res) => {
  res.json({ saved: false, disabled: true, storage: "mariadb" });
});

app.listen(PORT, HOST, () => {
  console.log(`Legacy local file saver disabled on http://${HOST}:${PORT}; use MariaDB API instead.`);
});
