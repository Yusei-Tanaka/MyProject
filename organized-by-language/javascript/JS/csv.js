// CSV のデータを格納するための Map
let keywordData = new Map();
let csvKeywords = []; // CSVから取得したキーワードを格納する配列

// 読み込むCSVファイルのリスト
const csvFiles = [
    "Expanded-data/SDGs/13/output_related_words.csv",
    "Expanded-data/SDGs/7/output_related_words_sdgs7.csv" // 追加するCSV
];

// CSVデータ読み込み関数（複数ファイル対応）
function loadCSVData() {
    let fetchPromises = csvFiles.map(file =>
        fetch(file)
            .then(response => response.text())
            .then(text => processCSVData(text))
            .catch(error => console.error(`CSV読み込みエラー (${file}):`, error))
    );

    Promise.all(fetchPromises).then(() => {
        console.log("すべてのCSVデータが読み込まれました");
        console.log("格納されたキーワード一覧:", Array.from(keywordData.keys())); // 格納されたキーワードを確認
    });
}

// CSVデータを処理する関数
function processCSVData(text) {
    let lines = text.split("\n");

    for (let i = 1; i < lines.length; i++) {
        let cols = lines[i].split(",");
        if (cols.length < 3) continue;

        let keyword = cols[0].trim();
        let category = cols[1].trim();
        let relatedWords = cols.slice(2).join(",") // カンマを含むデータを結合
            .replace(/（.*?）/g, "") // 丸括弧内の不要な文字を削除
            .replace(/\"/g, "") // 余分なダブルクォートを削除
            .split(/\s*,\s*/) // カンマ区切り＆空白を考慮
            .map(word => word.trim())
            .filter(word => word.length > 0);

        // キーワードが初めて登場した場合、新しいMapを作成
        if (!keywordData.has(keyword)) {
            keywordData.set(keyword, new Map());
        }

        let categoryMap = keywordData.get(keyword);

        // カテゴリが初めて登場した場合、新しいSetを作成
        if (!categoryMap.has(category)) {
            categoryMap.set(category, new Set());
        }

        relatedWords.forEach(word => categoryMap.get(category).add(word));

        // キーワード一覧に追加
        if (!csvKeywords.includes(keyword)) {
            csvKeywords.push(keyword);
        }
    }
}

// キーワード検索関数（複数カテゴリを取得）
function getRelatedKeywords(keyword) {
    keyword = keyword.trim();  // 余計な空白を削除
    console.log(`検索するキーワード: 「${keyword}」`);  // デバッグ用のログ出力

    if (keywordData.has(keyword)) {
        let categoryMap = keywordData.get(keyword);
        let result = {};

        // 各カテゴリごとに関連ワードを取得
        categoryMap.forEach((words, category) => {
            result[category] = Array.from(words); // SetをArrayに変換
        });

        return result;
    } else {
        console.log(`キーワード「${keyword}」は存在しません。`);
        return null;
    }
}
