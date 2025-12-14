// 仮説コンテナを初期化して取得（右ナビ内）
function ensureHypothesisContainer() {
  var container = document.querySelector(".right-navi .hypothesis-area");
  if (!container) {
    var right = document.querySelector(".right-navi") || document.body;
    container = document.createElement("div");
    container.className = "hypothesis-area";
    right.appendChild(container);
  }

  // 初回セットアップ（ヘッダ・エントリラッパー）
  if (!container.querySelector("#hypothesisWrapper")) {
    container.innerHTML = "";

    /*var title = document.createElement("h3");
    title.className = "hypothesis-title";
    title.innerText = "仮説立案";
    container.appendChild(title); */

    // 仮説エントリを入れるラッパー（ここに複数の仮説を追加）
    var wrapper = document.createElement("div");
    wrapper.id = "hypothesisWrapper";
    wrapper.className = "hypothesis-wrapper";
    container.appendChild(wrapper);

    // 補助テキスト
    var help = document.createElement("div");
    help.style.fontSize = "12px";
    help.style.marginTop = "6px";
    help.innerText = "「仮説立案」ボタンを押すとこの中に新しい仮説が追加されます。";
    container.appendChild(help);
  }

  return container;
}

// 仮説エントリを追加する（選択キーワードを基に1エントリ追加）
function addHypothesisEntry(nodeIds) {
  var container = ensureHypothesisContainer();
  var wrapper = container.querySelector("#hypothesisWrapper");

  // 選択キーワードラベル取得（先頭リストは表示しない）
  var keywordLabels = nodeIds.map(function (id) {
    var n = nodes.get(id);
    return n ? n.label : "(未定義)";
  });

  // エントリ作成
  var entry = document.createElement("div");
  entry.className = "hypothesis-box";

  var hdr = document.createElement("div");
  hdr.className = "hypothesis-box-header";
  hdr.innerText = "仮説 #" + (wrapper.children.length + 1);
  entry.appendChild(hdr);

  var sub = document.createElement("div");
  sub.style.fontSize = "12px";
  sub.style.color = "#333";
  sub.style.marginBottom = "6px";
  // 各エントリの下にのみ基づくキーワードを表示（先頭の一覧は削除）
  sub.innerText = "基づくキーワード: " + keywordLabels.join("、");
  entry.appendChild(sub);

  var body = document.createElement("div");
  body.className = "hypothesis-box-body";
  var ta = document.createElement("textarea");
  ta.className = "hypothesis-text";
  ta.placeholder = "ここに仮説を入力";
  ta.value = ""; // 初期は空白
  body.appendChild(ta);
  entry.appendChild(body);

  // 操作ボタン（削除）
  var controls = document.createElement("div");
  controls.style.marginTop = "6px";
  var delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.innerText = "削除";
  delBtn.addEventListener("click", function () {
    wrapper.removeChild(entry);
    updateHypothesisNumbers(wrapper);
  });
  controls.appendChild(delBtn);
  entry.appendChild(controls);

  wrapper.appendChild(entry);
  enableScamperOnEntry(entry);
  entry.scrollIntoView({ behavior: "smooth" });

  // ここを追加：
  enableScamperOnEntry(entry);
}

// 表示されている仮説の番号を更新
function updateHypothesisNumbers(wrapper) {
  for (var i = 0; i < wrapper.children.length; i++) {
    var h = wrapper.children[i].querySelector(".hypothesis-box-header");
    if (h) h.innerText = "仮説 #" + (i + 1);
  }
}

// DOM が読み込まれたら仮説コンテナを初期化し，ボタンにリスナを登録する
document.addEventListener("DOMContentLoaded", function () {
  ensureHypothesisContainer();

  var createBtnDom = document.getElementById("createHypothesisBtn");
  if (createBtnDom) {
    createBtnDom.addEventListener("click", function () {
      if (!selectedNodes || selectedNodes.length === 0) {
        alert("少なくとも1つのノードを選択してください。");
        return;
      }
      addHypothesisEntry(selectedNodes);
    });
  }
});

// 選択されたノードが存在するか確認
selectedNodes.forEach(function (nodeId) {
  console.log("Node exists:", nodes.get(nodeId) !== null);
});

console.log("Edges:", edges.get());

