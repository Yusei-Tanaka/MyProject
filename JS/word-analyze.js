const DICT_PATH = "../dict"; // 辞書のパスを指定
const WORD_ANALYZE_DISABLE_WIKIDATA_CHECKS_TEMP = true;
const ANALYZE_DEBOUNCE_MS = 500;
const WORD_WIKIDATA_RETRY_COUNT = 1;
const WORD_WIKIDATA_BASE_DELAY_MS = 700;
const WORD_WIKIDATA_COOLDOWN_MS = 120000;
const nounWikidataCache = new Map();

let analyzeDebounceTimer = null;
let wikidataCooldownUntil = 0;

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
            if (analyzeDebounceTimer) {
                clearTimeout(analyzeDebounceTimer);
            }
            output.textContent = "テキストが入力されていません。";
            return;
        }

        if (analyzeDebounceTimer) {
            clearTimeout(analyzeDebounceTimer);
        }

        analyzeDebounceTimer = setTimeout(() => {
            analyzeText(text); // 入力されたテキストを解析
        }, ANALYZE_DEBOUNCE_MS);
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
    if (WORD_ANALYZE_DISABLE_WIKIDATA_CHECKS_TEMP) {
        const uniqueNouns = [...new Set(nouns.map(noun => (noun || "").trim()).filter(Boolean))];
        output.textContent = uniqueNouns.join(", ");
        return;
    }

    output.textContent = "Wikidata を確認しています...";

    try {
        const nounsWithEntries = await filterNounsByWikidata(nouns);

        if (nounsWithEntries.length === 0) {
            output.textContent = "Wikidata に一致する名詞は見つかりませんでした。";
        } else {
            output.textContent = nounsWithEntries.join(", ");
        }

        if (Date.now() < wikidataCooldownUntil) {
            output.textContent += " (Wikidata混雑中のため一部は未検証)";
        }
    } catch (error) {
        console.error("Wikidata チェック中にエラーが発生しました", error);
        output.textContent = "Wikidata 照会でエラーが発生しました。";
    }
}

// Wikidataに項目が存在するか判定
async function filterNounsByWikidata(nouns) {
    if (WORD_ANALYZE_DISABLE_WIKIDATA_CHECKS_TEMP) {
        return [...new Set(nouns.map(noun => (noun || "").trim()).filter(Boolean))];
    }

    const uniqueNouns = [...new Set(nouns.map(noun => (noun || "").trim()).filter(Boolean))];
    const results = [];

    for (const noun of uniqueNouns) {
        const hasEntry = await hasWikidataEntry(noun);
        results.push({ noun, hasEntry });
    }

    // 入力順序を保つために元の配列でフィルタリング
    const nounsWithEntriesSet = new Set(
        results
            .filter(item => item.hasEntry !== false)
            .map(item => item.noun)
    );
    return nouns.filter((noun) => nounsWithEntriesSet.has(noun));
}

// Wikidata API で項目の有無を確認
async function hasWikidataEntry(term) {
    if (WORD_ANALYZE_DISABLE_WIKIDATA_CHECKS_TEMP) {
        return null;
    }

    const normalizedTerm = (term || "").trim();
    if (!normalizedTerm) {
        return false;
    }

    if (nounWikidataCache.has(normalizedTerm)) {
        return nounWikidataCache.get(normalizedTerm);
    }

    if (Date.now() < wikidataCooldownUntil) {
        // クールダウン中は外部アクセスを止めてエラー連発を防ぐ
        nounWikidataCache.set(normalizedTerm, null);
        return null;
    }

    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(normalizedTerm)}&language=ja&format=json&origin=*`;
    let lastError = null;

    for (let attempt = 1; attempt <= WORD_WIKIDATA_RETRY_COUNT; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    "Accept": "application/json"
                }
            });
            const responseText = await response.text();

            if (!response.ok) {
                const isRateLimited = response.status === 429 || /too\s+many\s+requests|you\s+are\s+making/i.test(responseText || "");
                if (isRateLimited && attempt < WORD_WIKIDATA_RETRY_COUNT) {
                    const waitMs = WORD_WIKIDATA_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
                    await delayWordAnalyze(waitMs);
                    continue;
                }

                if (isRateLimited) {
                    // レート制限時は未確定扱いとして除外しない
                    wikidataCooldownUntil = Date.now() + WORD_WIKIDATA_COOLDOWN_MS;
                    nounWikidataCache.set(normalizedTerm, null);
                    return null;
                }

                console.error("Wikidata API からエラー応答", response.status);
                nounWikidataCache.set(normalizedTerm, false);
                return false;
            }

            let data = null;
            try {
                data = responseText ? JSON.parse(responseText) : null;
            } catch (parseError) {
                console.warn("Wikidata 応答のJSON解析に失敗", normalizedTerm);
                nounWikidataCache.set(normalizedTerm, null);
                return null;
            }

            const exists = Array.isArray(data?.search) && data.search.length > 0;
            nounWikidataCache.set(normalizedTerm, exists);
            return exists;
        } catch (error) {
            lastError = error;
            if (attempt < WORD_WIKIDATA_RETRY_COUNT) {
                const waitMs = WORD_WIKIDATA_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
                await delayWordAnalyze(waitMs);
                continue;
            }
        }
    }

    console.warn("Wikidata API 呼び出しに失敗", normalizedTerm, lastError);
    nounWikidataCache.set(normalizedTerm, null);
    // 通信失敗時も未確定扱いとして除外しない
    return null;
}

function delayWordAnalyze(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
