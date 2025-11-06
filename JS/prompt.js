// HTMLの入力フィールドからタイトルを取得してコンソールに出力する
document.addEventListener("DOMContentLoaded", () => {
    const titleInput = document.querySelector("#myTitle"); // タイトル入力用のinput要素を取得

    if (titleInput) {
        // 入力フィールドの変更を監視
        titleInput.addEventListener("input", (event) => {
            console.log("入力されたタイトル:", event.target.value); // 入力されたタイトルをコンソールに出力
        });
    } else {
        console.log("タイトル入力フィールドが見つかりませんでした。");
    }

    // XMLファイルを定期的に取得してコンソールに表示
    const fetchXML = () => {
        const xmlFilePath = "JS/XML/concept_map.xml"; // XMLファイルのパスを指定
        fetch(xmlFilePath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTPエラー: ${response.status}`);
                }
                return response.text();
            })
            .then(xmlText => {
                console.log("取得したXMLデータ:", xmlText); // XMLデータをコンソールに出力
            })
            .catch(error => {
                console.error("XMLファイルの取得中にエラーが発生しました:", error);
            });
    };

    // 10秒ごとにXMLファイルを取得
    setInterval(fetchXML, 10000);
});

// 仮説のテキストボックスが右クリックされたときに基づいているキーワードと内容を取得してコンソールに表示
document.addEventListener("DOMContentLoaded", () => {
    document.body.addEventListener("contextmenu", (event) => {
        const clickedElement = event.target;

        // 仮説の情報を取得
        if (clickedElement.classList.contains("hypothesis-text")) {
            const hypothesisBox = clickedElement.closest(".hypothesis-box"); // 仮説エントリ全体を取得
            const keywordElement = hypothesisBox.querySelector("div:nth-child(2)"); // キーワードが記載された要素を取得
            const hypothesisText = clickedElement.value; // 仮説内容を取得

            if (keywordElement && hypothesisText) {
                console.log("仮説で使用されたキーワード:", keywordElement.innerText);
                console.log("仮説内容:", hypothesisText);
            } else {
                console.log("仮説のキーワードまたは内容が見つかりませんでした。");
            }
        }
    });
});

// SCAMPERタグをクリックした際にその情報をコンソールに出力
document.addEventListener("DOMContentLoaded", () => {
    document.body.addEventListener("click", (event) => {
        const clickedElement = event.target;

        // SCAMPERタグがクリックされた場合
        if (clickedElement.classList.contains("scamper-tag")) {
            const scamperKey = clickedElement.dataset.key; // SCAMPERのキーを取得
            const scamperLabel = clickedElement.innerText; // SCAMPERのラベルを取得

            console.log("クリックされたSCAMPERタグ:");
            console.log("キー:", scamperKey);
            console.log("ラベル:", scamperLabel);
        }
    });
});

// 取得したデータをまとめてコンソールに出力し、印刷
document.addEventListener("DOMContentLoaded", () => {
    let theme = ""; // テーマ
    let xmlData = ""; // XMLデータ
    let hypothesisData = ""; // 仮説内容
    let selectedKeywords = ""; // 選んだキーワード
    let selectedScamper = ""; // 選んだSCAMPER

    // テーマの取得
    const titleInput = document.querySelector("#myTitle");
    if (titleInput) {
        titleInput.addEventListener("input", (event) => {
            theme = event.target.value;
        });
    }

    // XMLデータの取得
    const fetchXML = () => {
        const xmlFilePath = "JS/XML/concept_map.xml";
        fetch(xmlFilePath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTPエラー: ${response.status}`);
                }
                return response.text();
            })
            .then(xmlText => {
                xmlData = xmlText;
            })
            .catch(error => {
                console.error("XMLファイルの取得中にエラーが発生しました:", error);
            });
    };
    setInterval(fetchXML, 10000); // 10秒ごとに更新

    // 仮説の情報を取得
    document.body.addEventListener("contextmenu", (event) => {
        const clickedElement = event.target;
        if (clickedElement.classList.contains("hypothesis-text")) {
            const hypothesisBox = clickedElement.closest(".hypothesis-box");
            const keywordElement = hypothesisBox.querySelector("div:nth-child(2)");
            hypothesisData = clickedElement.value;
            selectedKeywords = keywordElement ? keywordElement.innerText : "(キーワードなし)";
        }
    });

    // SCAMPERタグの情報を取得してアラートで表示
    document.body.addEventListener("click", (event) => {
        const clickedElement = event.target;
        if (clickedElement.classList.contains("scamper-tag")) {
            selectedScamper = clickedElement.innerText;

            // データをまとめてアラートで表示
            const summary = `
                テーマ: ${theme}
                XMLデータ: ${xmlData}
                仮説内容: ${hypothesisData}
                選んだキーワード: ${selectedKeywords}
                選んだSCAMPER: ${selectedScamper}
            `;
            alert(summary);
        }
    });
});