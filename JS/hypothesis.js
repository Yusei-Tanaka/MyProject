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

function logHypothesisAction(message) {
  if (typeof window.addSystemLog === "function") {
    window.addSystemLog(message);
  }
}

const hypothesisHost = window.location.hostname || "localhost";
const hypothesisSaveBaseUrl = `http://${hypothesisHost}:3005`;
const hypothesisDbApiBaseUrl = `http://${hypothesisHost}:3000`;
const HYPOTHESIS_SNAPSHOT_DIR = "XML";
const HYPOTHESIS_LEGACY_SNAPSHOT_DIR = "JS/XML";
let hypothesisSaveTimer = null;
let hypothesisSaveInFlight = false;
let hypothesisSaveQueued = false;
let lastSavedHypothesisFingerprint = "";
const HYPOTHESIS_MAX_FILE_PART_LENGTH = 24;
let hasShownHypothesisUserMissingWarning = false;
let hasShownXmlFetchWarning = false;

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
  if (normalized.length <= HYPOTHESIS_MAX_FILE_PART_LENGTH) {
    return normalized;
  }
  const headLength = HYPOTHESIS_MAX_FILE_PART_LENGTH - 9;
  const head = normalized.slice(0, headLength);
  return `${head}_${hashString8(normalized)}`;
}

function getUserThemeParts(useShort = true) {
  const storedName = localStorage.getItem("userName");
  const storedTheme = localStorage.getItem("searchTitle");
  const user = storedName ? storedName.trim() : "";
  const theme = storedTheme ? storedTheme.trim() : "";
  if (!useShort) {
    return {
      user: sanitizeFilePart(user) || "user_map",
      theme: sanitizeFilePart(theme) || "untitled",
    };
  }
  return {
    user: toShortFilePart(user, "user_map"),
    theme: toShortFilePart(theme, "untitled"),
  };
}

function getHypothesisStateFilename() {
  const parts = getUserThemeParts(true);
  return `${parts.user}__${parts.theme}.hypothesis.json`;
}

function getCurrentUserThemeRaw() {
  const userId = String(localStorage.getItem("userName") || "").trim();
  const themeName = String(localStorage.getItem("searchTitle") || "").trim();
  return { userId, themeName };
}

function rebindRestoredHypothesis(wrapper) {
  wrapper.querySelectorAll(".hypothesis-box").forEach(function (entry) {
    rebindHypothesisEntry(entry);
    bindDeleteButton(entry, wrapper);
  });

  updateHypothesisNumbers(wrapper);
  if (wrapper.children.length > 0) {
    logHypothesisAction("仮説: 復元しました");
  }
}

function collectHypothesisNodesFromWrapper(wrapper) {
  if (!wrapper) return [];

  const rows = [];
  const entries = wrapper.querySelectorAll(".hypothesis-box");
  entries.forEach(function (entry, entryIndex) {
    const keywordElement = entry.querySelector("div:nth-child(2)");
    const basedKeywords = keywordElement ? String(keywordElement.innerText || "").trim() : "";

    const mainTextarea = entry.querySelector("textarea.hypothesis-text");
    const hypothesisText = mainTextarea ? String(mainTextarea.value || "").trim() : "";
    if (hypothesisText) {
      rows.push({
        id: `hypothesis-${entryIndex + 1}`,
        kind: "hypothesis",
        text: hypothesisText,
        basedKeywords,
        order: rows.length + 1,
      });
    }

    const scamperContainers = entry.querySelectorAll(".scamper-tag-container");
    scamperContainers.forEach(function (container, scamperIndex) {
      const tag = container.querySelector(".scamper-tag");
      const textarea = container.querySelector("textarea.scamper-edit-box");
      const scamperText = textarea ? String(textarea.value || "").trim() : "";
      if (!scamperText) return;

      rows.push({
        id: `hypothesis-${entryIndex + 1}-scamper-${scamperIndex + 1}`,
        kind: "scamper",
        tag: tag ? String(tag.innerText || "").trim() : "",
        text: scamperText,
        basedKeywords,
        order: rows.length + 1,
      });
    });
  });

  return rows;
}

