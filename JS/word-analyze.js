const DICT_PATH = "../dict"; // 辞書のパスを指定

window.onload = (event) => {
    const myTitleInput = document.getElementById("myTitle"); // テキスト入力欄
    const output = document.getElementById("output"); // 結果表示エリア

    // ページ読み込み時にローカルストレージからテーマを取得して処理
    const storedTitle = localStorage.getItem("searchTitle");
    if (storedTitle) {
        //console.log(`ローカルストレージから取得したテーマ: ${storedTitle}`);
        myTitleInput.value = storedTitle; // テキスト入力欄に設定
        analyzeText(storedTitle); // 形態素解析を実行
    }

    // テキスト入力欄の入力イベントを設定
    myTitleInput.addEventListener("input", () => {
        const text = myTitleInput.value; // 入力されたテキストを取得

        // テキストが空白の場合、メッセージを表示
        if (text.trim() === "") {
            output.textContent = "テキストが入力されていません。";
            return;
        }

        analyzeText(text); // 入力されたテキストを解析
    });
};

// テキストを形態素解析する関数
function analyzeText(text) {
    const output = document.getElementById("output"); // 結果表示エリア

    // Kuromoji.js で形態素解析を実行
    kuromoji.builder({ dicPath: DICT_PATH }).build((err, tokenizer) => {
        if (err) {
            console.error(err); // エラーメッセージをコンソールに表示
            output.textContent = "形態素解析エラー";
            return;
        }

        const tokens = tokenizer.tokenize(text); // テキストを解析
        const nouns = tokens
            .filter((token) => token.pos === "名詞") // 名詞を抽出
            .map((token) => token.surface_form); // 名詞の表層形を取得

        // 名詞が見つからない場合
        if (nouns.length === 0) {
            output.textContent = "名詞は見つかりませんでした。";
        } else {
            output.textContent = nouns.join(", "); // 名詞を表示
        }
    });
}
