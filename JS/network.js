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
  nodes: {
    borderWidth: 2,
    color: {
      background: "#FFFFFF",
      border: "#3498DB",
      highlight: {
        background: "#E67E22",
        border: "#E67E22"
      },
      hover: {
        background: "#EBF5FB",
        border: "#3498DB"
      }
    },
    font: {
      color: "#34495E",
      size: 16,
      face: "Arial"
    }
  },
  edges: {
    smooth: false, // エッジを直線にする
    arrows: "to", //矢印を追加
    color: {
      color: "#95A5A6",
      highlight: "#95A5A6",
      hover: "#3498DB"
    },
    width: 2
  },
};

// ネットワークの作成
var container = document.getElementById("mynetwork");
var data = {
  nodes: nodes,
  edges: edges,
};
var network = new vis.Network(container, data, options);

const host = window.location.hostname;
const apiBaseUrl = `http://${host}:8000`;
const saveXmlBaseUrl = `http://${host}:3000`;

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

function applyDefaultNodeStyle(nodeId) {
  nodes.update({
    id: nodeId,
    color: {
      background: "#FFFFFF",
      border: "#3498DB"
    },
    borderWidth: 2,
    font: {
      color: "#34495E"
    }
  });
}

// ノードをハイライトする関数
function highlightNodes(nodeIds) {
  // すべてのノードをデフォルトスタイルに戻す
  nodes.forEach(function (node) {
    applyDefaultNodeStyle(node.id);
  });

  // 選択されたノードをハイライト
  nodeIds.forEach(function (id) {
    nodes.update({
      id: id,
      color: {
        background: "#E67E22",
        border: "#E67E22"
      },
      borderWidth: 2,
      font: {
        color: "#FFFFFF"
      }
    });
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
  // ネットワークの中心座標を取得
  var center = network.getViewPosition();
  var newNode = {
    id: nodes.length + 1, // IDを自動生成
    label: "New Node",
    x: center.x,
    y: center.y,
    color: {
      background: "#FFFFFF",
      border: "#3498DB"
    },
    borderWidth: 2,
    font: {
      color: "#34495E"
    }
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
    var newEdge = {
      from: selectedNodes[0],
      to: selectedNodes[1],
      label: "New Edge",
      arrows: arrowEnabled ? "to" : "" // 矢印の有無をチェックボックスで決定
    };
    try {
      edges.add(newEdge); // エッジを追加
      //alert("エッジを追加しました。");
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
      //alert("エッジを削除しました。");
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

// ノードとエッジのデータをXML形式に変換する関数
function generateXML(nodes, edges) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += "<ConceptMap>\n";

  // ノード情報を追加
  xml += "  <Nodes>\n";
  nodes.forEach(function (node) {
    xml += `    <Node id="${node.id}" label="${node.label}" />\n`;
  });
  xml += "  </Nodes>\n";

  // エッジ情報を追加
  xml += "  <Edges>\n";
  edges.forEach(function (edge) {
    xml += `    <Edge from="${edge.from}" to="${edge.to}" label="${edge.label || ""}" />\n`;
  });
  xml += "  </Edges>\n";

  xml += "</ConceptMap>";
  return xml;
}

// XMLファイルを保存する関数
function saveXMLFile(content, filename) {
  const blob = new Blob([content], { type: "application/xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function getUserXmlFilename() {
  const storedName = localStorage.getItem("userName");
  const trimmed = storedName ? storedName.trim() : "";
  return `${trimmed || "user_map"}.xml`;
}

async function sendConceptMapToServer(content) {
  const payload = {
    filename: getUserXmlFilename(),
    content,
  };
  const response = await fetch(`${saveXmlBaseUrl}/save-xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// ネットワークが更新されるたびにXMLを出力
function exportConceptMap() {
  const allNodes = nodes.get(); // すべてのノードを取得
  const allEdges = edges.get(); // すべてのエッジを取得
  const xmlContent = generateXML(allNodes, allEdges);
  sendConceptMapToServer(xmlContent).catch((error) => {
    console.error("概念マップの保存に失敗しました:", error);
  });
}

// ノードやエッジが追加・削除されたときにXMLを出力
nodes.on("*", exportConceptMap);
edges.on("*", exportConceptMap);

// ここにAPI呼び出しのコードを追加
async function callApi(payload) {
  const response = await fetch(`${apiBaseUrl}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // ...
}

// APIを呼び出すボタン
document.getElementById("callApiBtn").addEventListener("click", function () {
  callApi();
});

