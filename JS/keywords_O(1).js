// キーワードをクリックした際にノードを追加
function handleKeywordClick(keyword) {
    console.log(`クリックされたキーワード: ${keyword}`); // クリックされたキーワードを確認

    // ノードが既に存在するかチェック（ラベルで重複を避ける）
    let existingNode = nodes.get({
        filter: function(node) {
            return node.label === keyword;
        }
    });

    if (existingNode.length === 0) {
        // ネットワークの中心座標を取得
        var center = network.getViewPosition();
        // 新しいノードを作成
        var newNode = {
            id: nodes.length + 1, // IDを自動生成
            label: keyword,
            x: center.x,
            y: center.y
        };
        nodes.add(newNode); // ノードを追加
        console.log(`キーワード "${keyword}" をノードとして追加しました。`);
    } else {
        console.log(`キーワード "${keyword}" のノードは既に存在しています。`);
    }
}

function showKeywordLoading() {
    const existing = document.querySelector(".keyword-loading-overlay");
    if (existing) return existing;

    const container = document.querySelector(".left-navi") || document.getElementById("left-navi-content") || document.body;
    if (container && container.style.position !== "relative" && container.style.position !== "absolute") {
        container.style.position = "relative";
    }

    const overlay = document.createElement("div");
    overlay.className = "keyword-loading-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.25)";
    overlay.style.zIndex = "20";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const message = document.createElement("div");
    message.className = "keyword-loading";
    message.textContent = "思考中...";
    message.style.background = "#eef6ff";
    message.style.border = "1px solid #b7d5f2";
    message.style.padding = "16px 28px";
    message.style.borderRadius = "12px";
    message.style.fontSize = "1.4em";
    message.style.fontWeight = "bold";
    message.style.color = "#1f4b74";
    message.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";

    overlay.appendChild(message);
    container.appendChild(overlay);
    return overlay;
}

function removeKeywordLoading() {
    const existing = document.querySelector(".keyword-loading-overlay");
    if (existing) existing.remove();
}

// output内のキーワード群を基にAPIへ問い合わせる
async function requestKeywordsFromOutput(keywords) {
    const uniqueKeywords = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];

    if (uniqueKeywords.length === 0) {
        console.log("APIリクエスト用のキーワードがありません。");
        return;
    }

    const { validKeywords, missingKeywords } = await filterKeywordsByWikidata(uniqueKeywords);

    if (missingKeywords.length > 0) {
        console.warn("Wikidataに存在しないキーワード:", missingKeywords);
    }

    if (validKeywords.length === 0) {
        alert("Wikidataに存在するキーワードがありません。");
        return;
    }

    const themeValue = (window.theme || document.querySelector("#myTitle")?.value || "未設定のテーマ").trim();
    const relationPerspectives = [
        { id: "P01", label: "背景" },
        { id: "P02", label: "課題" },
        { id: "P03", label: "影響" },
        { id: "P04", label: "対策" },
        { id: "P05", label: "要因" },
        { id: "P06", label: "評価" },
        { id: "P07", label: "持続可能性" },
        { id: "P08", label: "技術" },
        { id: "P09", label: "経済" },
        { id: "P10", label: "国際比較" },
        { id: "P11", label: "行動" },
        { id: "P12", label: "環境負荷" }
    ];

    const perspectiveIdMap = new Map(relationPerspectives.map(p => [p.id, p.label]));
    const aiResponses = [];
    const KEYWORDS_PER_REQUEST = 3; // 2〜3件まとめて問い合わせ、ラウンドトリップ数を削減
    const MAX_PROMPT_RETRIES = 1;
    const failedChunks = [];

    const keywordChunks = [];
    for (let i = 0; i < validKeywords.length; i += KEYWORDS_PER_REQUEST) {
        keywordChunks.push(validKeywords.slice(i, i + KEYWORDS_PER_REQUEST));
    }

    const perspectiveLegend = relationPerspectives.map(p => `${p.id}:${p.label}`).join(" / ");

    // APIにプロンプトを送信する共通処理
    const postPrompt = async (prompt, chunkLabel) => {
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_PROMPT_RETRIES; attempt++) {
            try {
                const response = await fetch(`${apiBaseUrl}/api`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ prompt })
                });

                if (!response.ok) {
                    throw new Error(`HTTPエラー: ${response.status}`);
                }

                const data = await response.json();
                console.log("outputキーワードAPIの結果 (対象キーワード一覧):", data.result);

                const parsedResult = parseJsonFromAiResponse(data.result);
                if (parsedResult) {
                    const normalized = expandPerspectiveIds(parsedResult, perspectiveIdMap);
                    aiResponses.push(normalized);
                    return true;
                }

                console.warn(`AIレスポンスの解析に失敗しました (試行${attempt}/${MAX_PROMPT_RETRIES}):`, chunkLabel);
            } catch (error) {
                lastError = error;
                console.error(`outputキーワードAPI呼び出しでエラー (試行${attempt}/${MAX_PROMPT_RETRIES}):`, error);
            }

            if (attempt < MAX_PROMPT_RETRIES) {
                await delay(500 * attempt); // 軽いリトライ待機
            }
        }

        if (lastError) {
            console.warn(`AIレスポンス取得に失敗しました: ${chunkLabel}`, lastError);
        }
        return false;
    };
    
    const chunkTasks = keywordChunks.map(chunk => {
        const chunkLabel = chunk.join(", ");
        const prompt = `
        ##タスク
        目的: 学習者は「${themeValue}」の探究中。各対象キーワードについて観点ID(Pxx)ごとにWikidataに存在する関連語を最大10件挙げること。

        ##対象キーワード
        ${chunk.map(k => `- ${k}`).join("\n")}

        ##観点ID一覧
        ${perspectiveLegend}

        ##制約
        1. 出力キーは観点ID(P01等)のみを使用。
        2. 各語はWikidataに項目があるものに限定。
        3. 関連語が不足する場合は無理に埋めない。

        ##出力形式
        {
            "対象キーワード1": {
                "P01": ["関連語1", "関連語2"],
                "P02": []
            }
        }
        `;

        console.log("生成されたプロンプト(output部分):", prompt);
        return postPrompt(prompt, chunkLabel).then(success => ({ chunkLabel, success }));
    });

    const settledResults = await Promise.allSettled(chunkTasks);
    settledResults.forEach(result => {
        if (result.status === "fulfilled") {
            if (!result.value.success) {
                failedChunks.push(result.value.chunkLabel);
            }
        } else {
            console.warn("観点生成タスクで予期せぬ拒否が発生", result.reason);
        }
    });

    if (failedChunks.length > 0) {
        console.warn("AI生成に失敗したキーワード:", failedChunks);
    }

    console.log("generate (outputキーワードの全結果):", aiResponses);
    return aiResponses;
}

