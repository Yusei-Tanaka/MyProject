const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const outPaths = [
  path.join(rootDir, "JS", "runtime-config.js"),
  path.join(rootDir, "organized-by-language", "javascript", "JS", "runtime-config.js"),
];

dotenv.config({ path: envPath, override: true });

const toPort = (value, fallback) => {
  const n = Number.parseInt(String(value || "").trim(), 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return n;
};

const normalizeProtocol = (value) =>
  String(value || "http").trim().toLowerCase() === "https" ? "https" : "http";

const normalizePath = (value) => {
  const raw = String(value || "/phpmyadmin").trim();
  if (!raw) return "/phpmyadmin";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.replace(/\/+$/, "") || "/phpmyadmin";
};

const config = {
  protocol: normalizeProtocol(process.env.APP_PROTOCOL),
  host: String(process.env.APP_HOST || "auto").trim() || "auto",
  apiPort: toPort(process.env.PORT, 8008),
  saveXmlPort: toPort(process.env.SAVE_XML_PORT, 3005),
  flaskApiPort: toPort(process.env.FLASK_API_PORT, 8000),
  phpMyAdminPath: normalizePath(process.env.PHPMYADMIN_PATH),
};

const output = `(() => {
  const rawConfig = ${JSON.stringify(config, null, 2)};

  const resolvedHost =
    rawConfig.host && rawConfig.host !== "auto"
      ? rawConfig.host
      : (window.location.hostname || "127.0.0.1");

  const withPort = (port) => \`${"${rawConfig.protocol}"}://${"${resolvedHost}"}:${"${port}"}\`;

  window.APP_CONFIG = {
    ...rawConfig,
    host: resolvedHost,
    apiBaseUrl: withPort(rawConfig.apiPort),
    saveXmlBaseUrl: withPort(rawConfig.saveXmlPort),
    flaskApiBaseUrl: withPort(rawConfig.flaskApiPort),
    phpMyAdminUrl: \`${"${rawConfig.protocol}"}://${"${resolvedHost}"}${"${rawConfig.phpMyAdminPath}"}\`,
  };
})();
`;

const generated = [];
for (const outPath of outPaths) {
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) continue;
  fs.writeFileSync(outPath, output, "utf8");
  generated.push(path.relative(rootDir, outPath));
}

if (generated.length === 0) {
  throw new Error("No runtime-config.js output path exists.");
}

console.log(`Generated ${generated.join(", ")} from ${path.relative(rootDir, envPath)}`);
