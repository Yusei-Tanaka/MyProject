const saveLogHost = window.location.hostname || "localhost";
const saveLogPort = 3005;

const saveUserLog = async (logText) => {
    const userName = localStorage.getItem("userName");
    if (!userName) return;

    try {
        const res = await fetch(`http://${saveLogHost}:${saveLogPort}/save-log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userName, logText }),
        });

        if (!res.ok) {
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
    logItem.innerText = logText;

    // 新しいログアイテムを強調するためのスタイル
    logItem.style.backgroundColor = "#f0f8ff";
    logItem.style.fontWeight = "bold";

    // ログボックスの一番上に新しいログを追加
    logBox.insertBefore(logItem, logBox.firstChild);

    // サーバーにログを保存
    saveUserLog(logText);

    // 古いログのスタイルをリセット
    const logItems = logBox.querySelectorAll("div");
    logItems.forEach((item, index) => {
        if (index !== 0) {
            item.style.backgroundColor = "";
            item.style.fontWeight = "";
        }
    });
}

function displayKeywordsLog(keywords) {
    addSystemLog(`生成されたキーワードの組み合わせ: ${keywords.join(", ")}`);
}

window.addSystemLog = addSystemLog;