// 複数キーワードのエンティティIDから共通関連語を取得（Wikidata）
async function requestCommonKeywordsFromEntities(keywords) {
    const uniqueKeywords = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];
    if (uniqueKeywords.length === 0) {
        return [];
    }

    const entityIds = [];
    for (const keyword of uniqueKeywords) {
        const entityId = await getWikidataEntityId(keyword);
        if (entityId) {
            entityIds.push(entityId);
        }
    }

    if (entityIds.length === 0) {
        return [];
    }

    const sparqlQuery = generateSparqlQueryForEntities(entityIds);
    const results = await queryWikidata(sparqlQuery);
    if (!Array.isArray(results) || results.length === 0) {
        return [];
    }

    return Array.from(new Set(results.map(binding => binding.commonLabel?.value).filter(Boolean)));
}

async function filterKeywordsByWikidata(keywords) {
    const checks = await Promise.all(keywords.map(async keyword => {
        try {
            const entityId = await getWikidataEntityId(keyword);
            return { keyword, entityId };
        } catch (error) {
            console.error(`Wikidata検索でエラーが発生しました (${keyword})`, error);
            return { keyword, entityId: null };
        }
    }));

    const validKeywords = checks.filter(item => item.entityId).map(item => item.keyword);
    const missingKeywords = checks.filter(item => !item.entityId).map(item => item.keyword);

    return { validKeywords, missingKeywords };
}

// AIレスポンスに含まれるJSON文字列を安全に抽出・解析する
function parseJsonFromAiResponse(aiOutput) {
    if (!aiOutput) {
        return null;
    }

    if (typeof aiOutput === "object") {
        return aiOutput;
    }

    let content = String(aiOutput).trim();

    const candidates = new Set();
    const pushCandidate = (text) => {
        if (text && text.length > 0) {
            candidates.add(text);
        }
    };

    pushCandidate(content);

    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
        pushCandidate(codeBlockMatch[1].trim());
    }

    if (content.startsWith("```") && content.endsWith("```")) {
        pushCandidate(content.slice(3, -3).trim());
    }

    const braceCaptured = content.replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
    if (braceCaptured && braceCaptured.startsWith("{")) {
        pushCandidate(braceCaptured.trim());
    }

    const balancedJson = extractBalancedJson(content);
    if (balancedJson) {
        pushCandidate(balancedJson);
    }

    const fenceStripped = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    if (fenceStripped !== content) {
        pushCandidate(fenceStripped);
    }

    const normalizedCandidates = new Set();
    candidates.forEach(candidate => {
        normalizedCandidates.add(candidate);
        const balanced = balanceJsonBraces(candidate);
        const trimmedCommas = stripTrailingCommas(candidate);
        if (balanced !== candidate) {
            normalizedCandidates.add(balanced);
            const balancedTrimmed = stripTrailingCommas(balanced);
            if (balancedTrimmed !== balanced) {
                normalizedCandidates.add(balancedTrimmed);
            }
        }
        if (trimmedCommas !== candidate) {
            normalizedCandidates.add(trimmedCommas);
        }
    });

    for (const candidate of normalizedCandidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            continue;
        }
    }

    console.error("AIレスポンスのJSON解析に失敗しました", content);
    return null;
}