async function saveHypothesisStateToDb(serializedHtml, hypothesisNodes) {
  const { userId, themeName } = getCurrentUserThemeRaw();
  if (!userId || !themeName) return;

  let existingContent = {};
  try {
    const getRes = await fetch(
      `${hypothesisDbApiBaseUrl}/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(themeName)}`,
      { cache: "no-store" }
    );

    if (getRes.ok) {
      const currentTheme = await getRes.json();
      if (currentTheme && currentTheme.content && typeof currentTheme.content === "object") {
        existingContent = currentTheme.content;
      }
    } else if (getRes.status !== 404) {
      throw new Error(`HTTP ${getRes.status}`);
    }

    const existingHypothesis =
      existingContent && existingContent.hypothesis && typeof existingContent.hypothesis === "object"
        ? existingContent.hypothesis
        : {};

    const mergedContent = {
      ...existingContent,
      hypothesis: {
        ...existingHypothesis,
        html: serializedHtml,
        nodes: Array.isArray(hypothesisNodes) ? hypothesisNodes : [],
        savedAt: new Date().toISOString(),
      },
    };

    const putRes = await fetch(
      `${hypothesisDbApiBaseUrl}/users/${encodeURIComponent(userId)}/themes`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeName,
          content: mergedContent,
        }),
      }
    );
    if (putRes.status === 404) {
      if (!hasShownHypothesisUserMissingWarning) {
        hasShownHypothesisUserMissingWarning = true;
        alert(`ユーザー「${userId}」がDBに存在しないため、仮説のDB保存をスキップしました。\nログインし直して（auth_user / host）利用してください。`);
      }
      return;
    }
    if (!putRes.ok) {
      throw new Error(`HTTP ${putRes.status}`);
    }
  } catch (error) {
    console.error("仮説発散エリアのDB保存に失敗しました:", error);
  }
}

function getLegacyHypothesisStateFilename() {
  const parts = getUserThemeParts(false);
  return `${parts.user}__${parts.theme}.hypothesis.json`;
}

function scheduleHypothesisSave() {
  if (hypothesisSaveTimer) clearTimeout(hypothesisSaveTimer);
  hypothesisSaveTimer = setTimeout(function () {
    flushHypothesisSave();
  }, 400);
}

function serializeHypothesisWrapper(wrapper) {
  const clone = wrapper.cloneNode(true);
  clone.querySelectorAll("textarea").forEach(function (ta) {
    ta.textContent = ta.value;
  });
  return clone.innerHTML;
}

