// プロンプトを生成
            const prompt = `
                ##タスク
                ・総合的な探究の時間における，学習者の活動を⽀援するシステム
                ##背景・文脈
                ・学習者は[${window.theme}]を目標に探究活動を行っている
                ##入力
                ・この仮説に対して，関連のありそうなキーワードを提示する
                ・あなたはoutputから得たキーワードそれぞれについて，背景，課題．影響，対策，要因，評価，持続可能性，技術，経済，国際比較，行動，環境負荷　の観点から関係のありそうなキーワードを提示してください．
                ・つまり，例えば，｛output｝の｛背景｝に関連のありそうなキーワードを10個以内で提示してください．
                ##条件
                ・提示するキーワードは必ずしも10個に満たなくても良い
                ・提示するキーワードは必ずWikidataに項目が存在するものにしてください．かならず存在するか確認してください．
                ##出力形式
                ・ 条件に合うキーワードを，リスト形式で提示せよ
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