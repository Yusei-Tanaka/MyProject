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
    if (!nodesExtra.get(node)) {
      // ノードが存在しない場合のみ追加
      nodesExtra.add({
        id: node,
        label: node,
      });
      console.log(`ノードが追加されました: ${node}`);
    } else {
      console.log(`ノードは既に存在します: ${node}`);
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