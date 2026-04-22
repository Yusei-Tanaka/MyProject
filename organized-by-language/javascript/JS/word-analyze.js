const DICT_PATH = "../dict"; // 辞書のパスを指定
const WORD_ANALYZE_DISABLE_WIKIDATA_CHECKS_TEMP = true;
const ANALYZE_DEBOUNCE_MS = 500;
const WORD_WIKIDATA_RETRY_COUNT = 1;
const WORD_WIKIDATA_BASE_DELAY_MS = 700;
const WORD_WIKIDATA_COOLDOWN_MS = 120000;
const nounWikidataCache = new Map();
const ENGLISH_NOUN_FALLBACK_STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "he", "her", "hers", "him", "his", "i", "in", "is", "it", "its", "me", "mine",
    "my", "of", "on", "or", "our", "ours", "she", "that", "the", "their", "theirs",
    "them", "they", "this", "to", "us", "was", "we", "were", "what", "who", "will",
    "with", "you", "your", "yours"
]);

let analyzeDebounceTimer = null;
let wikidataCooldownUntil = 0;

function getWordAnalyzeLanguage() {
    if (window.APP_I18N && typeof window.APP_I18N.getLanguage === "function") {
        return window.APP_I18N.getLanguage();
    }
    const htmlLang = (document.documentElement.getAttribute("lang") || "").trim();
    return htmlLang || "ja";
}

function isWordAnalyzeEnglish() {
    return String(getWordAnalyzeLanguage()).toLowerCase().startsWith("en");
}

function wordAnalyzeMessage(ja, en) {
    return isWordAnalyzeEnglish() ? en : ja;
}

function normalizeEnglishCandidate(rawValue) {
    return String(rawValue || "")
        .trim()
        .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
        .replace(/\s+/g, " ");
}

function extractEnglishNouns(text) {
    const input = String(text || "");
    const collected = [];
    const seen = new Set();

    const pushUnique = (value) => {
        const normalized = normalizeEnglishCandidate(value);
        if (!normalized) return;
        if (/^\d+$/.test(normalized)) return;
        const lowered = normalized.toLowerCase();
        if (ENGLISH_NOUN_FALLBACK_STOPWORDS.has(lowered)) return;
        if (seen.has(lowered)) return;
        seen.add(lowered);
        collected.push(normalized);
    };

    if (typeof window.nlp === "function") {
        try {
            const doc = window.nlp(input);
            doc.match("#Noun").out("array").forEach(pushUnique);
            if (collected.length === 0) {
                doc.nouns().out("array").forEach(pushUnique);
            }
            return collected;
        } catch (error) {
            console.warn("英語名詞抽出で compromise の処理に失敗しました。", error);
        }
    }

    // ライブラリ未ロード時の最小フォールバック
    input.split(/[^A-Za-z0-9'-]+/).forEach(pushUnique);
    return collected;
}

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
            output.textContent = wordAnalyzeMessage("テキストが入力されていません。", "No text has been entered.");
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
    output.textContent = wordAnalyzeMessage("解析中...", "Analyzing...");

    if (isWordAnalyzeEnglish()) {
        const nouns = extractEnglishNouns(text);

        if (nouns.length === 0) {
            output.textContent = wordAnalyzeMessage("名詞は見つかりませんでした。", "No nouns were found.");
            return;
        }

        displayNounsWithWikidata(nouns, output);
        return;
    }

    // Kuromoji.js で形態素解析を実行
    kuromoji.builder({ dicPath: DICT_PATH }).build((err, tokenizer) => {
        if (err) {
            console.error(err); // エラーメッセージをコンソールに表示
            output.textContent = wordAnalyzeMessage("形態素解析エラー", "Morphological analysis error.");
            return;
        }

        const tokens = tokenizer.tokenize(text); // テキストを解析
        const nouns = tokens
            .filter((token) => token.pos === "名詞") // 名詞を抽出
            .map((token) => token.surface_form); // 名詞の表層形を取得

        // 名詞が見つからない場合
        if (nouns.length === 0) {
            output.textContent = wordAnalyzeMessage("名詞は見つかりませんでした。", "No nouns were found.");
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

    output.textContent = wordAnalyzeMessage("Wikidata を確認しています...", "Checking Wikidata...");

    try {
        const nounsWithEntries = await filterNounsByWikidata(nouns);

        if (nounsWithEntries.length === 0) {
            output.textContent = wordAnalyzeMessage("Wikidata に一致する名詞は見つかりませんでした。", "No Wikidata-matched nouns were found.");
        } else {
            output.textContent = nounsWithEntries.join(", ");
        }

        if (Date.now() < wikidataCooldownUntil) {
            output.textContent += wordAnalyzeMessage(" (Wikidata混雑中のため一部は未検証)", " (Some terms are unverified due to Wikidata rate limits)");
        }
    } catch (error) {
        console.error("Wikidata チェック中にエラーが発生しました", error);
        output.textContent = wordAnalyzeMessage("Wikidata 照会でエラーが発生しました。", "An error occurred while querying Wikidata.");
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

    const wikidataLanguage = isWordAnalyzeEnglish() ? "en" : "ja";
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(normalizedTerm)}&language=${encodeURIComponent(wikidataLanguage)}&format=json&origin=*`;
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
