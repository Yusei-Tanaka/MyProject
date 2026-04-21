function searchWikidataEntity() {
    const t = (key, vars = {}, fallback = "") => {
        if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
            return window.APP_I18N.t(key, vars, fallback);
        }
        return fallback || key;
    };

    const searchTerm = document.getElementById("searchTerm").value.trim();
    if (!searchTerm) {
        alert(t("alerts.enterWord", {}, "単語を入力してください"));
        return;
    }

    const language =
        window.APP_I18N && typeof window.APP_I18N.getLanguage === "function"
            ? window.APP_I18N.getLanguage()
            : "ja";

    // Wikidata API の JSONP 用 URL
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=${encodeURIComponent(language)}&format=json&callback=handleResponse`;

    // スクリプトタグを作成して JSONP を実行
    const script = document.createElement("script");
    script.src = url;
    document.body.appendChild(script);
}

function handleResponse(data) {
    const t = (key, vars = {}, fallback = "") => {
        if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
            return window.APP_I18N.t(key, vars, fallback);
        }
        return fallback || key;
    };

    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = ""; // 結果エリアをクリア

    if (data.search && data.search.length > 0) {
        const entity = data.search[0]; // 最初のエンティティを取得
        resultDiv.innerHTML = `
            <p><strong>${t("search.entityIdLabel", {}, "エンティティ ID:")}</strong>
            <a href="https://www.wikidata.org/wiki/${entity.id}" target="_blank">${entity.id}</a></p>
        `;
    } else {
        resultDiv.innerText = t("search.notFound", {}, "エンティティが見つかりませんでした。");
    }
}
