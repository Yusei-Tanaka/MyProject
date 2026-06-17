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

function disableNetworkCanvasFocusHighlight() {
  if (!container) return;

  container.setAttribute("tabindex", "-1");
  if (container.style) {
    container.style.outline = "none";
    container.style.boxShadow = "none";
  }

  var focusableElements = container.querySelectorAll("canvas, [tabindex]");
  focusableElements.forEach(function (element) {
    element.setAttribute("tabindex", "-1");
    if (element.style) {
      element.style.outline = "none";
      element.style.boxShadow = "none";
    }
  });
}

disableNetworkCanvasFocusHighlight();

if (typeof MutationObserver !== "undefined" && container) {
  var networkFocusObserver = new MutationObserver(function () {
    disableNetworkCanvasFocusHighlight();
  });
  networkFocusObserver.observe(container, { childList: true, subtree: true });
}

document.addEventListener("keydown", function (event) {
  if (event.key !== "Shift") return;
  if (!container) return;
  var activeElement = document.activeElement;
  if (activeElement && container.contains(activeElement) && typeof activeElement.blur === "function") {
    activeElement.blur();
  }
});

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

const appConfig = window.APP_CONFIG || {};
const host = appConfig.host || window.location.hostname || "127.0.0.1";
const apiBaseUrl =
  appConfig.flaskApiBaseUrl ||
  `http://${host}:${Number(appConfig.flaskApiPort || 8000)}`;
const themeApiBaseUrl =
  appConfig.apiBaseUrl ||
  `http://${host}:${Number(appConfig.apiPort || 3000)}`;

let isRestoringConceptMap = false;
let conceptMapSaveTimer = null;
let conceptMapSaveInFlight = false;
let conceptMapSaveQueued = false;
let lastSavedConceptMapFingerprint = "";

// 最後に選択された2つのノードを保存
var selectedNodes = []; // 選択されたノードIDを保存
window.selectedNodes = selectedNodes;

function logAction(message) {
  if (typeof window.addSystemLog === "function") {
    window.addSystemLog(message);
  }
}

var t = (key, vars = {}, fallback = "") => {
  if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
    return window.APP_I18N.t(key, vars, fallback);
  }
  return fallback || key;
};

function getCurrentThemeLanguage() {
  if (window.APP_I18N && typeof window.APP_I18N.getLanguage === "function") {
    const lang = window.APP_I18N.getLanguage();
    if (lang === "ja" || lang === "en") return lang;
  }
  const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  return htmlLang.startsWith("en") ? "en" : "ja";
}

