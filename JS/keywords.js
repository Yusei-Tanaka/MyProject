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
        // 新しいノードを作成
        var newNode = {
            id: nodes.length + 1, // IDを自動生成
            label: keyword,
        };
        nodes.add(newNode); // ノードを追加
        console.log(`キーワード "${keyword}" をノードとして追加しました。`);
    } else {
        alert(`キーワード "${keyword}" のノードは既に存在しています。`);
    }
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
        resultBox.innerHTML = "<strong><u>生成されたキーワード</u></strong><br>"; // 初期化

        // 複数キーワードのエンティティIDを取得
        let entityIds = [];
        for (let keyword of keywords) {
            let entityId = await getWikidataEntityId(keyword);
            loadCSVData();  // データ読み込み
            setTimeout(() => {
                let relatedWords = getRelatedKeywords(keyword);  // 関数に渡す
            
                // 【修正】全てのカテゴリーのデータを統合する
                if (relatedWords && typeof relatedWords === "object") {
                    relatedWords = Object.values(relatedWords).flat(); // 配列に統合
                } else {
                    relatedWords = [];  // データがない場合は空の配列に
                }
            
                console.log(`「${keyword}」に関連する語（統合）:`, relatedWords); // デバッグ用
            
                if (Array.isArray(relatedWords)) {  // 配列であるかをチェック
                    console.log(`キーワード「${keyword}」に関連する語:`, relatedWords);
            
                    // 関連語をresultBoxに追加
                    let relatedList = document.createElement("ul");
                    
                    // 既存のキーワードを統合し、重複を取り除く
                    let allRelatedWords = [...new Set(relatedWords)];

                    allRelatedWords.forEach(relatedWord => {
                        let listItem = document.createElement("li");
                        listItem.textContent = relatedWord; // リスト項目に関連語を設定
                        listItem.style.cursor = "pointer";  // ポインタを手のひらに変更
                        listItem.addEventListener("click", function () {
                            console.log(`関連語 "${relatedWord}" がクリックされました`); // クリックされた関連語を確認
                            handleKeywordClick(relatedWord);  // クリックされた関連語でノード追加
                        });
                        relatedList.appendChild(listItem);
                    });
            
                    // 関連語リストを結果に追加
                    let relatedItem = document.createElement("div");
                    //relatedItem.innerHTML = `<strong>${keyword} に関連する語</strong>`;
                    relatedItem.appendChild(relatedList);
                    resultBox.appendChild(relatedItem);
                } else {
                    console.error(`関連語が配列でありません: ${keyword}`);
                }
            }, 2000);            
            if (entityId) {
                entityIds.push(entityId);
            }
        }

        if (entityIds.length === 0) {
            console.log("エンティティIDが見つかりませんでした。");
            return;
        }

        // 取得したエンティティIDを使って共通関連ワードを取得
        let sparqlQuery = generateSparqlQueryForEntities(entityIds);
        let results = await queryWikidata(sparqlQuery);

        if (results.length > 0) {
            let uniqueResults = Array.from(new Set(results.map(binding => binding.commonLabel.value)));

            // <ul> タグを作成してリストを生成
            let resultList = document.createElement("ul");

            // 各キーワードを <li> タグとして追加
            uniqueResults.forEach(label => {
                let listItem = document.createElement("li");
                listItem.textContent = label; // リスト項目にキーワードを設定
                listItem.style.cursor = "pointer";  // ポインタを手のひらに変更
                listItem.addEventListener("click", function () {
                    console.log(`キーワード "${label}" がクリックされました`); // キーワードクリック時に確認
                    handleKeywordClick(label);  // クリックされたキーワードでノード追加
                });
                resultList.appendChild(listItem);
            });

            // 左寄せにするためのスタイルを追加
            resultList.style.textAlign = "left";

            // 結果を表示
            let resultItem = document.createElement("div");
            resultItem.appendChild(resultList);
            resultBox.appendChild(resultItem);
        }
    });
});