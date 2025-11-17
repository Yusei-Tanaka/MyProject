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
                //console.log("取得したXMLデータ:", xmlText); // XMLデータをコンソールに出力
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
                alert("XMLファイルの取得中にエラーが発生しました: " + error.message);
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

    // SCAMPERタグの情報を取得してプロンプトを生成し、APIに送信
    document.body.addEventListener("click", (event) => {
        const clickedElement = event.target;
        if (clickedElement.classList.contains("scamper-tag")) {
            selectedScamper = clickedElement.innerText;

            // プロンプトを生成
            const prompt = `
                ##タスク
                ・総合的な探究の時間における，学習者の活動を⽀援するシステム
                ##背景・文脈
                ・学習者は[${theme}]を目標に探究活動を行っている
                ・今，学習者は[${hypothesisData}]という仮説を[${selectedKeywords}]のキーワードを基に立案した
                ・また学習者が作成した概念マップによって読み取ることの出来，その学習者の理解状態は次のXMLファイルの通りである　[${xmlData}]
                ##入力
                ・この仮説に対して，SCAMPER法に基づく観点から仮説を発散させる
                ・あなたはSCAMPER法の[${selectedScamper}]に基づき，仮説を発散させることを促す質問を与えよ．
                ##条件
                ・仮説を発散させるうえで，概念マップ内の他のキーワードを使うことや，新たな概念を概念マップ内に追加させることで仮説の発散につながる場合はそれを暗に⽰唆した質問を⽣成せよ
                ・必ずしもそうしなくても良い
                ・何を追加するかや何を加えたら良いかなどは明⽰せず，あくまで質問をもとに促すようにせよ
                ##出力形式
                ・ 条件に合う質問を，三つ程度，リスト形式で提示せよ
                ・リストのみでよい．その他の記述や説明は一切いらない
            `;

            // プロンプトをコンソールに表示
            console.log("生成されたプロンプト:", prompt);

            // APIにプロンプトを送信
            fetch("http://127.0.0.1:8000/api", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt: prompt })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTPエラー: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // APIの結果のみをアラートで表示
                console.log(data.result);
            })
            .catch(error => {
                alert("API呼び出し中にエラーが発生しました: " + error.message);
            });
        }
    });
});