function displayKeywordsLog(keywords) {
    let logBox = document.getElementById("logBox");

    // タイムスタンプを取得
    let timestamp = new Date().toLocaleString();

    // 生成されたログテキスト
    let logText = `      [${timestamp}] 生成されたキーワードの組み合わせ: ${keywords.join(", ")}`;
    
    // 新しいログエントリを作成
    let logItem = document.createElement("div");
    logItem.innerText = logText;

    // 新しいログアイテムを強調するためのスタイル
    logItem.style.backgroundColor = "#f0f8ff"; // 新しいログを青色で強調
    logItem.style.fontWeight = "bold"; // 新しいログは太字

    // ログボックスの一番上に新しいログを追加
    logBox.insertBefore(logItem, logBox.firstChild);

    // 古いログのスタイルをリセット
    let logItems = logBox.querySelectorAll('div');
    logItems.forEach((item, index) => {
        if (index !== 0) { // 最初のログ以外は普通の色に戻す
            item.style.backgroundColor = ""; // 背景色をリセット
            item.style.fontWeight = ""; // フォントを通常に戻す
        }
    });
}