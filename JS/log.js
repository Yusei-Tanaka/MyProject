const logAppConfig = window.APP_CONFIG || {};
const saveXmlPort = Number(logAppConfig.saveXmlPort || 3005);
const saveLogProtocol = logAppConfig.protocol || window.location.protocol.replace(":", "") || "http";

const buildSaveLogBaseUrls = () => {
    const candidates = [
        logAppConfig.saveXmlBaseUrl,
        `${saveLogProtocol}://${window.location.hostname || "127.0.0.1"}:${saveXmlPort}`,
        `http://127.0.0.1:${saveXmlPort}`,
        `http://localhost:${saveXmlPort}`,
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
        console.warn("ログ保存をスキップしました: localStorage.userName が未設定です");
        return;
    }

    const baseUrls = buildSaveLogBaseUrls();
    let lastError = null;

    for (const baseUrl of baseUrls) {
        try {
            const fileRes = await fetchWithTimeout(`${baseUrl}/save-log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userName, themeName, logText }),
            });

            if (fileRes.ok) {
                return;
            }

            const errorText = await fileRes.text().catch(() => "");
            lastError = new Error(`HTTP ${fileRes.status} ${errorText}`);
            console.warn(`ログ保存失敗: ${baseUrl}/save-log`);
        } catch (error) {
            lastError = error;
            console.warn(`ログ送信失敗: ${baseUrl}/save-log`, error);
        }
    }

    console.error("ログ送信中にエラーが発生しました:", lastError);
};

function addSystemLog(message) {
    const logBox = document.getElementById("logBox");
    if (!logBox || !message) return;

    // タイムスタンプを取得
    const timestamp = new Date().toLocaleString();

    // ログテキスト
    const logText = `      [${timestamp}] ${message}`;

    // 新しいログエントリを作成
    const logItem = document.createElement("div");
    logItem.className = "log-item-latest";
    logItem.innerText = logText;

    // ログボックスの一番上に新しいログを追加
    logBox.insertBefore(logItem, logBox.firstChild);

    // サーバーにログを保存
    saveUserLog(logText);

    // 古いログのスタイルをリセット
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