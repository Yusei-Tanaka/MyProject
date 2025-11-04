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
  entry.scrollIntoView({ behavior: "smooth" });
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