// ノードの選択イベント
network.on("selectNode", function (event) {
  if (event.nodes.length > 0) {
    // Shiftキーが押されている場合は選択を追加
    const shiftPressed = !!(event && event.event && event.event.srcEvent && event.event.srcEvent.shiftKey);
    if (shiftPressed) {
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

const NODE_EMPHASIS_DURATION_MS = 1600;
const nodeEmphasisTimers = new Map();

function emphasizeNodeTemporarily(nodeId) {
  if (!nodes.get(nodeId)) return;

  const existingTimer = nodeEmphasisTimers.get(nodeId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  nodes.update({
    id: nodeId,
    color: {
      background: "#FFF7E6",
      border: "#E67E22"
    },
    borderWidth: 5,
    font: {
      color: "#34495E"
    }
  });

  const timer = setTimeout(function () {
    nodeEmphasisTimers.delete(nodeId);
    if (!nodes.get(nodeId)) return;

    if (Array.isArray(selectedNodes) && selectedNodes.includes(nodeId)) {
      highlightNodes(selectedNodes);
      return;
    }
    applyDefaultNodeStyle(nodeId);
  }, NODE_EMPHASIS_DURATION_MS);

  nodeEmphasisTimers.set(nodeId, timer);
}

window.emphasizeNodeTemporarily = emphasizeNodeTemporarily;

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
window.highlightNodes = highlightNodes;

function setSelectedNodes(nodeIds) {
  var existingMap = new Map();
  nodes.getIds().forEach(function (existingId) {
    existingMap.set(String(existingId), existingId);
  });

  var ids = (Array.isArray(nodeIds) ? nodeIds : [])
    .map(function (id) {
      return existingMap.get(String(id));
    })
    .filter(function (id) {
      return id !== undefined;
    });
  ids = Array.from(new Set(ids));

  if (network && typeof network.selectNodes === "function") {
    network.selectNodes(ids);
  }

  selectedNodes = ids;
  window.selectedNodes = selectedNodes;
  highlightNodes(selectedNodes);
  updateCopiedContent(selectedNodes);
}
window.setSelectedNodes = setSelectedNodes;

// ノードまたはエッジをダブルクリックで編集
network.on("doubleClick", function (event) {
  if (event.nodes.length > 0) {
    // ノードの編集
    var nodeId = event.nodes[0];
    var nodeData = nodes.get(nodeId);
    var oldLabel = nodeData ? nodeData.label : "";
    var newLabel = prompt(t("prompts.editNodeLabel", {}, "ノードのラベルを変更"), nodeData.label);
    if (newLabel !== null) {
      if (newLabel !== oldLabel) {
        nodeData.label = newLabel;
        nodes.update(nodeData); // ノードデータを更新
        logAction(`キーワードマップ: ノード編集 id=${nodeId} "${oldLabel}" → "${newLabel}"`);
      }
      clearNodeSelection();
    }
  } else if (event.edges.length > 0) {
    // エッジの編集
    var edgeId = event.edges[0];
    var edgeData = edges.get(edgeId);
    var oldEdgeLabel = edgeData ? edgeData.label : "";
    var newLabel = prompt(t("prompts.editEdgeLabel", {}, "エッジのラベルを変更"), edgeData.label);
    if (newLabel !== null && newLabel !== oldEdgeLabel) {
      edgeData.label = newLabel;
      edges.update(edgeData); // エッジデータを更新
      logAction(`キーワードマップ: リンク編集 id=${edgeId} "${oldEdgeLabel}" → "${newLabel}"`);
    }
  }
});

// ノード追加ボタン
function clearNodeSelection() {
  if (network && typeof network.unselectAll === "function") {
    network.unselectAll();
  }
  selectedNodes = [];
  window.selectedNodes = selectedNodes;
  highlightNodes(selectedNodes);
  updateCopiedContent(selectedNodes);
}
window.clearNodeSelection = clearNodeSelection;

const JAPANESE_SURFACE_PATTERN = /[ぁ-んァ-ヶ一-龯々ー]/;
const HIRAGANA_PATTERN = /[ぁ-ゖ]/g;
const JAPANESE_SPACE_PATTERN = /\s+/g;
const KUROMOJI_DICT_PATH = "../dict";
let duplicateKeywordTokenizerPromise = null;
const keywordCompareKeyCache = new Map();

function normalizeKeywordSurface(label) {
  return String(label || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toKatakana(text) {
  return String(text || "").replace(HIRAGANA_PATTERN, function (char) {
    return String.fromCharCode(char.charCodeAt(0) + 0x60);
  });
}

function buildKanaCompareKey(text) {
  const normalized = normalizeKeywordSurface(text).replace(JAPANESE_SPACE_PATTERN, "");
  return toKatakana(normalized);
}

function hasJapaneseSurface(text) {
  return JAPANESE_SURFACE_PATTERN.test(String(text || ""));
}

function getDuplicateKeywordTokenizer() {
  if (duplicateKeywordTokenizerPromise) {
    return duplicateKeywordTokenizerPromise;
  }
  if (typeof kuromoji === "undefined" || !kuromoji || typeof kuromoji.builder !== "function") {
    return Promise.resolve(null);
  }

  duplicateKeywordTokenizerPromise = new Promise(function (resolve) {
    kuromoji.builder({ dicPath: KUROMOJI_DICT_PATH }).build(function (err, tokenizer) {
      if (err) {
        console.warn("Duplicate check tokenizer init failed:", err);
        resolve(null);
        return;
      }
      resolve(tokenizer || null);
    });
  });

  return duplicateKeywordTokenizerPromise;
}

async function getReadingCompareKey(text) {
  if (!hasJapaneseSurface(text)) return "";

  const tokenizer = await getDuplicateKeywordTokenizer();
  if (!tokenizer) return "";

  try {
    const tokens = tokenizer.tokenize(String(text || ""));
    if (!Array.isArray(tokens) || tokens.length === 0) return "";

    const reading = tokens
      .map(function (token) {
        const readingCandidate = token && (token.reading || token.pronunciation);
        if (readingCandidate && readingCandidate !== "*") return readingCandidate;
        return token && token.surface_form ? token.surface_form : "";
      })
      .join("");

    return buildKanaCompareKey(reading);
  } catch (error) {
    console.warn("Duplicate check tokenization failed:", error);
    return "";
  }
}

async function buildKeywordCompareKeys(label) {
  const normalizedLabel = normalizeKeywordSurface(label);
  if (!normalizedLabel) return [];

  if (keywordCompareKeyCache.has(normalizedLabel)) {
    return keywordCompareKeyCache.get(normalizedLabel);
  }

  const keysPromise = (async function () {
    const keys = new Set();
    keys.add(`surface:${normalizedLabel}`);
    keys.add(`surface:${normalizedLabel.replace(/\s+/g, "")}`);

    const kanaKey = buildKanaCompareKey(normalizedLabel);
    if (kanaKey) {
      keys.add(`kana:${kanaKey}`);
    }

    const readingKey = await getReadingCompareKey(normalizedLabel);
    if (readingKey) {
      keys.add(`kana:${readingKey}`);
    }

    return Array.from(keys).filter(Boolean);
  })();

  keywordCompareKeyCache.set(normalizedLabel, keysPromise);
  return keysPromise;
}

async function findExistingNodeByLabel(label) {
  const targetKeys = await buildKeywordCompareKeys(label);
  if (!Array.isArray(targetKeys) || targetKeys.length === 0) return null;
  const targetKeySet = new Set(targetKeys);

  const allNodes = nodes.get();
  for (let i = 0; i < allNodes.length; i += 1) {
    const node = allNodes[i];
    const nodeKeys = await buildKeywordCompareKeys(node.label);
    for (let j = 0; j < nodeKeys.length; j += 1) {
      if (targetKeySet.has(nodeKeys[j])) {
        return node;
      }
    }
  }
  return null;
}
window.findExistingNodeByLabel = findExistingNodeByLabel;

function focusAndEmphasizeNode(nodeId) {
  if (nodeId === null || nodeId === undefined) return;

  if (network && typeof network.focus === "function") {
    network.focus(nodeId, {
      scale: 1,
      animation: { duration: 350, easingFunction: "easeInOutQuad" },
    });
  }
  emphasizeNodeTemporarily(nodeId);
}
window.focusAndEmphasizeNode = focusAndEmphasizeNode;

function getKeywordAlreadyExistsAlertMessage(keyword) {
  const fallback =
    getCurrentThemeLanguage() === "en"
      ? `Keyword "${keyword}" is already on the map.`
      : `キーワード「${keyword}」はすでにマップに存在しています。`;
  return t("alerts.keywordAlreadyExists", { keyword }, fallback);
}

document.getElementById("addNodeBtn").addEventListener("click", async function () {
  var addKeywordPromptMessage =
    getCurrentThemeLanguage() === "en"
      ? "Enter a keyword to add."
      : "追加するキーワードを入力してください。";
  var inputLabel = prompt(
    t("prompts.addKeywordLabel", {}, addKeywordPromptMessage),
    t("defaults.newNode", {}, "新しいノード")
  );
  if (inputLabel === null) return;

  var normalizedLabel = String(inputLabel).trim();
  if (!normalizedLabel) {
    alert(t("alerts.enterNodeName", {}, "ノード名を入力してください。"));
    return;
  }

  var existingNode = await findExistingNodeByLabel(normalizedLabel);
  if (existingNode) {
    alert(getKeywordAlreadyExistsAlertMessage(normalizedLabel));
    focusAndEmphasizeNode(existingNode.id);
    logAction(`キーワードマップ: 既存ノードを検出したため追加を中止 id=${existingNode.id} label="${normalizedLabel}"`);
    return;
  }

  var position = getNonOverlappingNodePosition();
  var newNode = {
    id: getNextNumericNodeId(), // 既存IDと重複しないIDを採番
    label: normalizedLabel,
    nodeType: "keyword",
    x: position.x,
    y: position.y,
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
  emphasizeNodeTemporarily(newNode.id);
  logAction(`キーワードマップ: ノード追加 id=${newNode.id} label="${newNode.label}"`);
});
const recenterMapBtn = document.getElementById("recenterMapBtn");

function setRecenterMapButtonPressed(isPressed) {
  if (!recenterMapBtn) return;
  recenterMapBtn.classList.toggle("is-active", !!isPressed);
  recenterMapBtn.setAttribute("aria-pressed", isPressed ? "true" : "false");
}

function recenterMap() {
  const allNodes = nodes.get();
  if (!allNodes || allNodes.length === 0) {
    network.moveTo({
      position: { x: 0, y: 0 },
      scale: 1,
      animation: { duration: 300, easingFunction: "easeInOutQuad" }
    });
    logAction(t("logs.mapCenterNoNodes", {}, "キーワードマップ: 中央表示（ノードなし）"));
    return;
  }

  network.fit({
    nodes: allNodes.map((n) => n.id),
    animation: { duration: 400, easingFunction: "easeInOutQuad" }
  });
  logAction(t("logs.mapCenter", {}, "キーワードマップ: 中央表示"));
}

if (recenterMapBtn) {
  recenterMapBtn.addEventListener("click", function () {
    setRecenterMapButtonPressed(true);
    recenterMap();
  });

  // main.html を開いた直後に中央表示を実行し、ボタンを押下状態にする
  window.addEventListener("load", function () {
    recenterMapBtn.click();
  });
}

function deleteSelectedNodesWithConfirm() {
  if (selectedNodes.length === 0) {
    alert(t("alerts.selectNodeToDelete", {}, "削除するノードを選択してください。"));
    return false;
  }

  const nodesToDelete = selectedNodes
    .map((id) => nodes.get(id))
    .filter((node) => !!node);

  if (nodesToDelete.length === 0) {
    alert(t("alerts.failedGetDeleteNode", {}, "削除対象ノードを取得できませんでした。"));
    return false;
  }

  const confirmMessage = [
    t("confirms.deleteNodesHeader", { count: nodesToDelete.length }, `以下の ${nodesToDelete.length} 件のノードを削除します。`),
    "",
    ...nodesToDelete.map((node) => `- [${node.id}] ${node.label || t("labels.noLabel", {}, "(ラベルなし)")}`),
    "",
    t("confirms.deleteNodesFooter", {}, "本当に削除してよいですか？")
  ].join("\n");

  if (!confirm(confirmMessage)) {
    return false;
  }

  const deleteIdSet = new Set(nodesToDelete.map((node) => String(node.id)));
  const edgesToDelete = edges.get({
    filter: function (edge) {
      return deleteIdSet.has(String(edge.from)) || deleteIdSet.has(String(edge.to));
    }
  });

  if (edgesToDelete.length > 0) {
    edges.remove(edgesToDelete.map((edge) => edge.id));
  }
  nodes.remove(nodesToDelete.map((node) => node.id));

  selectedNodes = []; // 選択リセット
  window.selectedNodes = selectedNodes;
  if (typeof highlightNodes === "function") {
    highlightNodes(selectedNodes);
  }
  updateCopiedContent(selectedNodes);

  logAction(`キーワードマップ: ノード複数削除 count=${nodesToDelete.length} edges=${edgesToDelete.length}`);
  nodesToDelete.forEach(function (node) {
    logAction(`キーワードマップ: ノード削除 id=${node.id} label="${node.label || ""}"`);
  });
  return true;
}

function isEditableElement(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName ? target.tagName.toLowerCase() : "";
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function isInMindmapArea(target) {
  const mindmapContainer = document.getElementById("myDiagramDiv");
  if (!mindmapContainer || !target || typeof mindmapContainer.contains !== "function") return false;
  return mindmapContainer === target || mindmapContainer.contains(target);
}

// ノード削除ボタン
document.getElementById("deleteNodeBtn").addEventListener("click", function () {
  deleteSelectedNodesWithConfirm();
});

// Delete / Backspaceキーでも選択ノード削除
document.addEventListener("keydown", function (event) {
  const isDeleteKey = event.key === "Delete" || event.key === "Backspace";
  if (!isDeleteKey) return;
  if (isEditableElement(event.target)) return;
  if (isInMindmapArea(event.target) || isInMindmapArea(document.activeElement)) return;

  event.preventDefault();
  deleteSelectedNodesWithConfirm();
});

// エッジ追加ボタン
document.getElementById("addEdgeBtn").addEventListener("click", function () {
  if (selectedNodes.length === 2) {
    var arrowEnabled = document.getElementById("arrowToggle").checked; // チェックボックスの状態を取得
    var newEdge = {
      id: getNextEdgeId(),
      from: selectedNodes[0],
      to: selectedNodes[1],
      label: t("defaults.newEdge", {}, "新しいリンク"),
      arrows: arrowEnabled ? "to" : "" // 矢印の有無をチェックボックスで決定
    };
    try {
      edges.add(newEdge); // エッジを追加
      logAction(`キーワードマップ: リンク追加 from=${newEdge.from} to=${newEdge.to} label="${newEdge.label}" arrows=${newEdge.arrows || "none"}`);
      //alert("エッジを追加しました。");
      clearNodeSelection();
    } catch (error) {
      console.error("エッジの追加に失敗しました:", error);
    }
  } else {
    alert(t("alerts.selectTwoNodes", {}, "2つのノードを選択してください。"));
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
      clearNodeSelection();
      //alert("エッジを削除しました。");
    } else {
      alert(t("alerts.edgeNotFoundBetweenNodes", {}, "選択されたノード間にエッジが存在しません。"));
    }
  } else {
    alert(t("alerts.selectTwoNodes", {}, "2つのノードを選択してください。"));
  }
});

// ノードタイトルを表示する関数（複数ノード対応）
function updateCopiedContent(_nodeIds) {
  var copiedContentElement = document.getElementById("copiedContent");
  if (!copiedContentElement) return;
  copiedContentElement.innerText = "";
  copiedContentElement.classList.add("is-hidden");
}
window.updateCopiedContent = updateCopiedContent;

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

function getNextNumericNodeId() {
  const ids = nodes.getIds();
  let maxId = 0;

  ids.forEach((id) => {
    const numericId = Number(id);
    if (Number.isInteger(numericId) && numericId > maxId) {
      maxId = numericId;
    }
  });

  return maxId + 1;
}

function getNonOverlappingNodePosition() {
  const center = network.getViewPosition();
  const existingIds = nodes.getIds();
  const existingPositions = network.getPositions(existingIds);
  const minDistance = 120;
  const maxAttempts = 180;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  function isTooClose(x, y) {
    for (let i = 0; i < existingIds.length; i += 1) {
      const id = existingIds[i];
      const pos = existingPositions[id];
      if (!pos) continue;
      const dx = x - pos.x;
      const dy = y - pos.y;
      if (Math.hypot(dx, dy) < minDistance) {
        return true;
      }
    }
    return false;
  }

  if (!isTooClose(center.x, center.y)) {
    return { x: center.x, y: center.y };
  }

  for (let i = 1; i <= maxAttempts; i += 1) {
    const radius = minDistance * Math.sqrt(i);
    const angle = i * goldenAngle;
    const candidateX = center.x + Math.cos(angle) * radius;
    const candidateY = center.y + Math.sin(angle) * radius;

    if (!isTooClose(candidateX, candidateY)) {
      return { x: candidateX, y: candidateY };
    }
  }

  return {
    x: center.x + minDistance,
    y: center.y + minDistance,
  };
}

window.getNonOverlappingNodePosition = getNonOverlappingNodePosition;

function getNextEdgeId() {
  const existingIds = new Set(edges.getIds().map((id) => String(id)));
  let next = 1;

  while (existingIds.has(`e${next}`) || existingIds.has(String(next))) {
    next += 1;
  }

  return `e${next}`;
}

function buildConceptMapPayload() {
  const currentNodes = nodes.get();
  const currentEdges = edges.get();
  const nodePositions = network.getPositions(currentNodes.map((node) => node.id));
  const currentLanguage = getCurrentThemeLanguage();

  const keywordNodes = currentNodes.map((node) => {
    const pos = nodePositions[node.id] || {};
    const label = String(node.label || "").trim();
    const labelMap =
      node.i18nLabels && typeof node.i18nLabels === "object" && !Array.isArray(node.i18nLabels)
        ? { ...node.i18nLabels }
        : {};
    if (label) {
      labelMap[currentLanguage] = label;
    }

    const payloadNode = {
      id: node.id,
      label,
      nodeType: node.nodeType || "keyword",
      x: Number.isFinite(pos.x) ? pos.x : node.x,
      y: Number.isFinite(pos.y) ? pos.y : node.y,
    };
    if (Object.keys(labelMap).length > 0) {
      payloadNode.i18nLabels = labelMap;
    }
    return payloadNode;
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

function applyConceptMapPayload(payload) {
  const currentLanguage = getCurrentThemeLanguage();
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

    const labelMap =
      node && node.i18nLabels && typeof node.i18nLabels === "object" && !Array.isArray(node.i18nLabels)
        ? node.i18nLabels
        : null;
    const localizedLabel =
      labelMap && typeof labelMap[currentLanguage] === "string" && labelMap[currentLanguage].trim()
        ? labelMap[currentLanguage].trim()
        : String(node.label || "");

    const restoredNode = {
      id,
      label: localizedLabel,
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
    if (labelMap) {
      restoredNode.i18nLabels = { ...labelMap };
      if (localizedLabel) {
        restoredNode.i18nLabels[currentLanguage] = localizedLabel;
      }
    }
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
    const language = getCurrentThemeLanguage();
    const res = await fetch(
      `${themeApiBaseUrl}/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(themeName)}?language=${encodeURIComponent(language)}`,
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
    language: getCurrentThemeLanguage(),
    content,
  };
  const response = await fetch(`${themeApiBaseUrl}/users/${encodeURIComponent(userId)}/themes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
