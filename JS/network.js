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
const saveXmlBaseUrl = `http://${host}:3005`;

let isRestoringConceptMap = false;
let conceptMapSaveTimer = null;
let conceptMapSaveInFlight = false;
let conceptMapSaveQueued = false;

// 最後に選択された2つのノードを保存
var selectedNodes = []; // 選択されたノードIDを保存

function logAction(message) {
  if (typeof window.addSystemLog === "function") {
    window.addSystemLog(message);
  }
}

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
    var oldLabel = nodeData ? nodeData.label : "";
    var newLabel = prompt("ノードのラベルを変更", nodeData.label);
    if (newLabel !== null && newLabel !== oldLabel) {
      nodeData.label = newLabel;
      nodes.update(nodeData); // ノードデータを更新
      logAction(`キーワードマップ: ノード編集 id=${nodeId} "${oldLabel}" → "${newLabel}"`);
    }
  } else if (event.edges.length > 0) {
    // エッジの編集
    var edgeId = event.edges[0];
    var edgeData = edges.get(edgeId);
    var oldEdgeLabel = edgeData ? edgeData.label : "";
    var newLabel = prompt("エッジのラベルを変更", edgeData.label);
    if (newLabel !== null && newLabel !== oldEdgeLabel) {
      edgeData.label = newLabel;
      edges.update(edgeData); // エッジデータを更新
      logAction(`キーワードマップ: リンク編集 id=${edgeId} "${oldEdgeLabel}" → "${newLabel}"`);
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
  logAction(`キーワードマップ: ノード追加 id=${newNode.id} label="${newNode.label}"`);
});

// マップを中央表示するボタン
document.getElementById("recenterMapBtn").addEventListener("click", function () {
  const allNodes = nodes.get();
  if (!allNodes || allNodes.length === 0) {
    network.moveTo({
      position: { x: 0, y: 0 },
      scale: 1,
      animation: { duration: 300, easingFunction: "easeInOutQuad" }
    });
    logAction("キーワードマップ: 中央表示（ノードなし）");
    return;
  }

  network.fit({
    nodes: allNodes.map((n) => n.id),
    animation: { duration: 400, easingFunction: "easeInOutQuad" }
  });
  logAction("キーワードマップ: 中央表示");
});

