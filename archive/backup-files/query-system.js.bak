/*

async function test(){
    let element = document.getElementById('myText');
    console.log(element.value);

    var sparqlquery = `
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT ?s ?turningpoint
    WHERE {
        ?s <http://www.w3.org/2000/01/rdf-schema#label> "`+element.value+`" .
        ?s <http://www.w3.org/2000/01/rdf-schema#turningpoint> ?turningpoint .
    }
    `;
    console.log(sparqlquery);
    var data = await GetQueryData(sparqlquery);
    console.log(data);
    data.results.bindings.forEach(binding => {
        var resultname = binding.turningpoint.value;
        console.log(resultname);
    });
}

async function GetQueryData(query){
    const endpointUrl = "http://localhost:3030/MyData/sparql";
    try {
        // Fetch リクエストでSPARQL クエリを送信
        const response = await fetch(endpointUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/sparql-query", 
                "Accept": "application/sparql-results+json"
            },
            body: query
        });
        if (!response.ok) {
            throw new Error("SPARQL query failed: " + response.statusText);
        }
        // 結果をJSON としてパース
        var data = await response.json();
        //console.log(data);
        return data;
        //displayResults(data); // 結果の表示処理
    } catch (error) {
        console.error("Error:", error);
        return null;
    }
}

async function queryWikidata(sparqlQuery) {
    const endpointUrl = 'https://query.wikidata.org/sparql';
    // SPARQL エンドポイントに対するリクエストオプション
    const options = {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded' // URL エンコードされた形式にする
        },
        body: `query=${encodeURIComponent(sparqlQuery)}`
    };
    try {
        const response = await fetch(endpointUrl, options);
        // レスポンスのチェック
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.statusText);
        }
        const data = await response.json(); // JSON 形式でレスポンスをパース
        // 結果を処理する（ここではコンソールに表示）
        console.log(data);
        // 必要に応じて、data.results.bindings を利用してデータを扱うことができます
        return data.results.bindings;
    } catch (error) {
        console.error('Error while fetching data from Wikidata:', error);
    }
}

*/