async function saveHypothesisState() {
  try {
    const container = ensureHypothesisContainer();
    const wrapper = container.querySelector("#hypothesisWrapper");
    if (!wrapper) return;

    const serializedHtml = serializeHypothesisWrapper(wrapper);
    const hypothesisNodes = collectHypothesisNodesFromWrapper(wrapper);

    const payload = {
      filename: getHypothesisStateFilename(),
      content: JSON.stringify({ html: serializedHtml }),
    };

    const fileSavePromise = fetch(`${hypothesisSaveBaseUrl}/save-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const [fileSaveResult] = await Promise.all([
      fileSavePromise,
      saveHypothesisStateToDb(serializedHtml, hypothesisNodes),
    ]);

    if (!fileSaveResult.ok) {
      throw new Error(`HTTP ${fileSaveResult.status}`);
    }
  } catch (error) {
    console.error("仮説発散エリアの保存に失敗しました:", error);
  }
}

function buildHypothesisSaveSnapshot() {
  const container = ensureHypothesisContainer();
  const wrapper = container.querySelector("#hypothesisWrapper");
  if (!wrapper) {
    return null;
  }

  const serializedHtml = serializeHypothesisWrapper(wrapper);
  const hypothesisNodes = collectHypothesisNodesFromWrapper(wrapper);
  const fingerprint = JSON.stringify({
    html: serializedHtml,
    nodes: hypothesisNodes,
  });

  return {
    serializedHtml,
    hypothesisNodes,
    fingerprint,
  };
}

function resetHypothesisSaveFingerprintFromCurrent() {
  const snapshot = buildHypothesisSaveSnapshot();
  lastSavedHypothesisFingerprint = snapshot ? snapshot.fingerprint : "";
}

async function flushHypothesisSave() {
  if (hypothesisSaveInFlight) {
    hypothesisSaveQueued = true;
    return;
  }

  const snapshot = buildHypothesisSaveSnapshot();
  if (!snapshot) return;
  if (snapshot.fingerprint === lastSavedHypothesisFingerprint) {
    return;
  }

  hypothesisSaveInFlight = true;
  try {
    const payload = {
      filename: getHypothesisStateFilename(),
      content: JSON.stringify({ html: snapshot.serializedHtml }),
    };

    const fileSavePromise = fetch(`${hypothesisSaveBaseUrl}/save-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const [fileSaveResult] = await Promise.all([
      fileSavePromise,
      saveHypothesisStateToDb(snapshot.serializedHtml, snapshot.hypothesisNodes),
    ]);

    if (!fileSaveResult.ok) {
      throw new Error(`HTTP ${fileSaveResult.status}`);
    }

    lastSavedHypothesisFingerprint = snapshot.fingerprint;
  } catch (error) {
    console.error("仮説発散エリアの保存に失敗しました:", error);
  } finally {
    hypothesisSaveInFlight = false;
    if (hypothesisSaveQueued) {
      hypothesisSaveQueued = false;
      flushHypothesisSave();
    }
  }
}

function attachHypothesisTextareaLogging(textarea, createMessage) {
  if (!textarea || textarea.dataset.loggingBound === "true") return;

  textarea.dataset.lastLoggedValue = textarea.value.trim();
  let logTimer = null;

  textarea.addEventListener("input", function () {
    if (logTimer) clearTimeout(logTimer);
    logTimer = setTimeout(function () {
      const current = textarea.value.trim();
      if (current && current !== textarea.dataset.lastLoggedValue) {
        logHypothesisAction(createMessage(current));
        textarea.dataset.lastLoggedValue = current;
      }
    }, 500);
  });

  textarea.addEventListener("blur", function () {
    const current = textarea.value.trim();
    if (current !== textarea.dataset.lastLoggedValue) {
      scheduleHypothesisSave();
    }
    if (current && current !== textarea.dataset.lastLoggedValue) {
      logHypothesisAction(createMessage(current));
      textarea.dataset.lastLoggedValue = current;
    }
  });

  textarea.dataset.loggingBound = "true";
}

function bindDeleteButton(entry, wrapper) {
  const delBtn = entry.querySelector(".hypothesis-delete-btn");
  if (!delBtn) return;

  if (typeof delBtn.__hypothesisDeleteHandler === "function") {
    delBtn.removeEventListener("click", delBtn.__hypothesisDeleteHandler);
  }

  const onDeleteClick = function () {
    wrapper.removeChild(entry);
    updateHypothesisNumbers(wrapper);
    logHypothesisAction("仮説: 削除");
    scheduleHypothesisSave();
  };

  delBtn.addEventListener("click", onDeleteClick);
  delBtn.__hypothesisDeleteHandler = onDeleteClick;
}

function bindScamperTagDelete(tagLabel, tagContainer) {
  if (!tagLabel) return;

  if (typeof tagLabel.__scamperDeleteHandler === "function") {
    tagLabel.removeEventListener("contextmenu", tagLabel.__scamperDeleteHandler);
  }

  const onContextMenu = function (e) {
    e.preventDefault();
    var confirmDelete = confirm(`「${tagLabel.innerText}」タグを削除しますか？`);
    if (confirmDelete && tagContainer.parentNode) {
      tagContainer.parentNode.removeChild(tagContainer);
      scheduleHypothesisSave();
    }
  };

  tagLabel.addEventListener("contextmenu", onContextMenu);
  tagLabel.__scamperDeleteHandler = onContextMenu;
}

function rebindHypothesisEntry(entry) {
  entry.querySelectorAll(".hypothesis-action-bar").forEach(function (bar) {
    bar.remove();
  });

  var mainTextarea = entry.querySelector("textarea.hypothesis-text");
  if (mainTextarea) {
    mainTextarea.value = mainTextarea.value || mainTextarea.textContent || "";
    mainTextarea.dataset.hasActionBar = "";
    attachHypothesisTextareaLogging(mainTextarea, function (value) {
      return `仮説: 入力 "${value}"`;
    });
    attachHypothesisActions(mainTextarea, entry);
  }

  entry.querySelectorAll(".scamper-tag-container").forEach(function (tagContainer) {
    var tagLabel = tagContainer.querySelector(".scamper-tag");
    var optionLabel = tagLabel ? tagLabel.innerText : "SCAMPER";
    var editBox = tagContainer.querySelector("textarea.scamper-edit-box");

    if (editBox) {
      editBox.value = editBox.value || editBox.textContent || "";
      editBox.dataset.hasActionBar = "";
      attachHypothesisTextareaLogging(editBox, function (value) {
        return `仮説: SCAMPER入力 (${optionLabel}) "${value}"`;
      });
      attachHypothesisActions(editBox, entry, tagContainer, optionLabel);
    }

    bindScamperTagDelete(tagLabel, tagContainer);
  });
}

async function restoreHypothesisState() {
  try {
    const container = ensureHypothesisContainer();
    const wrapper = container.querySelector("#hypothesisWrapper");
    if (!wrapper) return;

    const { userId, themeName } = getCurrentUserThemeRaw();
    if (userId && themeName) {
      const dbRes = await fetch(
        `${hypothesisDbApiBaseUrl}/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(themeName)}`,
        { cache: "no-store" }
      );

      if (dbRes.ok) {
        const dbRecord = await dbRes.json();
        const dbContent = dbRecord && dbRecord.content && typeof dbRecord.content === "object"
          ? dbRecord.content
          : null;
        const dbHypothesis = dbContent && dbContent.hypothesis && typeof dbContent.hypothesis === "object"
          ? dbContent.hypothesis
          : null;
        const dbHtml = dbHypothesis && typeof dbHypothesis.html === "string"
          ? dbHypothesis.html
          : "";

        if (dbHtml) {
          wrapper.innerHTML = dbHtml;
          rebindRestoredHypothesis(wrapper);
          resetHypothesisSaveFingerprintFromCurrent();
          return;
        }
      } else if (dbRes.status !== 404) {
        throw new Error(`HTTP ${dbRes.status}`);
      }
    }

    const preferredPath = `${HYPOTHESIS_SNAPSHOT_DIR}/${getHypothesisStateFilename()}`;
    let res = await fetch(preferredPath, { cache: "no-store" });
    if (!res.ok && res.status === 404) {
      const sameNameLegacyPath = `${HYPOTHESIS_LEGACY_SNAPSHOT_DIR}/${getHypothesisStateFilename()}`;
      if (sameNameLegacyPath !== preferredPath) {
        res = await fetch(sameNameLegacyPath, { cache: "no-store" });
      }
      if (!res.ok && res.status === 404) {
        const legacyPath = `${HYPOTHESIS_LEGACY_SNAPSHOT_DIR}/${getLegacyHypothesisStateFilename()}`;
        if (legacyPath !== sameNameLegacyPath) {
          res = await fetch(legacyPath, { cache: "no-store" });
        }
      }
    }
    if (!res.ok) {
      if (res.status === 404) return;
      throw new Error(`HTTP ${res.status}`);
    }

    const raw = await res.text();
    if (!raw || !raw.trim()) return;

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_e) {
      parsed = { html: "" };
    }

    if (!parsed.html || typeof parsed.html !== "string") return;

    wrapper.innerHTML = parsed.html;
    rebindRestoredHypothesis(wrapper);
    resetHypothesisSaveFingerprintFromCurrent();
  } catch (error) {
    console.error("仮説発散エリアの復元に失敗しました:", error);
  }
}