function expandPerspectiveIds(response, idMap) {
    if (!response || typeof response !== "object") {
        return response;
    }

    const expanded = {};
    Object.entries(response).forEach(([keyword, perspectives]) => {
        const normalizedPerspectives = perspectives && typeof perspectives === "object" ? perspectives : {};
        expanded[keyword] = {};

        Object.entries(normalizedPerspectives).forEach(([perspectiveId, keywords]) => {
            const label = idMap.get(perspectiveId) || perspectiveId;
            expanded[keyword][label] = Array.isArray(keywords) ? keywords : [];
        });
    });

    return expanded;
}

function balanceJsonBraces(text) {
    const openCount = (text.match(/{/g) || []).length;
    const closeCount = (text.match(/}/g) || []).length;
    if (openCount > closeCount) {
        return text + "}".repeat(openCount - closeCount);
    }
    return text;
}

function stripTrailingCommas(text) {
    return text.replace(/,(?=\s*[}\]])/g, "");
}

function extractBalancedJson(text) {
    const start = text.indexOf("{");
    if (start === -1) {
        return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === "\"") {
                inString = false;
            }
            continue;
        }

        if (char === "\"") {
            inString = true;
            continue;
        }

        if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }

    return null;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function renderAiKeywords(resultBox, aiResponses) {
    const list = document.createElement("ul");
    aiResponses.forEach(response => {
        Object.values(response || {}).forEach(perspectives => {
            Object.values(perspectives || {}).forEach(keywords => {
                if (!Array.isArray(keywords) || keywords.length === 0) {
                    return;
                }

                keywords.forEach(relatedWord => {
                    if (!relatedWord) {
                        return;
                    }
                    const listItem = document.createElement("li");
                    listItem.textContent = relatedWord;
                    listItem.style.cursor = "pointer";
                    listItem.addEventListener("click", () => {
                        console.log(`生成キーワード "${relatedWord}" がクリックされました`);
                        handleKeywordClick(relatedWord);
                    });
                    list.appendChild(listItem);
                });
            });
        });
    });

    if (!list.hasChildNodes()) {
        resultBox.innerHTML += "<p>生成キーワードを取得できませんでした。</p>";
        return;
    }

    resultBox.appendChild(list);
}

function collectAiKeywords(aiResponses) {
    const collected = [];
    aiResponses.forEach(response => {
        Object.values(response || {}).forEach(perspectives => {
            Object.values(perspectives || {}).forEach(keywords => {
                if (!Array.isArray(keywords) || keywords.length === 0) {
                    return;
                }
                keywords.forEach(word => {
                    if (word) collected.push(word);
                });
            });
        });
    });
    return collected;
}

function renderUnifiedKeywords(resultBox, unifiedKeywords) {
    if (!Array.isArray(unifiedKeywords) || unifiedKeywords.length === 0) {
        resultBox.innerHTML += "<p>キーワードを取得できませんでした。</p>";
        return;
    }

    const list = document.createElement("ul");
    unifiedKeywords.forEach(label => {
        const listItem = document.createElement("li");
        listItem.textContent = label;
        listItem.style.cursor = "pointer";
        listItem.addEventListener("click", () => {
            console.log(`キーワード \"${label}\" がクリックされました`);
            handleKeywordClick(label);
        });
        list.appendChild(listItem);
    });

    list.style.textAlign = "left";
    resultBox.appendChild(list);
}

function shuffleArray(items) {
    const array = items.slice();
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// キーワード生成の処理
document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("keywordCreationBtn").addEventListener("click", async function () {
        let outputElement = document.getElementById("output");
        let text = outputElement.innerText.trim();

        //【修正】全角→半角変換 & 句読点・スペースを削除
        text = text.replace(/[、，\s]+/g, " ");  // 句読点・スペースを統一
        text = text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); // 全角→半角

        let keywords = text.split(" ")
            .map(k => k.replace(/^[,、\s]+|[,、\s]+$/g, "")) // 先頭・末尾のカンマやスペースを削除
            .filter(k => k.length > 0); // 空のキーワードを除外

        console.log("処理後のキーワード:", keywords);

        //【追加】ログエリアにキーワードを表示
        displayKeywordsLog(keywords);

        let resultBox = document.getElementById("resultBox");
        resultBox.innerHTML = ""; // 初期化

        showKeywordLoading();

        let aiResponses = [];
        let commonKeywords = [];

        try {
            const results = await Promise.all([
                requestKeywordsFromOutput(keywords),
                requestCommonKeywordsFromEntities(keywords)
            ]);
            aiResponses = results[0] || [];
            commonKeywords = results[1] || [];
        } catch (error) {
            console.error("キーワード生成処理でエラーが発生しました:", error);
        } finally {
            removeKeywordLoading();
        }

        resultBox.innerHTML = "<strong><u>生成されたキーワード</u></strong><br>";

        const unified = Array.from(new Set([
            ...collectAiKeywords(aiResponses),
            ...(commonKeywords || [])
        ]));
        const shuffled = shuffleArray(unified);
        renderUnifiedKeywords(resultBox, shuffled);
    });
});
