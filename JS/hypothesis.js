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
    title.innerText = "仮説を追加";
    container.appendChild(title); */

    // 仮説エントリを入れるラッパー（ここに複数の仮説を追加）
    var wrapper = document.createElement("div");
    wrapper.id = "hypothesisWrapper";
    wrapper.className = "hypothesis-wrapper";
    container.appendChild(wrapper);

    // 補助テキスト
    var help = document.createElement("div");
    help.className = "hypothesis-help-text";
    help.innerText = t(
      "hypothesis.helpText",
      {},
      "「仮説を追加」ボタンを押すとこの中に新しい仮説が追加されます。"
    );
    container.appendChild(help);
  }

  return container;
}

function logHypothesisAction(message) {
  if (typeof window.addSystemLog === "function") {
    window.addSystemLog(message);
  }
}

const hypothesisConfig = window.APP_CONFIG || {};
const hypothesisHost = hypothesisConfig.host || window.location.hostname || "127.0.0.1";
const hypothesisSaveBaseUrl =
  hypothesisConfig.saveXmlBaseUrl ||
  `http://${hypothesisHost}:${Number(hypothesisConfig.saveXmlPort || 3005)}`;
const hypothesisDbApiBaseUrl =
  hypothesisConfig.apiBaseUrl ||
  `http://${hypothesisHost}:${Number(hypothesisConfig.apiPort || 3000)}`;
const HYPOTHESIS_SNAPSHOT_DIR = "XML";
const HYPOTHESIS_LEGACY_SNAPSHOT_DIR = "JS/XML";
const ENABLE_LEGACY_HYPOTHESIS_LOOKUP = hypothesisConfig.enableLegacyHypothesisLookup === true;
const HYPOTHESIS_SNAPSHOT_DIRS = ENABLE_LEGACY_HYPOTHESIS_LOOKUP
  ? [HYPOTHESIS_SNAPSHOT_DIR, HYPOTHESIS_LEGACY_SNAPSHOT_DIR]
  : [HYPOTHESIS_SNAPSHOT_DIR];
let hypothesisSaveTimer = null;
let hypothesisSaveInFlight = false;
let hypothesisSaveQueued = false;
let lastSavedHypothesisFingerprint = "";
const HYPOTHESIS_MAX_FILE_PART_LENGTH = 24;
let hasShownHypothesisUserMissingWarning = false;
let hasShownXmlFetchWarning = false;

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

function getHypothesisUiLanguage() {
  if (window.APP_I18N && typeof window.APP_I18N.getLanguage === "function") {
    return window.APP_I18N.getLanguage();
  }
  const htmlLang = (document.documentElement.getAttribute("lang") || "").trim();
  return htmlLang || "ja";
}

function isHypothesisEnglishUi() {
  return String(getHypothesisUiLanguage()).toLowerCase().startsWith("en");
}