// ノード削除ボタン
document.getElementById("deleteNodeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 1) {
    var nodeId = selectedNodes[0];
    var nodeData = nodes.get(nodeId);
    nodes.remove({ id: nodeId }); // 選択されたノードを削除
    selectedNodes = []; // 選択リセット
    if (nodeData) {
      logAction(`キーワードマップ: ノード削除 id=${nodeId} label="${nodeData.label}"`);
    }
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
      logAction(`キーワードマップ: リンク追加 from=${newEdge.from} to=${newEdge.to} label="${newEdge.label}" arrows=${newEdge.arrows || "none"}`);
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
      logAction(`キーワードマップ: リンク削除 from=${fromNode} to=${toNode} count=${edgesToDelete.length}`);
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

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getCurrentTitleText() {
  const titleInput = document.getElementById("myTitle");
  const inputValue = titleInput ? titleInput.value.trim() : "";
  return inputValue || localStorage.getItem("searchTitle") || "";
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
  xml += `<?meta title="${escapeXml(getCurrentTitleText())}"?>\n`;
  xml += "<ConceptMap>\n";

  const nodePositions = network.getPositions(nodes.map((node) => node.id));

  // ノード情報を追加
  xml += "  <Nodes>\n";
  nodes.forEach(function (node) {
    const pos = nodePositions[node.id] || {};
    const x = Number.isFinite(pos.x) ? pos.x : node.x;
    const y = Number.isFinite(pos.y) ? pos.y : node.y;
    xml += `    <Node id="${escapeXml(node.id)}" label="${escapeXml(node.label || "")}" x="${escapeXml(x ?? "")}" y="${escapeXml(y ?? "")}" />\n`;
  });
  xml += "  </Nodes>\n";

  // エッジ情報を追加
  xml += "  <Edges>\n";
  edges.forEach(function (edge) {
    xml += `    <Edge id="${escapeXml(edge.id ?? "")}" from="${escapeXml(edge.from)}" to="${escapeXml(edge.to)}" label="${escapeXml(edge.label || "")}" arrows="${escapeXml(edge.arrows || "")}" />\n`;
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

function parseNodeId(value) {
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

function parseMetaTitle(xmlText) {
  const matched = xmlText.match(/<\?meta\s+title="([\s\S]*?)"\?>/);
  if (!matched) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<x v="${matched[1]}"/>`, "application/xml");
  const el = doc.querySelector("x");
  return el ? (el.getAttribute("v") || "") : "";
}

function loadConceptMapFromXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("XML parse error");
  }

  const restoredTitle = parseMetaTitle(xmlText).trim();
  if (restoredTitle) {
    localStorage.setItem("searchTitle", restoredTitle);
    const titleInput = document.getElementById("myTitle");
    if (titleInput) titleInput.value = restoredTitle;
  }

  const loadedNodes = [];
  const nodeMap = new Set();
  doc.querySelectorAll("Nodes > Node").forEach((el) => {
    const idRaw = el.getAttribute("id");
    const label = el.getAttribute("label") || "";
    const xRaw = el.getAttribute("x");
    const yRaw = el.getAttribute("y");
    if (!idRaw) return;
    const id = parseNodeId(idRaw);
    const x = xRaw === null || xRaw === "" ? null : Number(xRaw);
    const y = yRaw === null || yRaw === "" ? null : Number(yRaw);
    nodeMap.add(String(id));
    const restoredNode = {
      id,
      label,
      color: {
        background: "#FFFFFF",
        border: "#3498DB"
      },
      borderWidth: 2,
      font: {
        color: "#34495E",
        size: 16,
        face: "Arial"
      }
    };
    if (Number.isFinite(x) && Number.isFinite(y)) {
      restoredNode.x = x;
      restoredNode.y = y;
    }
    loadedNodes.push(restoredNode);
  });

  const loadedEdges = [];
  doc.querySelectorAll("Edges > Edge").forEach((el, idx) => {
    const fromRaw = el.getAttribute("from");
    const toRaw = el.getAttribute("to");
    if (!fromRaw || !toRaw) return;
    const from = parseNodeId(fromRaw);
    const to = parseNodeId(toRaw);
    if (!nodeMap.has(String(from)) || !nodeMap.has(String(to))) return;
    loadedEdges.push({
      id: el.getAttribute("id") || `e${idx + 1}`,
      from,
      to,
      label: el.getAttribute("label") || "",
      arrows: el.getAttribute("arrows") || ""
    });
  });

  nodes.clear();
  edges.clear();
  if (loadedNodes.length > 0) nodes.add(loadedNodes);
  if (loadedEdges.length > 0) edges.add(loadedEdges);
  updateCopiedContent([]);
  selectedNodes = [];
}

async function restoreUserConceptMap() {
  const filename = getUserXmlFilename();
  const xmlPath = `JS/XML/${filename}`;

  try {
    const res = await fetch(xmlPath, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 404) return;
      throw new Error(`HTTP ${res.status}`);
    }
    const xmlText = await res.text();
    if (!xmlText || xmlText.trim().length === 0) return;
    isRestoringConceptMap = true;
    loadConceptMapFromXml(xmlText);
    logAction(`キーワードマップ: 復元しました (${filename})`);
  } catch (error) {
    console.error("概念マップの復元に失敗しました:", error);
  } finally {
    isRestoringConceptMap = false;
  }
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

async function flushConceptMapSave() {
  if (isRestoringConceptMap) return;
  if (conceptMapSaveInFlight) {
    conceptMapSaveQueued = true;
    return;
  }

  conceptMapSaveInFlight = true;
  try {
    const allNodes = nodes.get();
    const allEdges = edges.get();
    const xmlContent = generateXML(allNodes, allEdges);
    await sendConceptMapToServer(xmlContent);
  } catch (error) {
    console.error("概念マップの保存に失敗しました:", error);
  } finally {
    conceptMapSaveInFlight = false;
    if (conceptMapSaveQueued) {
      conceptMapSaveQueued = false;
      flushConceptMapSave();
    }
  }
}

function scheduleConceptMapSave() {
  if (isRestoringConceptMap) return;
  if (conceptMapSaveTimer) clearTimeout(conceptMapSaveTimer);
  conceptMapSaveTimer = setTimeout(() => {
    flushConceptMapSave();
  }, 300);
}

// ノードやエッジ更新時はデバウンス保存
nodes.on("*", scheduleConceptMapSave);
edges.on("*", scheduleConceptMapSave);

// ノード移動後にも保存（座標の取りこぼし防止）
network.on("dragEnd", function () {
  scheduleConceptMapSave();
});

document.addEventListener("DOMContentLoaded", () => {
  restoreUserConceptMap();
});

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

