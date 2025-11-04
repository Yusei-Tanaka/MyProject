const DICT_PATH = "../dict"; // 辞書のパスを指定

window.onload = (event) => {
    const myTitleInput = document.getElementById("myTitle"); // テキスト入力欄
    const searchBtn = document.getElementById("serchBtn"); // 検索ボタン
    const output = document.getElementById("output"); // 結果表示エリア

    // 検索ボタンのクリックイベントを設定
    searchBtn.addEventListener("click", () => {
        const text = myTitleInput.value; // 入力されたテキストを取得

        // テキストが空白の場合、メッセージを表示
        if (text.trim() === "") {
            output.textContent = "テキストが入力されていません。";
            return;
        }

        // Kuromoji.js で形態素解析を実行
        kuromoji.builder({ dicPath: DICT_PATH }).build((err, tokenizer) => {
            if (err) {
                console.error(err); // エラーメッセージをコンソールに表示
                output.textContent = "形態素解析エラー";
                return;
            }

            const tokens = tokenizer.tokenize(text); // テキストを解析
            const nouns = tokens
                .filter((token) => token.pos === "名詞")  // 名詞を抽出
                .map((token) => token.surface_form);    // 名詞の表層形を取得

            // 名詞が見つからない場合
            if (nouns.length === 0) {
                output.textContent = "名詞は見つかりませんでした。";
            } else {
                output.textContent = nouns.join(", "); // 名詞を表示
            }
        });
    });
};