// 仮説エントリを追加する（選択キーワードを基に1エントリ追加）
function addHypothesisEntry(nodeIds) {
  var container = ensureHypothesisContainer();
  var wrapper = container.querySelector("#hypothesisWrapper");
  if (!wrapper) return;

  // 選択キーワードラベル取得（先頭リストは表示しない）
  var nodeDataSet = window.nodes;
  var keywordLabels = nodeIds.map(function (id) {
    var n = nodeDataSet && typeof nodeDataSet.get === "function" ? nodeDataSet.get(id) : null;
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
  attachHypothesisTextareaLogging(ta, function (current) {
    return `仮説: 入力 "${current}"`;
  });
  body.appendChild(ta);
  entry.appendChild(body);

  // 操作ボタン（削除）
  var controls = document.createElement("div");
  controls.style.marginTop = "6px";
  var delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.innerText = "削除";
  delBtn.className = "hypothesis-delete-btn";
  controls.appendChild(delBtn);
  entry.appendChild(controls);
  bindDeleteButton(entry, wrapper);

  wrapper.appendChild(entry);
  enableScamperOnEntry(entry);
  entry.scrollIntoView({ behavior: "smooth" });
  logHypothesisAction(`仮説: 追加 (基づくキーワード: ${keywordLabels.join("、")})`);
  scheduleHypothesisSave();
}

// 表示されている仮説の番号を更新
function updateHypothesisNumbers(wrapper) {
  for (var i = 0; i < wrapper.children.length; i++) {
    var h = wrapper.children[i].querySelector(".hypothesis-box-header");
    if (h) h.innerText = "仮説 #" + (i + 1);
  }
}

function getSelectedNodeIdsForHypothesis() {
  var ids = Array.isArray(window.selectedNodes) ? window.selectedNodes.slice() : [];
  if (ids.length > 0) return ids;

  if (window.network && typeof window.network.getSelectedNodes === "function") {
    var networkSelected = window.network.getSelectedNodes();
    if (Array.isArray(networkSelected) && networkSelected.length > 0) {
      return networkSelected;
    }
  }

  return [];
}

function bindCreateHypothesisButton() {
  var createBtnDom = document.getElementById("createHypothesisBtn");
  if (!createBtnDom || createBtnDom.dataset.boundHypothesisCreate === "true") {
    return;
  }

  createBtnDom.onclick = function () {
    if (typeof window.handleCreateHypothesisClick === "function") {
      window.handleCreateHypothesisClick();
    }
  };

  createBtnDom.dataset.boundHypothesisCreate = "true";
}

window.handleCreateHypothesisClick = function () {
  try {
    var currentSelectedNodes = getSelectedNodeIdsForHypothesis();
    if (currentSelectedNodes.length === 0) {
      alert("少なくとも1つのノードを選択してください。");
      return;
    }
    addHypothesisEntry(currentSelectedNodes);
  } catch (error) {
    console.error("仮説立案ボタン処理でエラーが発生しました:", error);
    alert("仮説立案の処理中にエラーが発生しました。ページを再読み込みしてください。");
  }
};

// DOM が読み込まれたら仮説コンテナを初期化し，ボタンにリスナを登録する
document.addEventListener("DOMContentLoaded", function () {
  ensureHypothesisContainer();
  restoreHypothesisState();
  bindCreateHypothesisButton();
});

if (document.readyState !== "loading") {
  bindCreateHypothesisButton();
}

// 選択されたノードが存在するか確認
if (Array.isArray(window.selectedNodes) && window.nodes && typeof window.nodes.get === "function") {
  window.selectedNodes.forEach(function (nodeId) {
    console.log("Node exists:", nodes.get(nodeId) !== null);
  });
}

if (window.edges && typeof window.edges.get === "function") {
  console.log("Edges:", edges.get());
}

// SCAMPER の選択肢（日本語ラベル）
var SCAMPER_OPTIONS = [
  { key: "Substitute", label: "置換 (Substitute)" },
  { key: "Combine", label: "結合 (Combine)" },
  { key: "Adapt", label: "適応 (Adapt)" },
  { key: "Modify", label: "修正 (Modify)" },
  { key: "PutToOtherUse", label: "転用 (Put to other use)" },
  { key: "Eliminate", label: "削除 (Eliminate)" },
  { key: "Reverse", label: "再構成 (Reverse)" }
];

// SCAMPER関連の共有状態
let xmlData = "";
let hypothesisData = "";
let selectedKeywords = "";
let selectedScamper = "";
window.theme = "";

function updateHypothesisContextFromEntry(entry, customText, customKeywordLabel) {
  if (!entry) return;
  const textArea = entry.querySelector(".hypothesis-text");
  const keywordElement = entry.querySelector("div:nth-child(2)");
  const baseKeywords = keywordElement ? keywordElement.innerText : "(キーワードなし)";
  const keywordsToUse =
    customKeywordLabel !== undefined && customKeywordLabel !== null
      ? `${baseKeywords} / ${customKeywordLabel}`
      : baseKeywords;
  const baseText = textArea ? textArea.value : "";
  const textToUse =
    customText !== undefined && customText !== null ? customText : baseText;
  hypothesisData = textToUse;
  selectedKeywords = keywordsToUse;
}

// 「ノードを追加」選択時の処理（マインドマップ）
function addNodeToNetwork(entry, sourceTextarea) {
  const fallbackTextarea = entry.querySelector(".hypothesis-box-body textarea");
  const rawText = sourceTextarea ? sourceTextarea.value : fallbackTextarea?.value;
  const candidateText = (rawText || "").trim();
  if (!candidateText) {
    alert("追加する仮説の内容を入力してください。");
    return;
  }

  if (typeof window.getMindmapNodes !== "function" || typeof window.addMindmapChild !== "function") {
    alert("マインドマップが利用できません。ページを再読み込みしてください。");
    return;
  }

  const mindmapNodes = window.getMindmapNodes();
  if (!mindmapNodes || mindmapNodes.length === 0) {
    alert("マインドマップに親ノードがありません。");
    return;
  }

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.right = 0;
  overlay.style.bottom = 0;
  overlay.style.background = "rgba(0,0,0,0.3)";
  overlay.style.zIndex = 9998;

  const dialog = document.createElement("div");
  dialog.style.position = "absolute";
  dialog.style.top = "50%";
  dialog.style.left = "50%";
  dialog.style.transform = "translate(-50%, -50%)";
  dialog.style.background = "#fff";
  dialog.style.border = "2px solid #555";
  dialog.style.borderRadius = "8px";
  dialog.style.padding = "20px";
  dialog.style.width = "360px";
  dialog.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
  dialog.style.fontSize = "14px";

  const title = document.createElement("h3");
  title.innerText = "マインドマップにノードを追加";
  title.style.marginTop = 0;
  dialog.appendChild(title);

  const parentLabel = document.createElement("label");
  parentLabel.innerText = "親ノードを選択";
  parentLabel.style.display = "block";
  parentLabel.style.marginBottom = "4px";
  dialog.appendChild(parentLabel);

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.marginBottom = "12px";

  mindmapNodes.forEach((node, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    const prefix = node.parent == null ? "(ルート)" : "";
    option.innerText = `${prefix}${node.text || "(無題ノード)"}`;
    select.appendChild(option);
  });

  dialog.appendChild(select);

  const textLabel = document.createElement("label");
  textLabel.innerText = "追加する仮説";
  textLabel.style.display = "block";
  textLabel.style.marginBottom = "4px";
  dialog.appendChild(textLabel);

  const textArea = document.createElement("textarea");
  textArea.style.width = "100%";
  textArea.style.minHeight = "80px";
  textArea.readOnly = true;
  textArea.style.background = "#f7f7f7";
  textArea.style.cursor = "not-allowed";
  textArea.value = candidateText;
  dialog.appendChild(textArea);

  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.justifyContent = "flex-end";
  buttonRow.style.gap = "8px";
  buttonRow.style.marginTop = "16px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.innerText = "キャンセル";
  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.innerText = "追加";
  addBtn.style.background = "#4caf50";
  addBtn.style.color = "#fff";
  addBtn.style.border = "none";
  addBtn.style.padding = "6px 16px";
  addBtn.style.borderRadius = "4px";
  addBtn.addEventListener("click", () => {
    const trimmed = textArea.value.trim();
    if (!trimmed) {
      alert("仮説が空です。");
      return;
    }

    const selectedIndex = parseInt(select.value, 10);
    const parentNode = mindmapNodes[selectedIndex] || mindmapNodes[0];
    const success = window.addMindmapChild(parentNode.key, trimmed);
    if (!success) {
      alert("ノードの追加に失敗しました。");
      return;
    }

    logHypothesisAction(`仮説: マインドマップへノード追加 parent=${parentNode.key} "${parentNode.text || ""}" text="${trimmed}"`);

    document.body.removeChild(overlay);
  });

  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(addBtn);
  dialog.appendChild(buttonRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  textArea.focus();
}

function attachHypothesisActions(targetTextarea, entry, parentContainer = null, optionLabel = null) {
  if (!targetTextarea || targetTextarea.dataset.hasActionBar === "true") {
    return;
  }

  const actionBar = document.createElement("div");
  actionBar.className = "hypothesis-action-bar";
  actionBar.style.display = "flex";
  actionBar.style.justifyContent = "flex-end";
  actionBar.style.gap = "6px";
  actionBar.style.marginBottom = "4px";

  const addNodeBtn = document.createElement("button");
  addNodeBtn.type = "button";
  addNodeBtn.className = "hypothesis-action-button add-node-button";
  addNodeBtn.innerText = "ノード追加";
  addNodeBtn.addEventListener("click", function () {
    if (!targetTextarea.value.trim()) {
      alert("仮説を入力してください。");
      return;
    }
    addNodeToNetwork(entry, targetTextarea);
  });

  const scamperBtn = document.createElement("button");
  scamperBtn.type = "button";
  scamperBtn.className = "hypothesis-action-button scamper-button";
  scamperBtn.innerText = "仮説を発散";
  scamperBtn.addEventListener("click", function (e) {
    e.preventDefault();
    if (!targetTextarea.value.trim()) {
      alert("仮説を入力してください。");
      return;
    }
    const currentText = targetTextarea.value;
    if (optionLabel) {
      updateHypothesisContextFromEntry(entry, currentText, optionLabel);
    } else {
      updateHypothesisContextFromEntry(entry, currentText);
    }
    createScamperMenu(e.clientX, e.clientY, entry, targetTextarea, parentContainer, e.currentTarget);
  });

  actionBar.appendChild(addNodeBtn);
  actionBar.appendChild(scamperBtn);

  const parent = targetTextarea.parentNode;
  if (parent) {
    parent.insertBefore(actionBar, targetTextarea);
  }

  targetTextarea.dataset.hasActionBar = "true";
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
  attachHypothesisTextareaLogging(editBox, function (current) {
    return `仮説: SCAMPER入力 (${option.label}) "${current}"`;
  });

  // 右クリックで削除確認ダイアログを表示
  bindScamperTagDelete(tagLabel, tagContainer);

  tagContainer.appendChild(tagLabel);
  tagContainer.appendChild(editBox);
  tagWrap.appendChild(tagContainer);
  attachHypothesisActions(editBox, entry, tagContainer, option.label);

  // メニューを削除（選択後に必ず閉じる）
  removeScamperMenu();
  scheduleHypothesisSave();

  return tagLabel;
}

// SCAMPERメニュー作成（修正済み）
function createScamperMenu(x, y, entry, targetBox, parentContainer = null, anchorElement = null) {
  removeScamperMenu();

  var anchor = anchorElement || targetBox;
  var rect = anchor.getBoundingClientRect();

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
        addNodeToNetwork(entry, targetBox); // 「ノードを追加」選択時の処理
        logHypothesisAction("仮説: SCAMPERでノード追加を選択");
      } else {
        var newTag = applyScamperToEntry(entry, opt, parentContainer);
        if (newTag) {
          triggerScamperQuestion(newTag, opt.label);
          logHypothesisAction(`仮説: SCAMPER選択 ${opt.label}`);
        }
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
    attachHypothesisActions(hypothesisBox, entry);
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
      var newId = nodes.length + 1;
      while (nodes.get(newId)) {
        newId++;
      }
        var newNode = {
        id: newId,
            label: keyword,
          nodeType: "keyword",
        };
        nodes.add(newNode); // ノードを追加
      logHypothesisAction(`キーワード: ノード追加 label="${keyword}"`);
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

function getUserXmlRelativePath() {
  const parts = getUserThemeParts(true);
  const filename = `${parts.user}__${parts.theme}.xml`;
  return `${HYPOTHESIS_SNAPSHOT_DIR}/${filename}`;
}

// HTMLの入力フィールドからタイトルを取得してコンソールに出力する
document.addEventListener("DOMContentLoaded", () => {
  const titleInput = document.querySelector("#myTitle"); // タイトル入力用のinput要素を取得

  if (titleInput) {
    // 入力フィールドの変更を監視
    titleInput.addEventListener("input", (event) => {
      console.log("入力されたタイトル:", event.target.value); // 入力されたタイトルをコンソールに出力
    });
    titleInput.addEventListener("change", (event) => {
      if (typeof window.addSystemLog === "function") {
        window.addSystemLog(`タイトル変更: "${event.target.value}"`);
      }
    });
  } else {
    console.log("タイトル入力フィールドが見つかりませんでした。");
  }

  // XMLファイルを定期的に取得してコンソールに表示
  const fetchXML = () => {
    const xmlFilePath = getUserXmlRelativePath(); // XMLファイルのパスを指定
    fetch(xmlFilePath)
      .then(response => {
        if (response.status === 404) {
          return "";
        }
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
      updateHypothesisContextFromEntry(hypothesisBox);
      if (hypothesisBox) {
        console.log("仮説で使用されたキーワード:", selectedKeywords);
        console.log("仮説内容:", hypothesisData);
      }
    }
  });
});

// SCAMPERタグをクリックした際にその情報をコンソールに出力
function showScamperLoading() {
  const existing = document.querySelector(".scamper-loading-overlay");
  if (existing) return existing;

  const overlay = document.createElement("div");
  overlay.className = "scamper-loading-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "0";
  overlay.style.background = "rgba(0, 0, 0, 0.35)";
  overlay.style.zIndex = "10000";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  const message = document.createElement("div");
  message.className = "scamper-loading";
  message.textContent = "思考中...";
  message.style.background = "#eef6ff";
  message.style.border = "1px solid #b7d5f2";
  message.style.padding = "16px 28px";
  message.style.borderRadius = "12px";
  message.style.fontSize = "1.4em";
  message.style.fontWeight = "bold";
  message.style.color = "#1f4b74";
  message.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";

  overlay.appendChild(message);
  document.body.appendChild(overlay);
  return overlay;
}

function removeScamperLoading() {
  const existing = document.querySelector(".scamper-loading-overlay");
  if (existing) existing.remove();
}

function triggerScamperQuestion(targetTag, scamperLabel) {
  selectedScamper = scamperLabel;
  console.log("選択されたSCAMPERタグ:", scamperLabel);

  showScamperLoading();

  // SCAMPER選択時に毎回最新のタイトル値を取得
  window.theme = document.querySelector("#myTitle")?.value || "";

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

  console.log("生成されたプロンプト:", prompt);

  fetch(`${hypothesisApiBaseUrl}/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTPエラー: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      removeScamperLoading();
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = data.result;
      const items = Array.from(tempDiv.querySelectorAll("li"));
      if (items.length === 0) {
        alert("質問が取得できませんでした。");
        return;
      }
      console.log(data.result);
      const questionTexts = items.map((li) => li.textContent).filter(Boolean);
      if (questionTexts.length > 0) {
        logHypothesisAction(`仮説: 生成質問一覧 [${questionTexts.join(" / ")}]`);
      }

      const dialog = document.createElement("div");
      dialog.className = "question-dialog";
      dialog.style.position = "fixed";
      const minWidth = 320;
      let left = Math.floor(window.innerWidth * 0.2);
      let top = Math.floor(window.innerHeight * 0.5);
      const maxLeft = window.innerWidth - minWidth - 16;
      if (left > maxLeft) left = maxLeft;
      if (top > window.innerHeight - 200) top = window.innerHeight - 200;
      dialog.style.left = left + "px";
      dialog.style.top = top + "px";
      dialog.style.minWidth = minWidth + "px";

      const dragBar = document.createElement("div");
      dragBar.className = "question-dialog__header";
      dragBar.textContent = "質問を選択してください";
      dialog.appendChild(dragBar);

      const dialogBody = document.createElement("div");
      dialogBody.className = "question-dialog__body";
      dialog.appendChild(dialogBody);

      let isDragging = false;
      let dragOffsetX = 0;
      let dragOffsetY = 0;
      dragBar.addEventListener("mousedown", function (e) {
        isDragging = true;
        const rect = dialog.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        document.body.style.userSelect = "none";
      });
      document.addEventListener("mousemove", function (e) {
        if (!isDragging) return;
        let newLeft = e.clientX - dragOffsetX;
        let newTop = e.clientY - dragOffsetY;
        const maxLeft = window.innerWidth - minWidth - 16;
        if (newLeft < 0) newLeft = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < 0) newTop = 0;
        if (newTop > window.innerHeight - 100) newTop = window.innerHeight - 100;
        dialog.style.left = newLeft + "px";
        dialog.style.top = newTop + "px";
      });
      document.addEventListener("mouseup", function () {
        isDragging = false;
        document.body.style.userSelect = "";
      });

      items.forEach((li) => {
        const btn = document.createElement("button");
        btn.className = "question-dialog__option";
        btn.textContent = li.textContent;
        btn.onclick = () => {
          const existing = targetTag.parentNode.querySelector(".scamper-question-view");
          if (existing) existing.remove();
          const span = document.createElement("span");
          span.className = "scamper-question-view";
          span.textContent = li.textContent;
          span.style.marginLeft = "12px";
          span.style.background = "#ffffe0";
          span.style.border = "1px solid #ccc";
          span.style.padding = "2px 8px";
          span.style.borderRadius = "6px";
          span.style.fontSize = "0.95em";
          targetTag.insertAdjacentElement("afterend", span);
          logHypothesisAction(`仮説: 生成質問を選択 "${li.textContent}"`);
          document.body.removeChild(dialog);
        };
        dialogBody.appendChild(btn);
      });

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "キャンセル";
      closeBtn.className = "question-dialog__close";
      closeBtn.onclick = () => {
        document.body.removeChild(dialog);
      };
      dialogBody.appendChild(closeBtn);

      document.body.appendChild(dialog);
    })
    .catch((error) => {
      removeScamperLoading();
      alert("API呼び出し中にエラーが発生しました: " + error.message);
    });
}

// 取得したデータをまとめてコンソールに出力し、印刷
document.addEventListener("DOMContentLoaded", () => {
  window.theme = ""; // テーマをグローバル化
  xmlData = ""; // XMLデータ
  hypothesisData = ""; // 仮説内容
  selectedKeywords = ""; // 選んだキーワード
  selectedScamper = ""; // 選んだSCAMPER

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
    const xmlFilePath = getUserXmlRelativePath();
    fetch(xmlFilePath)
      .then(response => {
        if (response.status === 404) {
          return "";
        }
        if (!response.ok) {
          throw new Error(`HTTPエラー: ${response.status}`);
        }
        return response.text();
      })
      .then(xmlText => {
        xmlData = xmlText;
      })
      .catch(error => {
        if (!hasShownXmlFetchWarning) {
          hasShownXmlFetchWarning = true;
          console.warn("XMLファイルの取得中にエラーが発生しました:", error.message);
        }
      });
  };
  setInterval(fetchXML, 1000); // 1秒ごとに更新

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

});

const hypothesisApiHost = window.location.hostname;
const hypothesisApiBaseUrl = `http://${hypothesisApiHost}:8000`;