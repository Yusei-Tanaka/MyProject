// 空のノードとエッジを初期化
var nodes = new vis.DataSet(); // 初期状態ではノードは空
var edges = new vis.DataSet(); // 初期状態ではエッジも空

// ネットワークのオプション
var options = {
  manipulation: {
    enabled: false, // デフォルトで編集機能は無効
  },
  physics: {
    enabled: false, // ノードの物理エンジンを無効にして動かないようにする
  },
  edges: {
    smooth: false, // エッジを直線にする
    arrows: "to", //矢印を追加
  },
};

// ネットワークの作成
var container = document.getElementById("mynetwork");
var data = {
  nodes: nodes,
  edges: edges,
};
var network = new vis.Network(container, data, options);

// 最後に選択された2つのノードを保存
var selectedNodes = []; // 選択されたノードIDを保存

// ノードの選択イベント
network.on("selectNode", function (event) {
  if (event.nodes.length > 0) {
    // Shiftキーが押されている場合は選択を追加
    if (event.event.srcEvent.shiftKey) {
      selectedNodes = [...new Set([...selectedNodes, ...event.nodes])]; // 重複を防ぐ
    } else {
      // Shiftキーが押されていない場合は選択をリセット
      selectedNodes = event.nodes;
    }
  }

  // ノードの情報を表示
  updateCopiedContent(selectedNodes);

  // 選択されたノードをハイライト
  highlightNodes(selectedNodes);

  console.log("Selected Nodes:", selectedNodes);
});

// ノードの選択解除イベント
network.on("deselectNode", function (event) {
  if (event.previousSelection.nodes.length > 0) {
    // 選択解除されたノードをリストから削除
    selectedNodes = selectedNodes.filter(function (id) {
      return !event.previousSelection.nodes.includes(id);
    });
  }

  // 表示内容を更新
  updateCopiedContent(selectedNodes);

  // 選択されたノードをハイライト
  highlightNodes(selectedNodes);
});

// ノードをハイライトする関数
function highlightNodes(nodeIds) {
  // すべてのノードをデフォルトスタイルに戻す
  nodes.forEach(function (node) {
    nodes.update({ id: node.id, color: { background: "#97C2FC" } }); // デフォルトの色
  });

  // 選択されたノードをハイライト
  nodeIds.forEach(function (id) {
    nodes.update({ id: id, color: { background: "#FF5733" } }); // ハイライト色
  });
}

// ノードまたはエッジをダブルクリックで編集
network.on("doubleClick", function (event) {
  if (event.nodes.length > 0) {
    // ノードの編集
    var nodeId = event.nodes[0];
    var nodeData = nodes.get(nodeId);
    var newLabel = prompt("ノードのラベルを変更", nodeData.label);
    if (newLabel !== null) {
      nodeData.label = newLabel;
      nodes.update(nodeData); // ノードデータを更新
    }
  } else if (event.edges.length > 0) {
    // エッジの編集
    var edgeId = event.edges[0];
    var edgeData = edges.get(edgeId);
    var newLabel = prompt("エッジのラベルを変更", edgeData.label);
    if (newLabel !== null) {
      edgeData.label = newLabel;
      edges.update(edgeData); // エッジデータを更新
    }
  }
});

// ノード追加ボタン
document.getElementById("addNodeBtn").addEventListener("click", function () {
  var newNode = {
    id: nodes.length + 1, // IDを自動生成
    label: "New Node",
  };
  nodes.add(newNode); // 新しいノードを追加
});

// ノード削除ボタン
document.getElementById("deleteNodeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 1) {
    var nodeId = selectedNodes[0];
    nodes.remove({ id: nodeId }); // 選択されたノードを削除
    selectedNodes = []; // 選択リセット
  } else {
    alert("削除するノードを選択してください。");
  }
});

// エッジ追加ボタン
document.getElementById("addEdgeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 2) {
    var arrowEnabled = document.getElementById("arrowToggle").checked; // チェックボックスの状態を取得

    // 選択された2つのノード間にエッジを追加
    var newEdge = {
      from: selectedNodes[0],
      to: selectedNodes[1],
      label: "New Edge",
      arrows: arrowEnabled ? "to" : "", // 矢印の有無をチェックボックスで決定
    };

    try {
      edges.add(newEdge); // エッジを追加
      alert("エッジを追加しました。");
    } catch (error) {
      console.error("エッジの追加に失敗しました:", error);
    }
  } else {
    alert("2つのノードを選択してください。");
  }
});

// エッジ削除ボタン
document.getElementById("deleteEdgeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 2) {
    var fromNode = selectedNodes[0];
    var toNode = selectedNodes[1];

    // 選択された2つのノード間のエッジを取得
    var edgesToDelete = edges.get({
      filter: function (edge) {
        return (
          (edge.from === fromNode && edge.to === toNode) ||
          (edge.from === toNode && edge.to === fromNode)
        );
      },
    });

    // エッジを削除
    if (edgesToDelete.length > 0) {
      edgesToDelete.forEach(function (edge) {
        edges.remove(edge.id);
      });
      alert("エッジを削除しました。");
    } else {
      alert("選択されたノード間にエッジが存在しません。");
    }
  } else {
    alert("2つのノードを選択してください。");
  }
});

// ノードタイトルを表示する関数（複数ノード対応）
function updateCopiedContent(nodeIds) {
  var selectedContent = nodeIds
    .map(function (id) {
      var node = nodes.get(id);
      return node ? node.label : "";
    })
    .join(", "); // 複数ノードのラベルをカンマ区切りで表示

  // タイトル表示エリアに設定
  var copiedContentElement = document.getElementById("copiedContent");
  copiedContentElement.innerText = selectedContent;
}

// ネットワークのクリックイベント
network.on("click", function (event) {
  if (event.nodes.length === 0 && event.edges.length === 0) {
    // ノードやエッジが選択されていない場合
    selectedNodes = []; // 選択リセット
    highlightNodes(selectedNodes); // ハイライトを解除
    updateCopiedContent(selectedNodes); // 表示内容をリセット
  }
});

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
