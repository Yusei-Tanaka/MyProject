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
let wordAnalysisRevision = 0;
let nounPostprocessController = null;
let wordTokenizerPromise = null;
const nounPostprocessCache = new Map();

function cancelWordAnalysis() {
    const button = document.getElementById('keywordCreationBtn');
    if (button) button.disabled = true;
    wordAnalysisRevision++;
    nounPostprocessController?.abort();
}

function getWordTokenizer() {
    if (!wordTokenizerPromise) {
        wordTokenizerPromise = new Promise((resolve, reject) => {
            kuromoji.builder({ dicPath: DICT_PATH }).build((error, tokenizer) => {
                if (error) { wordTokenizerPromise = null; reject(error); }
                else resolve(tokenizer);
            });
        });
    }
    return wordTokenizerPromise;
}

async function postprocessJapaneseNouns(text, tokens, signal) {
    if (nounPostprocessCache.has(text)) return nounPostprocessCache.get(text);
    const config = window.APP_CONFIG || {};
    const base = config.flaskApiBaseUrl || `http://${window.location.hostname || '127.0.0.1'}:${Number(config.flaskApiPort || 8000)}`;
    const response = await fetch(`${base}/api/noun-phrases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tokens: tokens.map(token => ({
            surface_form: token.surface_form, pos: token.pos,
            pos_detail_1: token.pos_detail_1, pos_detail_2: token.pos_detail_2,
            pos_detail_3: token.pos_detail_3, basic_form: token.basic_form
        })) }),
        signal
    });
    if (!response.ok) throw new Error(`Noun post-processing HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.spans)) throw new Error('Invalid noun spans');
    let previousEnd = 0;
    const nouns = data.spans.map(span => {
        const { start, end } = span;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < previousEnd || start < 0 || end <= start || end > tokens.length) {
            throw new Error('Invalid noun span range');
        }
        previousEnd = end;
        const noun = tokens.slice(start, end).map(token => token.surface_form).join('');
        if (!text.includes(noun)) throw new Error('Noun is absent from source');
        return noun;
    });
    const unique = [...new Set(nouns)];
    nounPostprocessCache.set(text, unique);
    if (nounPostprocessCache.size > 50) nounPostprocessCache.delete(nounPostprocessCache.keys().next().value);
    return unique;
}
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
        cancelWordAnalysis(); // Invalidate results immediately, including the debounce interval.

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

// Preserve compound nouns and adjective nominalisations instead of exposing suffixes.
function extractJapaneseNouns(tokens) {
    const nouns = [];
    let compound = "";
    let previous = null;
    const flush = () => {
        if (compound && !/^[0-9０-９.,，．]+$/.test(compound)) nouns.push(compound);
        compound = "";
    };
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        const surface = token.surface_form || "";
        const detail = token.pos_detail_1;
        // Kuromoji may tag やすさ/にくさ as auxiliaries or particles.
        const stem = tokens[index - 2];
        if (surface === "さ" && ["やす", "にく"].includes(previous?.surface_form) && stem?.pos === "動詞") {
            flush();
            compound = stem.surface_form + previous.surface_form + surface;
        } else if (token.pos === "名詞" && detail === "接尾") {
            if (compound) compound += surface;
            else if (surface === "さ" && previous?.pos === "形容詞") {
                compound = previous.surface_form + surface;
            }
        } else if (token.pos === "名詞" && !["非自立", "代名詞"].includes(detail)) {
            // Whitespace is a boundary even if the tokenizer omits it.
            if (previous && token.word_position !== previous.word_position + previous.surface_form.length) flush();
            compound += surface;
        } else {
            flush();
        }
        previous = token;
    }
    flush();
    return [...new Set(nouns)];
}

// テキストを形態素解析する関数
async function analyzeText(text) {
    cancelWordAnalysis();
    const revision = wordAnalysisRevision;
    const isCurrent = () => revision === wordAnalysisRevision;
    const output = document.getElementById("output");
    output.textContent = wordAnalyzeMessage("解析中...", "Analyzing...");
    delete output.dataset.analysisMode;
    output.removeAttribute('title');

    let nouns;
    if (isWordAnalyzeEnglish()) {
        nouns = extractEnglishNouns(text);
    } else {
        let tokens;
        try {
            tokens = (await getWordTokenizer()).tokenize(text);
        } catch (error) {
            if (isCurrent()) output.textContent = wordAnalyzeMessage("形態素解析エラー", "Morphological analysis error.");
            console.error(error);
            return;
        }
        if (!isCurrent()) return;
        const controller = new AbortController();
        nounPostprocessController = controller;
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            nouns = await postprocessJapaneseNouns(text, tokens, controller.signal);
            if (!isCurrent()) return;
            output.dataset.analysisMode = 'api';
        } catch (error) {
            if (!isCurrent()) return;
            console.warn('Noun post-processing unavailable; using local analysis.', error);
            nouns = extractJapaneseNouns(tokens);
            output.dataset.analysisMode = 'local';
            output.title = wordAnalyzeMessage('API後処理を利用できなかったため、ローカル解析結果を表示しています。', 'API post-processing was unavailable; showing local analysis.');
        } finally {
            clearTimeout(timeout);
            if (nounPostprocessController === controller) nounPostprocessController = null;
        }
    }
    if (!isCurrent()) return;
    if (nouns.length === 0) {
        output.textContent = wordAnalyzeMessage("名詞は見つかりませんでした。", "No nouns were found.");
    } else {
        await displayNounsWithWikidata(nouns, output, isCurrent);
        if (isCurrent()) {
            const button = document.getElementById('keywordCreationBtn');
            if (button) button.disabled = false;
            if (typeof window.addAnalyzedKeywordsToMap === 'function') {
                await window.addAnalyzedKeywordsToMap(nouns, isCurrent);
            }
        }
    }
}

// Wikidataに存在する名詞のみを表示
async function displayNounsWithWikidata(nouns, output, isCurrent = () => true) {
    if (WORD_ANALYZE_DISABLE_WIKIDATA_CHECKS_TEMP) {
        const uniqueNouns = [...new Set(nouns.map(noun => (noun || "").trim()).filter(Boolean))];
        output.textContent = uniqueNouns.join(", ");
        return;
    }

    output.textContent = wordAnalyzeMessage("Wikidata を確認しています...", "Checking Wikidata...");

    try {
        const nounsWithEntries = await filterNounsByWikidata(nouns);
        if (!isCurrent()) return;

        if (nounsWithEntries.length === 0) {
            output.textContent = wordAnalyzeMessage("Wikidata に一致する名詞は見つかりませんでした。", "No Wikidata-matched nouns were found.");
        } else {
            output.textContent = nounsWithEntries.join(", ");
        }

        if (Date.now() < wikidataCooldownUntil) {
            output.textContent += wordAnalyzeMessage(" (Wikidata混雑中のため一部は未検証)", " (Some terms are unverified due to Wikidata rate limits)");
        }
    } catch (error) {
        if (!isCurrent()) return;
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
