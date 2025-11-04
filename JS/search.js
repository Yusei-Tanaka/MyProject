function searchWikidataEntity() {
    const searchTerm = document.getElementById("searchTerm").value.trim();
    if (!searchTerm) {
        alert("単語を入力してください");
        return;
    }

    // Wikidata API の JSONP 用 URL
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=ja&format=json&callback=handleResponse`;

    // スクリプトタグを作成して JSONP を実行
    const script = document.createElement("script");
    script.src = url;
    document.body.appendChild(script);
}

function handleResponse(data) {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = ""; // 結果エリアをクリア

    if (data.search && data.search.length > 0) {
        const entity = data.search[0]; // 最初のエンティティを取得
        resultDiv.innerHTML = `
            <p><strong>エンティティ ID:</strong> 
            <a href="https://www.wikidata.org/wiki/${entity.id}" target="_blank">${entity.id}</a></p>
        `;
    } else {
        resultDiv.innerText = "エンティティが見つかりませんでした。";
    }
}
