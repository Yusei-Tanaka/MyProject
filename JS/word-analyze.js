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
    output.textContent = "解析中...";

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
            displayNounsWithWikidata(nouns, output);
        }
    });
}

// Wikidataに存在する名詞のみを表示
async function displayNounsWithWikidata(nouns, output) {
    output.textContent = "Wikidata を確認しています...";

    try {
        const nounsWithEntries = await filterNounsByWikidata(nouns);

        if (nounsWithEntries.length === 0) {
            output.textContent = "Wikidata に一致する名詞は見つかりませんでした。";
        } else {
            output.textContent = nounsWithEntries.join(", ");
        }
    } catch (error) {
        console.error("Wikidata チェック中にエラーが発生しました", error);
        output.textContent = "Wikidata 照会でエラーが発生しました。";
    }
}

// Wikidataに項目が存在するか判定
async function filterNounsByWikidata(nouns) {
    const uniqueNouns = [...new Set(nouns)];
    const results = await Promise.all(
        uniqueNouns.map(async (noun) => {
            const hasEntry = await hasWikidataEntry(noun);
            return hasEntry ? noun : null;
        })
    );

    // 入力順序を保つために元の配列でフィルタリング
    const nounsWithEntriesSet = new Set(results.filter(Boolean));
    return nouns.filter((noun) => nounsWithEntriesSet.has(noun));
}

// Wikidata API で項目の有無を確認
async function hasWikidataEntry(term) {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=ja&format=json&origin=*`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error("Wikidata API からエラー応答", response.status);
            return false;
        }

        const data = await response.json();
        return Array.isArray(data.search) && data.search.length > 0;
    } catch (error) {
        console.error("Wikidata API 呼び出しに失敗", term, error);
        return false;
    }
}
