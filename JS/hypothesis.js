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

// 簡易仮説生成関数（テンプレート）
// 例：キーワードA と キーワードB があれば「A が B に影響を与え、〜が起きる可能性がある」といった文を作る
function generateSimpleHypothesis(keywordLabels){
  if (!keywordLabels || keywordLabels.length === 0) return "";
  if (keywordLabels.length === 1) {
    return keywordLabels[0] + " に注目すると、関連する現象や要因が明らかになる可能性がある。";
  }
  // 2つ以上なら主要2つを使って簡易文を作成（拡張可）
  var a = keywordLabels[0];
  var b = keywordLabels[1];
  var rest = keywordLabels.slice(2);
  var restText = rest.length ? " 他に " + rest.join("、") + " などが関係する可能性がある。" : "";
  return a + " と " + b + " の関係から、" + a + " が " + b + " に影響を与え、結果として具体的な変化（例：削減・代替・応用）が生じる可能性がある。" + restText;
}

// 選択されたノードが存在するか確認
selectedNodes.forEach(function (nodeId) {
  console.log("Node exists:", nodes.get(nodeId) !== null);
});

console.log("Edges:", edges.get());

// SCAMPER の選択肢（日本語ラベル）
var SCAMPER_OPTIONS = [
  { key: "Substitute", label: "置換 (Substitute)" },
  { key: "Combine", label: "結合 (Combine)" },
  { key: "Adapt", label: "適応 (Adapt)" },
  { key: "Modify", label: "修正 (Modify)" },
  { key: "PutToOtherUse", label: "転用 (Put to other use)" },
  { key: "Eliminate", label: "削除 (Eliminate)" },
  { key: "Reverse", label: "再構成 (Reverse)" },
];

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
    console.log("SCAMPERメニューを削除します:", existing); // 削除対象を確認
    existing.parentNode.removeChild(existing);
  } else {
    console.log("SCAMPERメニューが見つかりません。");
  }
}

// SCAMPER 選択時の処理：タグ追加 + テンプレートを textarea に追記
function applyScamperToEntry(entry, option) {
  // タグ領域を用意
  var tagWrap = entry.querySelector(".scamper-tags");
  if (!tagWrap) {
    tagWrap = document.createElement("div");
    tagWrap.className = "scamper-tags";
    tagWrap.style.marginTop = "6px";
    entry.insertBefore(tagWrap, entry.querySelector(".hypothesis-box-body").nextSibling);
  }

  // タグを追加
  var tag = document.createElement("div");
  tag.className = "scamper-tag-container";

  var tagLabel = document.createElement("span");
  tagLabel.className = "scamper-tag";
  tagLabel.dataset.key = option.key;
  tagLabel.innerText = option.label;

  // 修正用の仮説入力ボックス
  var editBox = document.createElement("textarea");
  editBox.className = "scamper-edit-box";
  editBox.placeholder = "質問に基づいて発散させた仮説を記入してください";

  // 右クリックで削除確認ダイアログを表示
  tagLabel.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var confirmDelete = confirm(`「${option.label}」タグを削除しますか？`);
    if (confirmDelete) {
      tagWrap.removeChild(tag);
    }
  });

  tag.appendChild(tagLabel);
  tag.appendChild(editBox);
  tagWrap.appendChild(tag);

  // テンプレートを textarea に追加（末尾に一行追記）
  var ta = entry.querySelector("textarea.hypothesis-text");
  if (ta) {
    var template = generateScamperTemplate(option, entry);
    if (template) {
      if (ta.value && ta.value.trim() !== "") ta.value += "\n\n";
      ta.value += "[SCAMPER - " + option.key + "] " + template;
    }
  }

  // メニューを削除（選択後に必ず閉じる）
  removeScamperMenu();
}

// SCAMPER テンプレート生成関数
function generateScamperTemplate(option, entry) {
  switch (option.key) {
    case "Substitute":
      return;
    case "Combine":
      return;
    case "Adapt":
      return;
    case "Modify":
      return;
    case "PutToOtherUse":
      return;
    case "Eliminate":
      return;
    case "Reverse":
      return;
    default:
      return;
  }
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
    console.log("SCAMPERメニューを削除します:", existing); // 削除対象を確認
    existing.parentNode.removeChild(existing);
  } else {
    console.log("SCAMPERメニューが見つかりません。");
  }
}

// 仮説エントリ生成時に右クリックメニューを有効化する
function enableScamperOnEntry(entry) {
  entry.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    createScamperMenu(e.clientX, e.clientY, entry);
  });
}