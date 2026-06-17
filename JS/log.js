const logAppConfig = window.APP_CONFIG || {};
const logApiPort = Number(logAppConfig.apiPort || 3000);
const logApiProtocol = logAppConfig.protocol || window.location.protocol.replace(":", "") || "http";

const buildLogApiBaseUrls = () => {
  const candidates = [
    logAppConfig.apiBaseUrl,
    `${logApiProtocol}://${window.location.hostname || "127.0.0.1"}:${logApiPort}`,
    `http://127.0.0.1:${logApiPort}`,
    `http://localhost:${logApiPort}`,
  ].filter(Boolean);

  return [...new Set(candidates)];
};

const fetchWithTimeout = async (url, options, timeoutMs = 2000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const saveUserLog = async (logText) => {
  const userName = String(localStorage.getItem("userName") || "").trim();
  const themeName = String(localStorage.getItem("searchTitle") || "").trim();
  if (!userName) {
    console.warn("Log save skipped: localStorage.userName is not set.");
    return;
  }

  const baseUrls = buildLogApiBaseUrls();
  let lastError = null;

  for (const baseUrl of baseUrls) {
    try {
      const dbRes = await fetchWithTimeout(`${baseUrl}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userName,
          themeName,
          eventType: "system",
          logText,
        }),
      });

      if (dbRes.ok) return;

      const errorText = await dbRes.text().catch(() => "");
      lastError = new Error(`HTTP ${dbRes.status} ${errorText}`);
      console.warn(`Log DB save failed: ${baseUrl}/logs`);
    } catch (error) {
      lastError = error;
      console.warn(`Log DB request failed: ${baseUrl}/logs`, error);
    }
  }

  console.error("Log DB save failed for all endpoints:", lastError);
};

function addSystemLog(message) {
  const logBox = document.getElementById("logBox");
  if (!logBox || !message) return;

  const timestamp = new Date().toLocaleString();
  const logText = `      [${timestamp}] ${message}`;

  const logItem = document.createElement("div");
  logItem.className = "log-item-latest";
  logItem.innerText = logText;

  logBox.insertBefore(logItem, logBox.firstChild);
  saveUserLog(logText);

  const logItems = logBox.querySelectorAll("div");
  logItems.forEach((item, index) => {
    if (index !== 0) {
      item.classList.remove("log-item-latest");
    }
  });
}

function displayKeywordsLog(keywords) {
  addSystemLog(`生成されたキーワードの組み合わせ: ${keywords.join(", ")}`);
}

window.addSystemLog = addSystemLog;
window.displayKeywordsLog = displayKeywordsLog;
