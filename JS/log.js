const saveLogHost = window.location.hostname || "10.158.102.203";
const saveLogPort = 3005;

const saveUserLog = async (logText) => {
    const userName = localStorage.getItem("userName");
    const themeName = localStorage.getItem("searchTitle");
    if (!userName) return;

    try {
        const fileRes = await fetch(`http://${saveLogHost}:${saveLogPort}/save-log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userName, themeName, logText }),
        });

        if (!fileRes.ok) {
            console.error("ログの保存に失敗しました");
        }
    } catch (error) {
        console.error("ログ送信中にエラーが発生しました:", error);
    }
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