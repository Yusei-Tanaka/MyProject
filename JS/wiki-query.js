// WikidataのエンティティIDを取得
async function getWikidataEntityId(searchTerm) {
    let url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=ja&format=json&origin=*`;

    try {
        let response = await fetch(url);
        let data = await response.json();

        if (data.search && data.search.length > 0) {
            return data.search[0].id; // 最初のエンティティのIDを返す
        } else {
            console.warn("Wikidata にエンティティが見つかりませんでした:", searchTerm);
            return null;
        }
    } catch (error) {
        console.error("Wikidata エンティティの取得に失敗しました:", error);
        return null;
    }
}

// 複数のエンティティIDを元に共通関連ワードを取得するSPARQLクエリを生成
function generateSparqlQueryForEntities(entityIds) {
    if (entityIds.length === 0) return null;
    
    const isIntersectionMode = document.getElementById("intersectionMode").checked;
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
        let response = await fetch(url);
        let data = await response.json();
        return data.results.bindings; // 結果を返す
    } catch (error) {
        console.error("Wikidata クエリの実行に失敗しました:", error);
        return [];
    }
}