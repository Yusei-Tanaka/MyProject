// WikidataのエンティティIDを取得
const wikidataEntityIdCache = new Map();
const WIKIDATA_RETRY_COUNT = 2;
const WIKIDATA_BASE_DELAY_MS = 600;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isWikidataRateLimitResponse(response, responseText) {
    if (!response) return false;
    if (response.status === 429) return true;
    return /too\s+many\s+requests|rate\s+limit|you\s+are\s+making/i.test(responseText || "");
}

async function fetchWikidataJson(url, options = {}) {
    const {
        retryCount = WIKIDATA_RETRY_COUNT,
        baseDelayMs = WIKIDATA_BASE_DELAY_MS
    } = options;

    let lastError = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    "Accept": "application/json"
                }
            });

            const responseText = await response.text();
            let parsed = null;

            if (responseText) {
                try {
                    parsed = JSON.parse(responseText);
                } catch (parseError) {
                    if (!isWikidataRateLimitResponse(response, responseText)) {
                        throw new Error(`Wikidata JSON解析失敗 (HTTP ${response.status})`);
                    }
                }
            }

            if (response.ok && parsed) {
                return parsed;
            }

            const canRetry = isWikidataRateLimitResponse(response, responseText) || response.status >= 500;
            if (!canRetry || attempt === retryCount) {
                throw new Error(`Wikidata APIエラー: HTTP ${response.status}`);
            }

            const waitMs = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
            await delay(waitMs);
        } catch (error) {
            lastError = error;

            if (attempt === retryCount) {
                break;
            }

            const waitMs = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
            await delay(waitMs);
        }
    }

    throw lastError || new Error("Wikidata API呼び出しに失敗しました");
}

async function getWikidataEntityId(searchTerm) {
    const normalizedTerm = (searchTerm || "").trim();
    if (!normalizedTerm) {
        return null;
    }

    if (wikidataEntityIdCache.has(normalizedTerm)) {
        return wikidataEntityIdCache.get(normalizedTerm);
    }

    let url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(normalizedTerm)}&language=ja&format=json&origin=*`;

    try {
        let data = await fetchWikidataJson(url);

        if (data.search && data.search.length > 0) {
            const entityId = data.search[0].id;
            wikidataEntityIdCache.set(normalizedTerm, entityId);
            return entityId; // 最初のエンティティのIDを返す
        } else {
            // 検索結果が空だった場合のみ未登録としてキャッシュ
            wikidataEntityIdCache.set(normalizedTerm, null);
            return null;
        }
    } catch (error) {
        console.warn(`Wikidata エンティティの取得に失敗しました (${normalizedTerm}):`, error);
        // 通信失敗・429は未登録とは別扱いにし、除外判定しない
        return undefined;
    }
}

// 複数のエンティティIDを元に共通関連ワードを取得するSPARQLクエリを生成
function generateSparqlQueryForEntities(entityIds) {
  if (entityIds.length === 0) return null;

  const intersectionCheckbox = document.getElementById("intersectionMode");
  const isIntersectionMode = intersectionCheckbox ? intersectionCheckbox.checked : false;
  let sparqlQuery;
  
  if (isIntersectionMode) {
      // 積集合の検索結果
      let valuesClause = `VALUES ?s { ${entityIds.map(id => `wd:${id}`).join(" ")} }`;
      sparqlQuery = `
          SELECT ?commonRelatedEntity ?commonLabel WHERE {
              ${valuesClause}
              ?s ?p ?commonRelatedEntity . 
              ?commonRelatedEntity rdfs:label ?commonLabel . 
              FILTER(LANG(?commonLabel) = "ja")
          }
          GROUP BY ?commonRelatedEntity ?commonLabel
          HAVING (COUNT(DISTINCT ?s) = ${entityIds.length})
          LIMIT 30
      `;
  } else {
      // 和集合の検索結果
      let queryParts = entityIds.map(id => `
          {
              wd:${id} ?p ?commonRelatedEntity . 
              ?commonRelatedEntity rdfs:label ?commonLabel . 
              FILTER(LANG(?commonLabel) = "ja")
          }
      `);
      sparqlQuery = `
          SELECT ?commonRelatedEntity ?commonLabel WHERE {
              ${queryParts.join(" UNION ")}
          }
          LIMIT 30
      `;
  }
  
  console.log("チェックボックスの状態:", isIntersectionMode);
  console.log("生成したSPARQLクエリ:", sparqlQuery);
  return sparqlQuery;
}

// WikidataにSPARQLクエリを投げる
async function queryWikidata(sparqlQuery) {
    let url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(sparqlQuery) + "&format=json";

    try {
        let data = await fetchWikidataJson(url);
        return data.results.bindings; // 結果を返す
    } catch (error) {
        console.error("Wikidata クエリの実行に失敗しました:", error);
        return [];
    }
}

const arrowToggle = document.getElementById("arrowToggle");
const arrowEnabled = arrowToggle ? arrowToggle.checked : false;