// SCAMPER の選択肢（日本語ラベル）
var SCAMPER_OPTIONS = [
  { key: "AddNode", label: "ノードを追加", style: "background-color: lightpink; font-weight: bold;" }, // 一番上に配置し、スタイルを追加
  { key: "Substitute", label: "置換 (Substitute)" },
  { key: "Combine", label: "結合 (Combine)" },
  { key: "Adapt", label: "適応 (Adapt)" },
  { key: "Modify", label: "修正 (Modify)" },
  { key: "PutToOtherUse", label: "転用 (Put to other use)" },
  { key: "Eliminate", label: "削除 (Eliminate)" },
  { key: "Reverse", label: "再構成 (Reverse)" }
];

// 「ノードを追加」選択時の処理
function addNodeToNetwork(entry) {
  // 仮説に関連するノードを取得
  const subText = entry.querySelector(".hypothesis-box-body textarea").value;
  const relatedNodes = subText.match(/[\wぁ-んァ-ン一-龥]+/g) || []; // 仮説内のキーワードを抽出

  // extraNetworkエリアを取得
  const networkArea = document.querySelector(".extra-content #extraNetwork");
  if (!networkArea) {
    console.error("extraNetworkエリアが見つかりません。");
    return;
  }

  // vis.js のノードデータセットを取得
  const nodesExtra = networkArea.visNetworkNodes; // vis.js のノードデータセット
  if (!nodesExtra) {
    console.error("extraNetworkのノードデータセットが初期化されていません。");
    return;
  }

  // ノードを追加
  relatedNodes.forEach((node) => {
    if (window.nodesExtra && !window.nodesExtra.get(node)) {
      window.nodesExtra.add({
        id: node,
        label: node,
      });
    }
  });

  console.log("現在のノード一覧:", nodesExtra.get());
}  

// SCAMPER テンプレート生成関数
function generateScamperTemplate(option) {
  switch (option.key) {
    case "Substitute":
      return "何かを別のもので置き換えることで新しい解決策が得られるか検討する。";
    case "Combine":
      return "他の要素と結合して性能や価値を高められないか検討する。";
    case "Adapt":
      return "他分野のアイデアを適用できないか検討する。";
    case "Modify":
      return "形状・大きさ・性質を変更して改善できないか検討する。";
    case "PutToOtherUse":
      return "別用途に転用することで新たな価値が生まれないか検討する。";
    case "Eliminate":
      return "不要な要素を削除して簡素化やコスト削減が図れないか検討する。";
    case "Reverse":
      return "順序や役割を入れ替えることで新しい発想が生まれないか検討する。";
    default:
      return "";
  }
}

// 右クリックメニュー作成（仮説入力ブロックのすぐ下に表示）
function createScamperMenu(x, y, entry) {
  removeScamperMenu();

  // 仮説入力ブロック（bodyEl）の位置を取得して、document.body にメニューを追加する
  var bodyEl = entry.querySelector(".hypothesis-box-body") || entry;
  var rect = bodyEl.getBoundingClientRect();

  // メニューを作成
  var menu = document.createElement("div");
  menu.id = "scamperMenu";
  menu.className = "scamper-menu-inline";

  // 表示位置：仮説入力ブロックの直下（スクロール位置を考慮）
  var left = window.scrollX + rect.left + 6;
  var top  = window.scrollY + rect.bottom + 6;

  menu.style.position = "absolute";
  menu.style.left = left + "px";
  menu.style.top  = top + "px";

  // 先頭に縦向きの S:C:A... の表示にする（画像に近い見た目）
  var letterMap = {
    Substitute: "S",
    Combine: "C",
    Adapt: "A",
    Modify: "M",
    PutToOtherUse: "P",
    Eliminate: "E",
    Reverse: "R",
  };

  SCAMPER_OPTIONS.forEach(function (opt) {
    var item = document.createElement("div");
    item.className = "scamper-option";
    var letter = letterMap[opt.key] || "?";
    item.innerHTML = "<span class='scamper-letter'>" + letter + "</span><span class='scamper-label'>" + opt.label + "</span>";
    item.dataset.key = opt.key;
    item.addEventListener("click", function (ev) {
      ev.stopPropagation();
      applyScamperToEntry(entry, opt);
      removeScamperMenu();
    });
    menu.appendChild(item);
  });

  // document.body に追加（親コンテナの overflow による切り取りを回避）
  document.body.appendChild(menu);

  // 外部クリックで閉じる（次回のみ）
  setTimeout(function () {
    document.addEventListener("click", removeScamperMenuOnce);
  }, 0);
}

function removeScamperMenuOnce() {
  removeScamperMenu();
  document.removeEventListener("click", removeScamperMenuOnce);
}
function removeScamperMenu() {
  var existing = document.getElementById("scamperMenu");
  if (existing) {
    //console.log("SCAMPERメニューを削除します:", existing); // 削除対象を確認
    existing.parentNode.removeChild(existing);
  } else {
    //console.log("SCAMPERメニューが見つかりません。");
  }
}