function buildScamperPrompt({
  theme,
  hypothesisText,
  keywords,
  scamperLabel,
  xmlSnapshot,
  useEnglishPrompt,
}) {
  if (useEnglishPrompt) {
    return `
        ## Task
        You are an assistant that supports learner activities in integrated inquiry learning.

        ## Context
        - The learner is exploring: [${theme}]
        - The learner proposed this hypothesis: [${hypothesisText}]
        - The hypothesis is based on these keywords: [${keywords}]
        - The learner's concept-map state is shown in this XML: [${xmlSnapshot}]

        ## Input
        - Expand the hypothesis from a SCAMPER perspective.
        - Generate questions based on SCAMPER [${scamperLabel}] to encourage idea expansion.

        ## Constraints
        - Questions should help produce hypotheses that can solve [${theme}].
        - If useful, implicitly suggest using other existing map keywords or adding new concepts.
        - Do not explicitly instruct what to add; guide only through questions.

        ## Language requirement
        - Output must be in English.
        - Avoid Japanese unless an untranslated proper noun is required.

        ## Output format
        - Provide about three questions.
        - Wrap each question with <li></li> tags.
        - Output only the list. No extra explanation.
      `;
  }

  return `
        ##タスク
        ・総合的な探究の時間における，学習者の活動を⽀援するシステム
        ##背景・文脈
        ・学習者は[${theme}]を目標に探究活動を行っている
        ・今，学習者は[${hypothesisText}]という仮説を[${keywords}]のキーワードを基に立案した
        ・また学習者が作成した概念マップによって読み取ることの出来，その学習者の理解状態は次のXMLファイルの通りである　[${xmlSnapshot}]
        ##入力
        ・この仮説に対して，SCAMPER法に基づく観点から仮説を発散させる
        ・あなたはSCAMPER法の[${scamperLabel}]に基づき，仮説を発散させることを促す質問を与えよ．
        ##条件
        ・[${theme}]という課題を解決しうるような仮説を生成することを⽬的とする
        ・仮説を発散させるうえで，概念マップ内の他のキーワードを使うことや，新たな概念を概念マップ内に追加させることで仮説の発散につながる場合はそれを暗に⽰唆した質問を⽣成せよ
        ・必ずしもそうしなくても良い
        ・何を追加するかや何を加えたら良いかなどは明⽰せず，あくまで質問をもとに促すようにせよ
        ##言語要件
        ・出力は日本語とすること
        ##出力形式
        ・ 条件に合う質問を，三つ程度提示せよ
        ・各項目は<li></li>タグで囲め
        ・リストのみでよい．その他の記述や説明は一切いらない
      `;
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
    const language = getCurrentThemeLanguage();
    const getRes = await fetch(
      `${hypothesisDbApiBaseUrl}/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(themeName)}?language=${encodeURIComponent(language)}`,
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
          language,
          content: mergedContent,
        }),
      }
    );
    if (putRes.status === 404) {
      if (!hasShownHypothesisUserMissingWarning) {
        hasShownHypothesisUserMissingWarning = true;
        alert(
          t(
            "alerts.hypothesisDbUserMissing",
            { userId },
            `ユーザー「${userId}」がDBに存在しないため、仮説のDB保存をスキップしました。\nログインし直して（auth_user / host）利用してください。`
          )
        );
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

function buildHypothesisSnapshotPath(dir, fileName) {
  const normalizedDir = String(dir || "").replace(/^\/+|\/+$/g, "");
  return `/${normalizedDir}/${encodeURIComponent(fileName)}`;
}

async function checkHypothesisSnapshotExistsInPrimaryDir(fileName) {
  try {
    const response = await fetch(
      `${hypothesisSaveBaseUrl}/xml-exists?filename=${encodeURIComponent(fileName)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return Boolean(payload && payload.exists);
  } catch (_error) {
    return null;
  }
}

async function fetchHypothesisSnapshotResponse(snapshotPath) {
  const response = await fetch(snapshotPath, { cache: "no-store" });
  if (response.ok) return response;
  if (response.status === 404) return null;
  throw new Error(`HTTP ${response.status}`);
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
    scheduleHypothesisSave();

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
    const entryId = entry.dataset.hypothesisEntryId;
    const confirmMsg = typeof t === 'function' ? t('confirms.deleteHypothesisNode', {}, '丮説と、対応する丮説構造化マップのノード（孰ノード含む）を削除します。\n本当によろしいですか？') : '丮説と、対応する丮説構造化マップのノード（孰ノード含む）を削除します。\n本当によろしいですか？';
    if (!confirm(confirmMsg)) return;

    if (entryId && typeof window.deleteMindmapNodeByEntryId === 'function') {
      window.deleteMindmapNodeByEntryId(entryId);
    }

    wrapper.removeChild(entry);
    updateHypothesisNumbers(wrapper);
    logHypothesisAction("丮説: 削除");
    scheduleHypothesisSave();
  };

  delBtn.addEventListener("click", onDeleteClick);
  delBtn.__hypothesisDeleteHandler = onDeleteClick;
}

function bindScamperTagDelete(tagLabel) {
  if (!tagLabel) return;

  if (typeof tagLabel.__scamperDeleteHandler === "function") {
    tagLabel.removeEventListener("contextmenu", tagLabel.__scamperDeleteHandler);
  }
  tagLabel.__scamperDeleteHandler = null;
}

function rebindHypothesisEntry(entry) {
  ensureHypothesisEntryId(entry);
  bindHypothesisEntrySelection(entry);

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
      const language = getCurrentThemeLanguage();
      const dbRes = await fetch(
        `${hypothesisDbApiBaseUrl}/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(themeName)}?language=${encodeURIComponent(language)}`,
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

    const candidateFileNames = [];
    const preferredFileName = getHypothesisStateFilename();
    const legacyFileName = getLegacyHypothesisStateFilename();
    candidateFileNames.push(preferredFileName);
    if (legacyFileName !== preferredFileName) {
      candidateFileNames.push(legacyFileName);
    }

    let res = null;
    for (let i = 0; i < candidateFileNames.length; i += 1) {
      const fileName = candidateFileNames[i];
      const existsInPrimaryDir = await checkHypothesisSnapshotExistsInPrimaryDir(fileName);
      if (existsInPrimaryDir === false && !ENABLE_LEGACY_HYPOTHESIS_LOOKUP) {
        continue;
      }

      for (let j = 0; j < HYPOTHESIS_SNAPSHOT_DIRS.length; j += 1) {
        const dir = HYPOTHESIS_SNAPSHOT_DIRS[j];
        if (dir === HYPOTHESIS_SNAPSHOT_DIR && existsInPrimaryDir === false) {
          continue;
        }
        const snapshotPath = buildHypothesisSnapshotPath(dir, fileName);
        res = await fetchHypothesisSnapshotResponse(snapshotPath);
        if (res) break;
      }

      if (res) break;
    }

    if (!res) return;

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

// 仮説入力とキーワード選択を同時に行うダイアログを表示（仮説関係性マップの「仮説を立案」メニュー用）
function showHypothesisAndKeywordDialog(options) {
  options = options || {};
  const parentMindmapKey = options.parentMindmapKey;
  const allNodes =
    window.nodes && typeof window.nodes.get === "function" ? window.nodes.get() : [];

  // オーバーレイを作成
  const overlay = document.createElement("div");
  overlay.className = "hypothesis-keyword-dialog-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "10000";

  // ダイアログを作成
  const dialog = document.createElement("div");
  dialog.className = "hypothesis-keyword-dialog";
  dialog.style.backgroundColor = "white";
  dialog.style.borderRadius = "8px";
  dialog.style.padding = "20px";
  dialog.style.maxWidth = "500px";
  dialog.style.width = "90%";
  dialog.style.maxHeight = "80vh";
  dialog.style.display = "flex";
  dialog.style.flexDirection = "column";
  dialog.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
  dialog.style.boxSizing = "border-box";
  dialog.style.overflow = "hidden";

  // タイトル
  const title = document.createElement("h3");
  title.style.marginTop = "0";
  title.style.marginBottom = "15px";
  title.style.fontSize = "16px";
  title.style.fontWeight = "bold";
  title.innerText = t("labels.createHypothesis", {}, "新しい仮説を作成");
  dialog.appendChild(title);

  // 仮説入力フィールド
  const hypothesisLabel = document.createElement("label");
  hypothesisLabel.style.display = "block";
  hypothesisLabel.style.marginBottom = "8px";
  hypothesisLabel.style.fontSize = "14px";
  hypothesisLabel.style.fontWeight = "bold";
  hypothesisLabel.innerText = t("labels.hypothesisContent", {}, "仮説の内容");
  dialog.appendChild(hypothesisLabel);

  const hypothesisTextarea = document.createElement("textarea");
  hypothesisTextarea.className = "hypothesis-input-textarea";
  hypothesisTextarea.style.width = "100%";
  hypothesisTextarea.style.minHeight = "80px";
  hypothesisTextarea.style.marginBottom = "15px";
  hypothesisTextarea.style.padding = "10px";
  hypothesisTextarea.style.border = "1px solid #ddd";
  hypothesisTextarea.style.borderRadius = "4px";
  hypothesisTextarea.style.fontFamily = "inherit";
  hypothesisTextarea.style.fontSize = "14px";
  hypothesisTextarea.style.boxSizing = "border-box";
  hypothesisTextarea.style.maxWidth = "100%";
  hypothesisTextarea.placeholder = t("placeholders.hypothesisInput", {}, "ここに仮説を入力してください");
  dialog.appendChild(hypothesisTextarea);

  // キーワード選択ラベル
  const keywordLabel = document.createElement("label");
  keywordLabel.style.display = "block";
  keywordLabel.style.marginBottom = "8px";
  keywordLabel.style.fontSize = "14px";
  keywordLabel.style.fontWeight = "bold";
  keywordLabel.innerText = t("labels.selectKeywords", {}, "キーワードを選択（任意）");
  dialog.appendChild(keywordLabel);

  // チェックボックスリスト（スクロール可能）
  const listContainer = document.createElement("div");
  listContainer.style.flex = "1";
  listContainer.style.overflowY = "auto";
  listContainer.style.marginBottom = "15px";
  listContainer.style.border = "1px solid #ddd";
  listContainer.style.borderRadius = "4px";
  listContainer.style.paddingTop = "10px";
  listContainer.style.paddingBottom = "10px";
  listContainer.style.paddingLeft = "10px";
  listContainer.style.paddingRight = "10px";
  listContainer.style.maxHeight = "200px";
  listContainer.style.boxSizing = "border-box";

  const selectedNodeIds = new Set(
    (Array.isArray(options.defaultNodeIds) ? options.defaultNodeIds : []).map(function (id) {
      return String(id);
    })
  );
  const defaultKeywordLabelSet = new Set(normalizeKeywordLabels(options.defaultKeywordLabels));

  if (defaultKeywordLabelSet.size > 0) {
    allNodes.forEach(function (node) {
      if (node && defaultKeywordLabelSet.has(String(node.label || "").trim())) {
        selectedNodeIds.add(String(node.id));
      }
    });
  }

  allNodes.forEach((node) => {
    const checkboxWrapper = document.createElement("div");
    checkboxWrapper.style.marginBottom = "8px";
    checkboxWrapper.style.display = "flex";
    checkboxWrapper.style.alignItems = "center";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(node.id);
    checkbox.checked = selectedNodeIds.has(String(node.id));
    checkbox.style.marginRight = "8px";
    checkbox.addEventListener("change", function () {
      if (this.checked) {
        selectedNodeIds.add(String(node.id));
      } else {
        selectedNodeIds.delete(String(node.id));
      }
    });

    const label = document.createElement("label");
    label.style.flex = "1";
    label.style.cursor = "pointer";
    label.style.margin = "0";
    label.style.fontSize = "14px";
    label.innerText = String(node.label || t("labels.untitledNode", {}, "(無題ノード)"));
    label.addEventListener("click", function () {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });

    checkboxWrapper.appendChild(checkbox);
    checkboxWrapper.appendChild(label);
    listContainer.appendChild(checkboxWrapper);
  });

  dialog.appendChild(listContainer);

  // ボタン行
  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "10px";
  buttonRow.style.justifyContent = "flex-end";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.innerText = t("buttons.cancel", {}, "キャンセル");
  cancelBtn.style.padding = "8px 16px";
  cancelBtn.style.borderRadius = "4px";
  cancelBtn.style.border = "1px solid #ccc";
  cancelBtn.style.backgroundColor = "#f5f5f5";
  cancelBtn.style.cursor = "pointer";
  cancelBtn.addEventListener("click", function () {
    document.body.removeChild(overlay);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.innerText = t("buttons.add", {}, "追加");
  addBtn.style.padding = "8px 16px";
  addBtn.style.borderRadius = "4px";
  addBtn.style.border = "none";
  addBtn.style.backgroundColor = "#007bff";
  addBtn.style.color = "white";
  addBtn.style.cursor = "pointer";
  addBtn.addEventListener("click", function () {
    const hypothesisText = hypothesisTextarea.value.trim();
    if (!hypothesisText) {
      alert(t("alerts.enterHypothesis", {}, "仮説を入力してください。"));
      return;
    }

    const selectedIds = Array.from(selectedNodeIds).map((id) => {
      const numericId = Number(id);
      return Number.isNaN(numericId) ? id : numericId;
    });

    // キーワードラベルを取得
    const selectedKeywordLabels = selectedIds.map((id) => {
      const node = window.nodes && typeof window.nodes.get === "function" ? window.nodes.get(id) : null;
      return node ? String(node.label || "") : "";
    }).filter(Boolean);

    const entryId = createHypothesisEntryId();

    if (parentMindmapKey !== undefined && parentMindmapKey !== null) {
      if (typeof window.addMindmapChild !== "function") {
        alert(t("alerts.mindmapUnavailable", {}, "マインドマップが利用できません。ページを再読み込みしてください。"));
        return;
      }

      const success = window.addMindmapChild(parentMindmapKey, hypothesisText, {
        basedNodeIds: selectedIds,
        basedKeywordLabels: selectedKeywordLabels,
        hypothesisEntryId: entryId,
      });
      if (!success) {
        alert(t("alerts.mindmapNodeAddFailed", {}, "ノードの追加に失敗しました。"));
        return;
      }
    }

    // 新しいエントリを追加（選択されたキーワードで）
    addHypothesisEntry(selectedIds, {
      hypothesisText,
      keywordLabels: selectedKeywordLabels,
      entryId,
    });

    // マインドマップに仮説ノードを追加
    if (
      (parentMindmapKey === undefined || parentMindmapKey === null) &&
      typeof window.addHypothesisToMindmap === "function"
    ) {
      window.addHypothesisToMindmap(hypothesisText, selectedKeywordLabels);
    }

    document.body.removeChild(overlay);
    logHypothesisAction(`仮説: マップから仮説追加 (${selectedIds.length}個のキーワードを選択) "${hypothesisText}"`);
    clearSelectionAfterHypothesisCreate();
  });

  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(addBtn);
  dialog.appendChild(buttonRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  console.log("仮説・キーワード統合ダイアログがDOMに追加されました");
}

var hypothesisEntryIdSequence = 0;

function createHypothesisEntryId() {
  hypothesisEntryIdSequence += 1;
  return "hypothesis-entry-" + Date.now() + "-" + hypothesisEntryIdSequence;
}

function ensureHypothesisEntryId(entry, preferredId) {
  if (!entry || !entry.dataset) return "";
  if (preferredId) {
    entry.dataset.hypothesisEntryId = String(preferredId);
  }
  if (!entry.dataset.hypothesisEntryId) {
    entry.dataset.hypothesisEntryId = createHypothesisEntryId();
  }
  return entry.dataset.hypothesisEntryId;
}

function normalizeKeywordLabels(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map(function (label) {
      return String(label || "").trim();
    })
    .filter(Boolean);
}

function getKeywordLabelsFromNodeIds(nodeIds) {
  var nodeDataSet = window.nodes;
  return (Array.isArray(nodeIds) ? nodeIds : []).map(function (id) {
    var n = nodeDataSet && typeof nodeDataSet.get === "function" ? nodeDataSet.get(id) : null;
    return n ? n.label : t("labels.undefined", {}, "(未定義)");
  });
}

function findHypothesisEntryById(entryId) {
  if (!entryId) return null;
  var entries = document.querySelectorAll(".hypothesis-box");
  for (var i = 0; i < entries.length; i += 1) {
    if (entries[i].dataset && entries[i].dataset.hypothesisEntryId === String(entryId)) {
      return entries[i];
    }
  }
  return null;
}

function findHypothesisEntryByText(text) {
  var wanted = String(text || "").trim();
  if (!wanted) return null;
  var entries = document.querySelectorAll(".hypothesis-box");
  for (var i = 0; i < entries.length; i += 1) {
    var textarea = entries[i].querySelector("textarea.hypothesis-text");
    if (textarea && String(textarea.value || "").trim() === wanted) {
      return entries[i];
    }
  }
  return null;
}

// 仮説エントリを追加する（選択キーワードを基に1エントリ追加）
function addHypothesisEntry(nodeIds, options) {
  nodeIds = Array.isArray(nodeIds) ? nodeIds : [];
  options = options || {};
  var container = ensureHypothesisContainer();
  var wrapper = container.querySelector("#hypothesisWrapper");
  if (!wrapper) return null;

  // 選択キーワードラベル取得（先頭リストは表示しない）
  var keywordLabels = normalizeKeywordLabels(options.keywordLabels);
  if (keywordLabels.length === 0) {
    keywordLabels = getKeywordLabelsFromNodeIds(nodeIds);
  }

  // エントリ作成
  var entry = document.createElement("div");
  entry.className = "hypothesis-box";
  entry.dataset.basedNodeIds = JSON.stringify(nodeIds);
  entry.dataset.basedKeywordLabels = JSON.stringify(keywordLabels);
  ensureHypothesisEntryId(entry, options.entryId);

  var hdr = document.createElement("div");
  hdr.className = "hypothesis-box-header";
  hdr.innerText = t("labels.hypothesisNumber", { index: wrapper.children.length + 1 }, "仮説 #" + (wrapper.children.length + 1));
  entry.appendChild(hdr);

  var sub = document.createElement("div");
  sub.className = "hypothesis-meta-text";
  // 各エントリの下にのみ基づくキーワードを表示（先頭の一覧は削除）
  sub.innerText = t(
    "labels.basedKeywords",
    { keywords: keywordLabels.join("、") },
    "基づくキーワード: " + keywordLabels.join("、")
  );
  entry.appendChild(sub);

  var body = document.createElement("div");
  body.className = "hypothesis-box-body";
  var ta = document.createElement("textarea");
  ta.className = "hypothesis-text";
  ta.placeholder = t("placeholders.hypothesisInput", {}, "ここに仮説を入力");
  ta.value = options.hypothesisText ? String(options.hypothesisText) : "";
  attachHypothesisTextareaLogging(ta, function (current) {
    return `仮説: 入力 "${current}"`;
  });
  body.appendChild(ta);
  entry.appendChild(body);

  // 操作ボタン（削除）
  var controls = document.createElement("div");
  controls.className = "hypothesis-controls";
  var delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.innerText = t("buttons.delete", {}, "削除");
  delBtn.className = "hypothesis-delete-btn";
  controls.appendChild(delBtn);
  entry.appendChild(controls);
  bindDeleteButton(entry, wrapper);

  wrapper.appendChild(entry);
  bindHypothesisEntrySelection(entry);
  enableScamperOnEntry(entry);
  entry.scrollIntoView({ behavior: "smooth" });
  logHypothesisAction(`仮説: 追加 (基づくキーワード: ${keywordLabels.join("、")})`);
  scheduleHypothesisSave();
  return entry;
}

// 表示されている仮説の番号を更新
function updateHypothesisNumbers(wrapper) {
  for (var i = 0; i < wrapper.children.length; i++) {
    var h = wrapper.children[i].querySelector(".hypothesis-box-header");
    if (h) h.innerText = t("labels.hypothesisNumber", { index: i + 1 }, "仮説 #" + (i + 1));
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

function dedupeNodeIds(ids) {
  var unique = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : []).map(function (id) {
        return String(id);
      })
    )
  );

  return unique.map(function (id) {
    var numericId = Number(id);
    return Number.isNaN(numericId) ? id : numericId;
  });
}

function findNodeIdsByLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) return [];
  if (!window.nodes || typeof window.nodes.get !== "function") return [];

  var wanted = labels
    .map(function (label) {
      return String(label || "").trim();
    })
    .filter(function (label) {
      return label.length > 0;
    });
  if (wanted.length === 0) return [];

  var wantedSet = new Set(wanted);
  var candidates = window.nodes.get();
  var ids = [];
  candidates.forEach(function (node) {
    var labelsToMatch = [];
    var nodeLabel = String(node && node.label ? node.label : "").trim();
    if (nodeLabel) labelsToMatch.push(nodeLabel);

    if (node && node.i18nLabels && typeof node.i18nLabels === "object") {
      Object.keys(node.i18nLabels).forEach(function (langKey) {
        var localized = String(node.i18nLabels[langKey] || "").trim();
        if (localized) labelsToMatch.push(localized);
      });
    }

    var matched = labelsToMatch.some(function (label) {
      return wantedSet.has(label);
    });
    if (matched) {
      ids.push(node.id);
    }
  });

  return dedupeNodeIds(ids);
}

function parseKeywordLabelsFromEntry(entry) {
  if (!entry) return [];

  if (entry.dataset && entry.dataset.basedKeywordLabels) {
    try {
      var parsed = JSON.parse(entry.dataset.basedKeywordLabels);
      if (Array.isArray(parsed)) {
        return parsed
          .map(function (label) {
            return String(label || "").trim();
          })
          .filter(Boolean);
      }
    } catch (_e) {
      // noop
    }
  }

  var meta = entry.querySelector(".hypothesis-meta-text");
  var raw = meta ? String(meta.innerText || "").trim() : "";
  if (!raw) return [];

  raw = raw.replace(/^.*?[\uFF1A:]\s*/, "");
  return raw
    .split(/[\u3001,]/)
    .map(function (label) {
      return String(label || "").trim();
    })
    .filter(Boolean);
}

function getNodeIdsForHypothesisEntry(entry) {
  if (!entry) return [];

  if (entry.dataset && entry.dataset.basedNodeIds) {
    try {
      var parsed = JSON.parse(entry.dataset.basedNodeIds);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return dedupeNodeIds(parsed);
      }
    } catch (_e) {
      // noop
    }
  }

  return findNodeIdsByLabels(parseKeywordLabelsFromEntry(entry));
}

function filterExistingNodeIds(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return [];
  if (!window.nodes || typeof window.nodes.get !== "function") return [];

  var existingMap = new Map();
  window.nodes.getIds().forEach(function (existingId) {
    existingMap.set(String(existingId), existingId);
  });

  var resolved = [];
  nodeIds.forEach(function (id) {
    var resolvedId = existingMap.get(String(id));
    if (resolvedId !== undefined) {
      resolved.push(resolvedId);
    }
  });

  return dedupeNodeIds(resolved);
}

function setHypothesisEntryActive(entry) {
  var wrapper = entry ? entry.parentElement : null;
  if (!wrapper) return;

  wrapper.querySelectorAll(".hypothesis-box.is-active").forEach(function (box) {
    if (box !== entry) {
      box.classList.remove("is-active");
    }
  });

  entry.classList.add("is-active");
}

function getHypothesisEntryText(entry) {
  if (!entry) return "";
  var textarea = entry.querySelector("textarea.hypothesis-text");
  return textarea ? String(textarea.value || "").trim() : "";
}

function highlightMindmapNodeFromHypothesisEntry(entry) {
  if (!entry || typeof window.highlightMindmapHypothesisNode !== "function") return;
  window.highlightMindmapHypothesisNode(
    ensureHypothesisEntryId(entry),
    getHypothesisEntryText(entry)
  );
}

window.activateHypothesisEntryFromMindmap = function (entryId, hypothesisText) {
  var entry = findHypothesisEntryById(entryId) || findHypothesisEntryByText(hypothesisText);
  if (!entry) return false;

  setHypothesisEntryActive(entry);
  entry.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return true;
};

function selectNodesFromHypothesisEntry(entry) {
  highlightMindmapNodeFromHypothesisEntry(entry);

  var nodeIds = filterExistingNodeIds(getNodeIdsForHypothesisEntry(entry));
  if (nodeIds.length === 0) {
    if (typeof window.clearNodeSelection === "function") {
      window.clearNodeSelection();
    }
    return;
  }

  if (typeof window.setSelectedNodes === "function") {
    window.setSelectedNodes(nodeIds);
    return;
  }

  if (window.network && typeof window.network.selectNodes === "function") {
    window.network.selectNodes(nodeIds);
  }

  window.selectedNodes = nodeIds.slice();
  if (typeof window.highlightNodes === "function") {
    window.highlightNodes(nodeIds);
  }
  if (typeof window.updateCopiedContent === "function") {
    window.updateCopiedContent(nodeIds);
  }
}

function bindHypothesisEntrySelection(entry) {
  if (!entry || entry.dataset.boundHypothesisSelect === "true") return;

  entry.addEventListener("click", function () {
    setHypothesisEntryActive(entry);
    selectNodesFromHypothesisEntry(entry);
  });

  entry.dataset.boundHypothesisSelect = "true";
}

function clearActiveHypothesisEntries() {
  var activeBoxes = document.querySelectorAll(".hypothesis-box.is-active");
  if (!activeBoxes || activeBoxes.length === 0) {
    return false;
  }

  activeBoxes.forEach(function (box) {
    box.classList.remove("is-active");
  });

  return true;
}

window.clearHypothesisEntryActivation = function (options) {
  options = options || {};
  var cleared = clearActiveHypothesisEntries();

  if (options.clearKeywordSelection !== false) {
    if (typeof window.clearNodeSelection === "function") {
      window.clearNodeSelection();
    } else if (typeof window.setSelectedNodes === "function") {
      window.setSelectedNodes([]);
    }
  }

  return cleared;
};

function bindOutsideClickToClearHypothesisActive() {
  if (document.body && document.body.dataset.boundHypothesisOutsideClear === "true") {
    return;
  }

  document.addEventListener("click", function (event) {
    var target = event && event.target ? event.target : null;
    if (target && typeof target.closest === "function" && target.closest(".hypothesis-box")) {
      return;
    }

    var clickedInMindmap = target && typeof target.closest === "function" && target.closest("#myDiagramDiv");
    if (clickedInMindmap) {
      return;
    }

    var cleared = clearActiveHypothesisEntries();
    if (!cleared) return;

    if (typeof window.clearMindmapHypothesisHighlight === "function") {
      window.clearMindmapHypothesisHighlight();
    }

    var clickedInNetwork = target && typeof target.closest === "function" && target.closest("#mynetwork");
    if (clickedInNetwork) {
      return;
    }

    if (typeof window.clearNodeSelection === "function") {
      window.clearNodeSelection();
    } else if (typeof window.setSelectedNodes === "function") {
      window.setSelectedNodes([]);
    }
  });

  if (document.body) {
    document.body.dataset.boundHypothesisOutsideClear = "true";
  }
}

function bindHypothesisWrapperSelectionDelegation() {
  var container = ensureHypothesisContainer();
  var wrapper = container ? container.querySelector("#hypothesisWrapper") : null;
  if (!wrapper || wrapper.dataset.boundHypothesisSelectDelegation === "true") {
    return;
  }

  wrapper.addEventListener("click", function (event) {
    var target = event && event.target ? event.target : null;
    var entry = target && typeof target.closest === "function" ? target.closest(".hypothesis-box") : null;
    if (!entry || !wrapper.contains(entry)) return;

    setHypothesisEntryActive(entry);
    selectNodesFromHypothesisEntry(entry);
  });

  wrapper.dataset.boundHypothesisSelectDelegation = "true";
}

function clearSelectionAfterHypothesisCreate() {
  if (typeof window.clearNodeSelection === "function") {
    window.clearNodeSelection();
    return;
  }

  if (window.network && typeof window.network.unselectAll === "function") {
    window.network.unselectAll();
  }
  if (Array.isArray(window.selectedNodes)) {
    window.selectedNodes = [];
  }
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
      alert(t("alerts.selectAtLeastOneNode", {}, "少なくとも1つのノードを選択してください。"));
      return;
    }
    addHypothesisEntry(currentSelectedNodes);
    clearSelectionAfterHypothesisCreate();
  } catch (error) {
    console.error("仮説を追加ボタン処理でエラーが発生しました:", error);
    alert(t("alerts.hypothesisProcessFailed", {}, "仮説追加の処理中にエラーが発生しました。ページを再読み込みしてください。"));
  }
};

// DOM が読み込まれたら仮説コンテナを初期化し，ボタンにリスナを登録する
document.addEventListener("DOMContentLoaded", function () {
  ensureHypothesisContainer();
  restoreHypothesisState();
  bindCreateHypothesisButton();
  bindHypothesisWrapperSelectionDelegation();
  bindOutsideClickToClearHypothesisActive();
});

if (document.readyState !== "loading") {
  bindCreateHypothesisButton();
  bindHypothesisWrapperSelectionDelegation();
  bindOutsideClickToClearHypothesisActive();
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
  { key: "Substitute", label: t("scamper.substitute", {}, "置換 (Substitute)") },
  { key: "Combine", label: t("scamper.combine", {}, "結合 (Combine)") },
  { key: "Adapt", label: t("scamper.adapt", {}, "適応 (Adapt)") },
  { key: "Modify", label: t("scamper.modify", {}, "修正 (Modify)") },
  { key: "PutToOtherUse", label: t("scamper.putToOtherUse", {}, "転用 (Put to other use)") },
  { key: "Eliminate", label: t("scamper.eliminate", {}, "削除 (Eliminate)") },
  { key: "Reverse", label: t("scamper.reverse", {}, "再構成 (Reverse)") }
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
  const baseKeywords = keywordElement ? keywordElement.innerText : t("labels.noKeywords", {}, "(キーワードなし)");
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
    alert(t("alerts.enterHypothesisToAdd", {}, "追加する仮説の内容を入力してください。"));
    return;
  }

  if (typeof window.getMindmapNodes !== "function" || typeof window.addMindmapChild !== "function") {
    alert(t("alerts.mindmapUnavailable", {}, "マインドマップが利用できません。ページを再読み込みしてください。"));
    return;
  }

  const mindmapNodes = window.getMindmapNodes();
  if (!mindmapNodes || mindmapNodes.length === 0) {
    alert(t("alerts.noMindmapParent", {}, "マインドマップに親ノードがありません。"));
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "mindmap-overlay";

  const dialog = document.createElement("div");
  dialog.className = "mindmap-dialog";
  dialog.style.top = "50%";
  dialog.style.left = "50%";
  dialog.style.transform = "translate(-50%, -50%)";

  const title = document.createElement("h3");
  title.className = "mindmap-dialog-title";
  title.innerText = t("labels.mapNodeAddTitle", {}, "マインドマップにノードを追加");
  dialog.appendChild(title);

  const parentLabel = document.createElement("label");
  parentLabel.className = "mindmap-dialog-label";
  parentLabel.innerText = t("labels.selectParentNode", {}, "親ノードを選択");
  dialog.appendChild(parentLabel);

  const select = document.createElement("select");
  select.className = "mindmap-dialog-select";

  mindmapNodes.forEach((node, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    const prefix = node.parent == null ? t("labels.rootPrefix", {}, "(ルート)") : "";
    option.innerText = `${prefix}${node.text || t("labels.untitledNode", {}, "(無題ノード)")}`;
    select.appendChild(option);
  });

  dialog.appendChild(select);

  const textLabel = document.createElement("label");
  textLabel.className = "mindmap-dialog-label";
  textLabel.innerText = t("labels.hypothesisToAdd", {}, "追加する仮説");
  dialog.appendChild(textLabel);

  const textArea = document.createElement("textarea");
  textArea.className = "mindmap-dialog-textarea";
  textArea.readOnly = true;
  textArea.value = candidateText;
  dialog.appendChild(textArea);

  const buttonRow = document.createElement("div");
  buttonRow.className = "mindmap-dialog-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "mindmap-dialog-cancel";
  cancelBtn.innerText = t("buttons.cancel", {}, "キャンセル");
  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "mindmap-dialog-confirm";
  addBtn.innerText = t("buttons.add", {}, "追加");
  addBtn.addEventListener("click", () => {
    const trimmed = textArea.value.trim();
    if (!trimmed) {
      alert(t("alerts.emptyHypothesis", {}, "仮説が空です。"));
      return;
    }

    const selectedIndex = parseInt(select.value, 10);
    const parentNode = mindmapNodes[selectedIndex] || mindmapNodes[0];
    const success = window.addMindmapChild(parentNode.key, trimmed, {
      basedNodeIds: getNodeIdsForHypothesisEntry(entry),
      basedKeywordLabels: parseKeywordLabelsFromEntry(entry),
      hypothesisEntryId: ensureHypothesisEntryId(entry),
    });
    if (!success) {
      alert(t("alerts.mindmapNodeAddFailed", {}, "ノードの追加に失敗しました。"));
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

  const addNodeBtn = document.createElement("button");
  addNodeBtn.type = "button";
  addNodeBtn.className = "hypothesis-action-button add-node-button";
  addNodeBtn.innerText = t("buttons.addNode", {}, "仮説を追加");
  addNodeBtn.addEventListener("click", function () {
    if (!targetTextarea.value.trim()) {
      alert(t("alerts.enterHypothesis", {}, "仮説を入力してください。"));
      return;
    }
    addNodeToNetwork(entry, targetTextarea);
  });

  const scamperBtn = document.createElement("button");
  scamperBtn.type = "button";
  scamperBtn.className = "hypothesis-action-button scamper-button";
  scamperBtn.innerText = t("buttons.expandHypothesis", {}, "仮説を発散");
  scamperBtn.addEventListener("click", function (e) {
    e.preventDefault();
    if (!targetTextarea.value.trim()) {
      alert(t("alerts.enterHypothesis", {}, "仮説を入力してください。"));
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

  if (parentContainer && parentContainer.classList.contains("scamper-tag-container")) {
    const deleteScamperBtn = document.createElement("button");
    deleteScamperBtn.type = "button";
    deleteScamperBtn.className = "hypothesis-action-button scamper-delete-button";
    deleteScamperBtn.innerText = t("buttons.delete", {}, "削除");
    deleteScamperBtn.addEventListener("click", function (e) {
      e.preventDefault();

      const tagLabel = parentContainer.querySelector(".scamper-tag");
      const tagText = tagLabel ? tagLabel.innerText : optionLabel || "SCAMPER";
      const confirmDelete = confirm(
        t("confirms.deleteTag", { tag: tagText }, `「${tagText}」タグを削除しますか？`)
      );
      if (!confirmDelete) return;

      if (tagLabel) {
        removeScamperEntryByTag(tagLabel);
        return;
      }

      if (parentContainer.parentNode) {
        parentContainer.parentNode.removeChild(parentContainer);
        logHypothesisAction("仮説: SCAMPER選択キャンセルで入力欄を削除");
        scheduleHypothesisSave();
      }
    });

    actionBar.appendChild(deleteScamperBtn);
  }

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
      return t("scamper.templateSubstitute", {}, "何かを別のもので置き換えることで新しい解決策が得られるか検討する。");
    case "Combine":
      return t("scamper.templateCombine", {}, "他の要素と結合して性能や価値を高められないか検討する。");
    case "Adapt":
      return t("scamper.templateAdapt", {}, "他分野のアイデアを適用できないか検討する。");
    case "Modify":
      return t("scamper.templateModify", {}, "形状・大きさ・性質を変更して改善できないか検討する。");
    case "PutToOtherUse":
      return t("scamper.templatePutToOtherUse", {}, "別用途に転用することで新たな価値が生まれないか検討する。");
    case "Eliminate":
      return t("scamper.templateEliminate", {}, "不要な要素を削除して簡素化やコスト削減が図れないか検討する。");
    case "Reverse":
      return t("scamper.templateReverse", {}, "順序や役割を入れ替えることで新しい発想が生まれないか検討する。");
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
    entry.insertBefore(tagWrap, entry.querySelector(".hypothesis-box-body").nextSibling);
  }

  // タグとテキストボックスをコンテナに追加
  var tagContainer = document.createElement("div");
  tagContainer.className = "scamper-tag-container";
  if (parentContainer) {
    tagContainer.classList.add("is-nested");
  }

  var tagLabel = document.createElement("span");
  tagLabel.className = "scamper-tag";
  tagLabel.dataset.key = option.key;
  tagLabel.innerText = option.label;

  var editBox = document.createElement("textarea");
  editBox.className = "scamper-edit-box";
  editBox.placeholder = t("placeholders.scamperInput", {}, "発散させた仮説を記入してください");
  attachHypothesisTextareaLogging(editBox, function (current) {
    return `仮説: SCAMPER入力 (${option.label}) "${current}"`;
  });

  // 旧右クリック削除ハンドラを無効化
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
async function findExistingHypothesisKeywordNode(keyword) {
  if (typeof window.findExistingNodeByLabel === "function") {
    try {
      const resolved = await window.findExistingNodeByLabel(keyword);
      if (resolved) return resolved;
    } catch (error) {
      console.warn("findExistingNodeByLabel failed:", error);
    }
  }

  const exactMatched = nodes.get({
    filter: function (node) {
      return String(node.label || "").trim() === String(keyword || "").trim();
    }
  });
  return exactMatched.length > 0 ? exactMatched[0] : null;
}

async function handleKeywordClick(keyword) {
    const normalizedKeyword = String(keyword || "").trim();
    if (!normalizedKeyword) return;
    console.log(`クリックされたキーワード: ${normalizedKeyword}`);

    // ノードが既に存在するかチェック（表記ゆれを含む）
    const existingNode = await findExistingHypothesisKeywordNode(normalizedKeyword);

    if (!existingNode) {
        // 新しいノードを作成
      var position = typeof window.getNonOverlappingNodePosition === "function"
        ? window.getNonOverlappingNodePosition()
        : network.getViewPosition();
      var newId = typeof window.getNextNumericNodeId === "function"
        ? window.getNextNumericNodeId()
        : (function () {
          var ids = nodes.getIds();
          var maxId = 0;
          ids.forEach(function (id) {
            var numericId = Number(id);
            if (Number.isInteger(numericId) && numericId > maxId) {
              maxId = numericId;
            }
          });
          return maxId + 1;
        })();
        var newNode = {
        id: newId,
            label: normalizedKeyword,
          nodeType: "keyword",
          x: position.x,
          y: position.y,
        };
        nodes.add(newNode); // ノードを追加
      if (typeof window.emphasizeNodeTemporarily === "function") {
        window.emphasizeNodeTemporarily(newNode.id);
      }
      logHypothesisAction(`キーワード: ノード追加 label="${normalizedKeyword}"`);
        console.log(`キーワード "${normalizedKeyword}" をノードとして追加しました。`);
    } else {
      if (typeof window.focusAndEmphasizeNode === "function") {
        window.focusAndEmphasizeNode(existingNode.id);
      } else if (typeof window.emphasizeNodeTemporarily === "function") {
        window.emphasizeNodeTemporarily(existingNode.id);
      }
        console.log(`キーワード "${normalizedKeyword}" のノードは既に存在しています。`);
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
  return buildHypothesisSnapshotPath(HYPOTHESIS_SNAPSHOT_DIR, filename);
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

  // XML監視は下側の集約ロジックで実施する（重複ポーリング防止）
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

  const message = document.createElement("div");
  message.className = "scamper-loading";
  message.textContent = t("loading.thinking", {}, "思考中...");

  overlay.appendChild(message);
  document.body.appendChild(overlay);
  return overlay;
}

function removeScamperLoading() {
  const existing = document.querySelector(".scamper-loading-overlay");
  if (existing) existing.remove();
}

function removeScamperEntryByTag(targetTag) {
  if (!targetTag) return;
  const container = targetTag.closest(".scamper-tag-container");
  if (!container || !container.parentNode) return;

  const parent = container.parentNode;
  parent.removeChild(container);
  if (parent.classList && parent.classList.contains("scamper-tags") && parent.children.length === 0) {
    parent.remove();
  }

  logHypothesisAction("仮説: SCAMPER選択キャンセルで入力欄を削除");
  scheduleHypothesisSave();
}

function triggerScamperQuestion(targetTag, scamperLabel) {
  selectedScamper = scamperLabel;
  console.log("選択されたSCAMPERタグ:", scamperLabel);

  showScamperLoading();

  // SCAMPER選択時に毎回最新のタイトル値を取得
  window.theme = document.querySelector("#myTitle")?.value || "";

  const prompt = buildScamperPrompt({
    theme: window.theme,
    hypothesisText: hypothesisData,
    keywords: selectedKeywords,
    scamperLabel: selectedScamper,
    xmlSnapshot: xmlData,
    useEnglishPrompt: isHypothesisEnglishUi(),
  });

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
        alert(t("alerts.questionFetchFailed", {}, "質問が取得できませんでした。"));
        return;
      }
      console.log(data.result);
      const questionTexts = items.map((li) => li.textContent).filter(Boolean);
      if (questionTexts.length > 0) {
        logHypothesisAction(`仮説: 生成質問一覧 [${questionTexts.join(" / ")}]`);
      }

      const dialog = document.createElement("div");
      dialog.className = "question-dialog";
      const minWidth = 320;
      let left = Math.floor(window.innerWidth * 0.2);
      let top = Math.floor(window.innerHeight * 0.5);
      const maxLeft = window.innerWidth - minWidth - 16;
      if (left > maxLeft) left = maxLeft;
      if (top > window.innerHeight - 200) top = window.innerHeight - 200;
      dialog.style.left = left + "px";
      dialog.style.top = top + "px";

      const dragBar = document.createElement("div");
      dragBar.className = "question-dialog__header";
      dragBar.textContent = t("labels.selectQuestion", {}, "質問を選択してください");
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
          targetTag.insertAdjacentElement("afterend", span);
          logHypothesisAction(`仮説: 生成質問を選択 "${li.textContent}"`);
          scheduleHypothesisSave();
          document.body.removeChild(dialog);
        };
        dialogBody.appendChild(btn);
      });

      const closeBtn = document.createElement("button");
      closeBtn.textContent = t("buttons.cancel", {}, "キャンセル");
      closeBtn.className = "question-dialog__close";
      closeBtn.onclick = () => {
        removeScamperEntryByTag(targetTag);
        document.body.removeChild(dialog);
      };
      dialogBody.appendChild(closeBtn);

      document.body.appendChild(dialog);
    })
    .catch((error) => {
      removeScamperLoading();
      alert(t("alerts.apiCallFailed", { message: error.message }, "API呼び出し中にエラーが発生しました: " + error.message));
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
  let xmlFetchInFlight = false;
  const fetchXML = () => {
    if (xmlFetchInFlight) return;
    const { userId, themeName } = getCurrentUserThemeRaw();
    if (!userId || !themeName) return;

    xmlFetchInFlight = true;
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
      })
      .finally(() => {
        xmlFetchInFlight = false;
      });
  };
  setInterval(fetchXML, 5000); // 5秒ごとに更新

  // 仮説の情報を取得
  document.body.addEventListener("contextmenu", (event) => {
    const clickedElement = event.target;
    if (clickedElement.classList.contains("hypothesis-text")) {
      const hypothesisBox = clickedElement.closest(".hypothesis-box");
      const keywordElement = hypothesisBox.querySelector("div:nth-child(2)");
      hypothesisData = clickedElement.value;
      selectedKeywords = keywordElement ? keywordElement.innerText : t("labels.noKeywords", {}, "(キーワードなし)");
    }
  });

});

const hypothesisApiHost = hypothesisHost;
const hypothesisApiBaseUrl =
  hypothesisConfig.flaskApiBaseUrl ||
  `http://${hypothesisApiHost}:${Number(hypothesisConfig.flaskApiPort || 8000)}`;
