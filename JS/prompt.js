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
    window.theme = ""; // テーマをグローバル化
    let xmlData = ""; // XMLデータ
    let hypothesisData = ""; // 仮説内容
    let selectedKeywords = ""; // 選んだキーワード
    let selectedScamper = ""; // 選んだSCAMPER

    // テーマの取得
    const titleInput = document.querySelector("#myTitle");
    if (titleInput) {
        // 初期値をセット
        theme = titleInput.value;
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
            // SCAMPERクリック時に毎回最新のタイトル値を取得
            window.theme = document.querySelector("#myTitle")?.value || "";

            // プロンプトを生成
            const prompt = `
                ##タスク
                ・総合的な探究の時間における，学習者の活動を⽀援するシステム
                ##背景・文脈
                ・学習者は[${window.theme}]を目標に探究活動を行っている
                ・今，学習者は[${hypothesisData}]という仮説を[${selectedKeywords}]のキーワードを基に立案した
                ・また学習者が作成した概念マップによって読み取ることの出来，その学習者の理解状態は次のXMLファイルの通りである　[${xmlData}]
                ##入力
                ・この仮説に対して，SCAMPER法に基づく観点から仮説を発散させる
                ・あなたはSCAMPER法の[${selectedScamper}]に基づき，仮説を発散させることを促す質問を与えよ．
                ##条件
                ・[${window.theme}]という課題を解決しうるような仮説を生成することを⽬的とする
                ・仮説を発散させるうえで，概念マップ内の他のキーワードを使うことや，新たな概念を概念マップ内に追加させることで仮説の発散につながる場合はそれを暗に⽰唆した質問を⽣成せよ
                ・必ずしもそうしなくても良い
                ・何を追加するかや何を加えたら良いかなどは明⽰せず，あくまで質問をもとに促すようにせよ
                ##出力形式
                ・ 条件に合う質問を，三つ程度提示せよ
                ・各項目は<li></li>タグで囲め
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
                // APIの結果のみをコンソールで表示
                // APIの結果（liタグのリスト）をパースして選択肢として表示
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = data.result;
                const items = Array.from(tempDiv.querySelectorAll("li"));
                if (items.length === 0) {
                    alert("質問が取得できませんでした。");
                    return;
                }
                console.log(data.result);

                // ポップアップ用ダイアログ生成（画面の左20％、上50％に表示）
                const dialog = document.createElement("div");
                dialog.style.position = "fixed";
                const minWidth = 320;
                let left = Math.floor(window.innerWidth * 0.2);
                let top = Math.floor(window.innerHeight * 0.5);
                // 画面サイズからはみ出さないように調整
                const maxLeft = window.innerWidth - minWidth - 16;
                if (left > maxLeft) left = maxLeft;
                if (top > window.innerHeight - 200) top = window.innerHeight - 200;
                dialog.style.left = left + "px";
                dialog.style.top = top + "px";
                dialog.style.background = "#fff";
                dialog.style.border = "2px solid #333";
                dialog.style.padding = "24px";
                dialog.style.zIndex = 9999;
                dialog.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)";
                dialog.style.minWidth = minWidth + "px";
                dialog.innerHTML = '<div style="font-weight:bold;margin-bottom:12px;">質問を選択してください</div>';
                // ドラッグ用ハンドラ（タイトルバー）を追加
                const dragBar = document.createElement("div");
                dragBar.textContent = "質問を選択してください";
                dragBar.style.fontWeight = "bold";
                dragBar.style.marginBottom = "12px";
                dragBar.style.cursor = "move";
                dragBar.style.userSelect = "none";
                dialog.insertBefore(dragBar, dialog.firstChild);

                // ドラッグ機能実装
                let isDragging = false;
                let dragOffsetX = 0;
                let dragOffsetY = 0;
                dragBar.addEventListener("mousedown", function(e) {
                    isDragging = true;
                    // ダイアログ左上からマウスまでの距離
                    const rect = dialog.getBoundingClientRect();
                    dragOffsetX = e.clientX - rect.left;
                    dragOffsetY = e.clientY - rect.top;
                    document.body.style.userSelect = "none";
                });
                document.addEventListener("mousemove", function(e) {
                    if (!isDragging) return;
                    let left = e.clientX - dragOffsetX;
                    let top = e.clientY - dragOffsetY;
                    // 画面端はみ出し防止
                    const minWidth = 320;
                    const maxLeft = window.innerWidth - minWidth - 16;
                    if (left < 0) left = 0;
                    if (left > maxLeft) left = maxLeft;
                    if (top < 0) top = 0;
                    if (top > window.innerHeight - 100) top = window.innerHeight - 100;
                    dialog.style.left = left + "px";
                    dialog.style.top = top + "px";
                });
                document.addEventListener("mouseup", function() {
                    isDragging = false;
                    document.body.style.userSelect = "";
                });
                // 既存のタイトル行は非表示に
                const oldTitle = dialog.querySelector('div[style*="font-weight:bold"]');
                if (oldTitle && oldTitle !== dragBar) oldTitle.style.display = "none";

                items.forEach((li, idx) => {
                    const btn = document.createElement("button");
                    btn.textContent = li.textContent;
                    btn.style.display = "block";
                    btn.style.margin = "8px 0";
                    btn.style.width = "100%";
                    btn.style.textAlign = "left";
                    btn.onclick = () => {
                        // 既存の表示を消す
                        let old = clickedElement.parentNode.querySelector('.scamper-question-view');
                        if (old) old.remove();
                        // SCAMPERタグの右に質問を表示
                        const span = document.createElement('span');
                        span.className = 'scamper-question-view';
                        span.textContent = li.textContent;
                        span.style.marginLeft = '12px';
                        span.style.background = '#ffffe0';
                        span.style.border = '1px solid #ccc';
                        span.style.padding = '2px 8px';
                        span.style.borderRadius = '6px';
                        span.style.fontSize = '0.95em';
                        clickedElement.insertAdjacentElement('afterend', span);
                        document.body.removeChild(dialog);
                    };
                    dialog.appendChild(btn);
                });

                // 閉じるボタン
                const closeBtn = document.createElement("button");
                closeBtn.textContent = "キャンセル";
                closeBtn.style.marginTop = "16px";
                closeBtn.style.width = "100%";
                closeBtn.onclick = () => {
                    document.body.removeChild(dialog);
                };
                dialog.appendChild(closeBtn);

                document.body.appendChild(dialog);
            })
            .catch(error => {
                alert("API呼び出し中にエラーが発生しました: " + error.message);
            });
        }
    });
});