// SCAMPER 選択時の処理：タグ追加 + テキストボックスを生成
function applyScamperToEntry(entry, option, parentContainer = null) {
  // タグ領域を用意
  var tagWrap = parentContainer || entry.querySelector(".scamper-tags");
  if (!tagWrap) {
    tagWrap = document.createElement("div");
    tagWrap.className = "scamper-tags";
    tagWrap.style.marginTop = "6px";
    entry.insertBefore(tagWrap, entry.querySelector(".hypothesis-box-body").nextSibling);
  }

  // タグとテキストボックスをコンテナに追加
  var tagContainer = document.createElement("div");
  tagContainer.className = "scamper-tag-container";
  tagContainer.style.marginLeft = parentContainer ? "20px" : "0px"; // インデントを追加

  var tagLabel = document.createElement("span");
  tagLabel.className = "scamper-tag";
  tagLabel.dataset.key = option.key;
  tagLabel.innerText = option.label;

  var editBox = document.createElement("textarea");
  editBox.className = "scamper-edit-box";
  editBox.placeholder = "発散させた仮説を記入してください";

  // 修正後の仮説入力ボックスに右クリックでSCAMPERメニューを表示
  editBox.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    createScamperMenu(e.clientX, e.clientY, entry, editBox, tagContainer);
  });

  // 右クリックで削除確認ダイアログを表示
  tagLabel.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var confirmDelete = confirm(`「${option.label}」タグを削除しますか？`);
    if (confirmDelete) {
      tagWrap.removeChild(tagContainer);
    }
  });

  tagContainer.appendChild(tagLabel);
  tagContainer.appendChild(editBox);
  tagWrap.appendChild(tagContainer);

  // メニューを削除（選択後に必ず閉じる）
  removeScamperMenu();
}

// SCAMPERメニュー作成（修正済み）
function createScamperMenu(x, y, entry, targetBox, parentContainer = null) {
  removeScamperMenu();

  var rect = targetBox.getBoundingClientRect();

  // メニューを作成
  var menu = document.createElement("div");
  menu.id = "scamperMenu";
  menu.className = "scamper-menu-inline";

  // 表示位置：対象ボックスの直下（スクロール位置を考慮）
  var left = window.scrollX + rect.left + 6;
  var top = window.scrollY + rect.bottom + 6;

  menu.style.position = "absolute";
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  SCAMPER_OPTIONS.forEach(function (opt) {
    var item = document.createElement("div");
    item.className = "scamper-option";
    item.innerText = opt.label;
    item.dataset.key = opt.key;

    // スタイルを適用（ノードを追加の選択肢を目立たせる）
    if (opt.style) {
      item.style = opt.style;
    }

    item.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (opt.key === "AddNode") {
        addNodeToNetwork(entry); // 「ノードを追加」選択時の処理
      } else {
        applyScamperToEntry(entry, opt, parentContainer);
      }
      removeScamperMenu();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  // 外部クリックで閉じる（次回のみ）
  setTimeout(function () {
    document.addEventListener("click", removeScamperMenuOnce);
  }, 0);
}

// 外部クリックでメニューを閉じる
function removeScamperMenuOnce() {
  removeScamperMenu();
  document.removeEventListener("click", removeScamperMenuOnce);
}

// メニューを削除する関数
function removeScamperMenu() {
  var existing = document.getElementById("scamperMenu");
  if (existing) {
    //console.log("SCAMPERメニューを削除します:", existing); // 削除対象を確認
    existing.parentNode.removeChild(existing);
  } else {
    //console.log("SCAMPERメニューが見つかりません。");
  }
}

// 仮説エントリ生成時に右クリックメニューを有効化する
function enableScamperOnEntry(entry) {
  var hypothesisBox = entry.querySelector("textarea.hypothesis-text");
  if (hypothesisBox) {
    hypothesisBox.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      createScamperMenu(e.clientX, e.clientY, entry, hypothesisBox);
    });
  }
}

// キーワードクリック時にノード追加
function handleKeywordClick(keyword) {
    console.log(`クリックされたキーワード: ${keyword}`);

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
        console.log(`キーワード "${keyword}" のノードは既に存在しています。`);
    }
}

// 例：キーワードリストの各要素にイベントを設定
document.querySelectorAll('.keyword').forEach(function(elem) {
  elem.addEventListener('click', function() {
    handleKeywordClick(elem.textContent.trim());
  });
});

// ================= prompt.js の内容を統合 =================

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