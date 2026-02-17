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

function handleNetworkResize() {
  if (!network || !container) return;
  try {
    network.redraw();
    network.fit({
      animation: false,
    });
  } catch (error) {
    console.warn("network resize failed:", error);
  }
}

window.addEventListener("app-layout-resized", () => {
  setTimeout(handleNetworkResize, 0);
});

const host = window.location.hostname;
const apiBaseUrl = `http://${host}:8000`;
const themeApiBaseUrl = `http://${host}:3000`;
const saveXmlBaseUrl = `http://${host}:3005`;

let isRestoringConceptMap = false;
let conceptMapSaveTimer = null;
let conceptMapSaveInFlight = false;
let conceptMapSaveQueued = false;
let lastSavedConceptMapFingerprint = "";
const MAX_FILE_PART_LENGTH = 24;

// 最後に選択された2つのノードを保存
var selectedNodes = []; // 選択されたノードIDを保存
window.selectedNodes = selectedNodes;

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
    window.selectedNodes = selectedNodes;
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
    window.selectedNodes = selectedNodes;
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
    window.selectedNodes = selectedNodes;
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
function updateCopiedContent(_nodeIds) {
  var copiedContentElement = document.getElementById("copiedContent");
  if (!copiedContentElement) return;
  copiedContentElement.innerText = "";
  copiedContentElement.style.display = "none";
}

function getCurrentTitleText() {
  const titleInput = document.getElementById("myTitle");
  const inputValue = titleInput ? titleInput.value.trim() : "";
  return inputValue || localStorage.getItem("searchTitle") || "";
}

function getCurrentUserId() {
  return (localStorage.getItem("userName") || "").trim();
}

function getCurrentThemeName() {
  return getCurrentTitleText().trim();
}

function sanitizeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hashString8(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function toShortFilePart(value, fallback) {
  const normalized = sanitizeFilePart(value) || fallback;
  if (normalized.length <= MAX_FILE_PART_LENGTH) {
    return normalized;
  }
  const headLength = MAX_FILE_PART_LENGTH - 9;
  const head = normalized.slice(0, headLength);
  return `${head}_${hashString8(normalized)}`;
}

function getThemeScopedXmlFilename() {
  const userId = toShortFilePart(getCurrentUserId(), "user");
  const themeName = toShortFilePart(getCurrentThemeName(), "theme");
  return `${userId}__${themeName}.xml`;
}

// ネットワークのクリックイベント
network.on("click", function (event) {
  if (event.nodes.length === 0 && event.edges.length === 0) {
    // ノードやエッジが選択されていない場合
    selectedNodes = []; // 選択リセット
    window.selectedNodes = selectedNodes;
    highlightNodes(selectedNodes); // ハイライトを解除
    updateCopiedContent(selectedNodes); // 表示内容をリセット
  }
});

function parseNodeId(value) {
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

function buildConceptMapPayload() {
  const currentNodes = nodes.get();
  const currentEdges = edges.get();
  const nodePositions = network.getPositions(currentNodes.map((node) => node.id));

  const keywordNodes = currentNodes.map((node) => {
    const pos = nodePositions[node.id] || {};
    return {
      id: node.id,
      label: node.label || "",
      nodeType: node.nodeType || "keyword",
      x: Number.isFinite(pos.x) ? pos.x : node.x,
      y: Number.isFinite(pos.y) ? pos.y : node.y,
    };
  });

  return {
    title: getCurrentThemeName(),
    keywordNodes,
    nodes: keywordNodes,
    edges: currentEdges.map((edge) => ({
      id: edge.id ?? "",
      from: edge.from,
      to: edge.to,
      label: edge.label || "",
      arrows: edge.arrows || "",
    })),
  };
}

function buildConceptMapFingerprint(payload) {
  return JSON.stringify(payload || buildConceptMapPayload());
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function convertConceptMapPayloadToXml(payload) {
  const title = payload?.title || "";
  const nodesArray = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const edgesArray = Array.isArray(payload?.edges) ? payload.edges : [];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<?meta title="${escapeXml(title)}"?>\n`;
  xml += "<ConceptMap>\n";
  xml += "  <Nodes>\n";
  nodesArray.forEach((node) => {
    xml += `    <Node id="${escapeXml(node.id)}" label="${escapeXml(node.label || "")}" x="${escapeXml(node.x ?? "")}" y="${escapeXml(node.y ?? "")}" />\n`;
  });
  xml += "  </Nodes>\n";
  xml += "  <Edges>\n";
  edgesArray.forEach((edge) => {
    xml += `    <Edge id="${escapeXml(edge.id ?? "")}" from="${escapeXml(edge.from)}" to="${escapeXml(edge.to)}" label="${escapeXml(edge.label || "")}" arrows="${escapeXml(edge.arrows || "")}" />\n`;
  });
  xml += "  </Edges>\n";
  xml += "</ConceptMap>";
  return xml;
}

function applyConceptMapPayload(payload) {
  const loadedNodes = [];
  const nodeMap = new Set();
  const payloadNodes = Array.isArray(payload?.keywordNodes)
    ? payload.keywordNodes
    : Array.isArray(payload?.nodes)
      ? payload.nodes
      : [];
  payloadNodes.forEach((node) => {
    const id = parseNodeId(node.id);
    if (id === null || id === undefined || id === "") return;
    nodeMap.add(String(id));

    const restoredNode = {
      id,
      label: String(node.label || ""),
      nodeType: String(node.nodeType || "keyword"),
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
    if (Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y))) {
      restoredNode.x = Number(node.x);
      restoredNode.y = Number(node.y);
    }
    loadedNodes.push(restoredNode);
  });

  const loadedEdges = [];
  const payloadEdges = Array.isArray(payload?.edges) ? payload.edges : [];
  payloadEdges.forEach((edge, idx) => {
    const from = parseNodeId(edge.from);
    const to = parseNodeId(edge.to);
    if (!nodeMap.has(String(from)) || !nodeMap.has(String(to))) return;
    loadedEdges.push({
      id: edge.id || `e${idx + 1}`,
      from,
      to,
      label: String(edge.label || ""),
      arrows: String(edge.arrows || "")
    });
  });

  nodes.clear();
  edges.clear();
  if (loadedNodes.length > 0) nodes.add(loadedNodes);
  if (loadedEdges.length > 0) edges.add(loadedEdges);
  updateCopiedContent([]);
  selectedNodes = [];
  window.selectedNodes = selectedNodes;
}

async function restoreUserConceptMap() {
  const userId = getCurrentUserId();
  const themeName = getCurrentThemeName();
  if (!userId || !themeName) return;

  try {
    const res = await fetch(
      `${themeApiBaseUrl}/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(themeName)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      if (res.status === 404) return;
      throw new Error(`HTTP ${res.status}`);
    }
    const themeRecord = await res.json();
    const content = themeRecord?.content;
    if (!content || typeof content !== "object") return;

    isRestoringConceptMap = true;
    applyConceptMapPayload(content);
    lastSavedConceptMapFingerprint = buildConceptMapFingerprint();
    logAction(`キーワードマップ: DBから復元しました (theme=${themeName})`);
  } catch (error) {
    console.error("概念マップの復元に失敗しました:", error);
  } finally {
    isRestoringConceptMap = false;
  }
}

async function sendConceptMapToServer(content) {
  const userId = getCurrentUserId();
  const themeName = getCurrentThemeName();
  if (!userId || !themeName) return;

  const payload = {
    themeName,
    content,
  };
  const response = await fetch(`${themeApiBaseUrl}/users/${encodeURIComponent(userId)}/themes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xmlPayload = {
    filename: getThemeScopedXmlFilename(),
    content: convertConceptMapPayloadToXml(content),
  };
  const xmlResponse = await fetch(`${saveXmlBaseUrl}/save-xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(xmlPayload),
  });
  if (!xmlResponse.ok) throw new Error(`HTTP ${xmlResponse.status}`);

  return response.json();
}

async function flushConceptMapSave() {
  if (isRestoringConceptMap) return;
  if (conceptMapSaveInFlight) {
    conceptMapSaveQueued = true;
    return;
  }

  const mapPayload = buildConceptMapPayload();
  const fingerprint = buildConceptMapFingerprint(mapPayload);
  if (fingerprint === lastSavedConceptMapFingerprint) {
    return;
  }

  conceptMapSaveInFlight = true;
  try {
    await sendConceptMapToServer(mapPayload);
    lastSavedConceptMapFingerprint = fingerprint;
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
nodes.on("add", scheduleConceptMapSave);
nodes.on("update", scheduleConceptMapSave);
nodes.on("remove", scheduleConceptMapSave);
edges.on("add", scheduleConceptMapSave);
edges.on("update", scheduleConceptMapSave);
edges.on("remove", scheduleConceptMapSave);

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
const callApiBtn = document.getElementById("callApiBtn");
if (callApiBtn) {
  callApiBtn.addEventListener("click", function () {
    callApi();
  });
}

