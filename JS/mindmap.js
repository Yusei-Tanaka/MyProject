window.addEventListener('DOMContentLoaded', function() {
  const $ = go.GraphObject.make;
  const appConfig = window.APP_CONFIG || {};
  const host = appConfig.host || window.location.hostname || "127.0.0.1";
  const saveApiBaseUrl =
    appConfig.saveXmlBaseUrl ||
    `http://${host}:${Number(appConfig.saveXmlPort || 3005)}`;
  const themeApiBaseUrl =
    appConfig.apiBaseUrl ||
    `http://${host}:${Number(appConfig.apiPort || 3000)}`;
  const MINDMAP_SNAPSHOT_DIR = "XML";
  const MINDMAP_LEGACY_SNAPSHOT_DIR = "JS/XML";
  const ENABLE_LEGACY_MINDMAP_LOOKUP = appConfig.enableLegacyMindmapLookup === true;
  const MINDMAP_SNAPSHOT_DIRS = ENABLE_LEGACY_MINDMAP_LOOKUP
    ? [MINDMAP_SNAPSHOT_DIR, MINDMAP_LEGACY_SNAPSHOT_DIR]
    : [MINDMAP_SNAPSHOT_DIR];
  let isRestoringMindmap = false;
  let isMindmapReady = false;
  let mindmapSaveTimer = null;
  let mindmapSaveInFlight = false;
  let mindmapSaveQueued = false;
  let lastSavedMindmapFingerprint = "";
  let hasShownMindmapUserMissingWarning = false;
  let shouldApplyInitialOffset = true;
  let initialOffsetApplied = false;
  const MAX_FILE_PART_LENGTH = 24;

  const t = (key, vars = {}, fallback = "") => {
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

  function getHypothesisNodeWidth() {
    return getCurrentThemeLanguage() === "en" ? 170 : 120;
  }

  const MINDMAP_HIGHLIGHT_STYLES = [
    { fill: "#DCE9FF", stroke: "#3D6FCC", text: "#173B7A" },
    { fill: "#FCE6C8", stroke: "#E67E22", text: "#7A4208" },
    { fill: "#E5F6D8", stroke: "#5BA84B", text: "#2D6020" },
    { fill: "#F1E3FF", stroke: "#8B5CF6", text: "#4C1D95" },
    { fill: "#FFE6E6", stroke: "#E25555", text: "#8B1E1E" },
  ];

  function getMindmapHighlightStyle(index) {
    return MINDMAP_HIGHLIGHT_STYLES[index % MINDMAP_HIGHLIGHT_STYLES.length];
  }

  function rememberMindmapNodeBaseStyle(node) {
    if (!node) return null;
    if (node.__mindmapBaseStyle) return node.__mindmapBaseStyle;

    const shape = node.findObject("MINDMAP_NODE_SHAPE");
    const textBlock = node.findObject("MINDMAP_NODE_TEXT");
    if (!shape || !textBlock) return null;

    node.__mindmapBaseStyle = {
      fill: shape.fill,
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
      textStroke: textBlock.stroke,
    };
    return node.__mindmapBaseStyle;
  }

  function applyMindmapNodeHighlight(node, style) {
    const baseStyle = rememberMindmapNodeBaseStyle(node);
    if (!baseStyle) return false;

    const shape = node.findObject("MINDMAP_NODE_SHAPE");
    const textBlock = node.findObject("MINDMAP_NODE_TEXT");
    if (!shape || !textBlock) return false;

    const resolvedStyle = style && typeof style === "object" ? style : {};
    const fill = typeof resolvedStyle.fill === "string" && resolvedStyle.fill ? resolvedStyle.fill : baseStyle.fill;
    const stroke = typeof resolvedStyle.stroke === "string" && resolvedStyle.stroke ? resolvedStyle.stroke : baseStyle.stroke;
    const textStroke = typeof resolvedStyle.text === "string" && resolvedStyle.text ? resolvedStyle.text : baseStyle.textStroke;

    shape.fill = fill;
    shape.stroke = stroke;
    shape.strokeWidth = Math.max(3, baseStyle.strokeWidth || 2);
    textBlock.stroke = textStroke;
    node.__mindmapHighlightStyle = { fill: fill, stroke: stroke, text: textStroke };
    node.data.hypothesisHighlightKey = typeof resolvedStyle.key === "number" || typeof resolvedStyle.key === "string"
      ? String(resolvedStyle.key)
      : "0";
    node.__mindmapHighlighted = true;
    return true;
  }

  function restoreMindmapNodeHighlight(node) {
    const baseStyle = node && node.__mindmapBaseStyle;
    if (!baseStyle) return false;

    const shape = node.findObject("MINDMAP_NODE_SHAPE");
    const textBlock = node.findObject("MINDMAP_NODE_TEXT");
    if (!shape || !textBlock) return false;

    shape.fill = baseStyle.fill;
    shape.stroke = baseStyle.stroke;
    shape.strokeWidth = baseStyle.strokeWidth;
    textBlock.stroke = baseStyle.textStroke;
    node.__mindmapHighlightStyle = null;
    if (node.data) {
      delete node.data.hypothesisHighlightKey;
    }
    node.__mindmapHighlighted = false;
    return true;
  }

  function findMindmapHypothesisNodesByText(hypothesisText) {
    if (!diagram) return [];

    const normalizedText = String(hypothesisText || "").trim();
    if (!normalizedText) return [];

    const nodes = [];
    diagram.nodes.each(function(node) {
      if (!node || !node.data || node.data.key === 0) return;
      const nodeText = String(node.data.text || "").trim();
      if (nodeText === normalizedText) {
        nodes.push(node);
      }
    });

    return nodes;
  }

  function findMindmapHypothesisNodesByEntryId(entryId) {
    if (!diagram) return [];

    const normalizedEntryId = String(entryId || "").trim();
    if (!normalizedEntryId) return [];

    const nodes = [];
    diagram.nodes.each(function(node) {
      if (!node || !node.data || node.data.key === 0) return;
      if (String(node.data.hypothesisEntryId || "").trim() === normalizedEntryId) {
        nodes.push(node);
      }
    });

    return nodes;
  }

  function highlightMindmapNodesByTargets(targets) {
    if (!diagram) return false;

    clearMindmapNodeHighlight();

    const defaultStyles = MINDMAP_HIGHLIGHT_STYLES;

    const normalizedTargets = Array.isArray(targets)
      ? targets.map(function(target, index) {
          const fallbackStyle = getMindmapHighlightStyle(index);
          if (typeof target === "string") {
            return { text: target, style: fallbackStyle };
          }
          const text = String(target && target.text ? target.text : "").trim();
          if (!text) return null;
          const style = target && target.style && typeof target.style === "object" ? target.style : fallbackStyle;
          return {
            entryId: target && target.entryId ? String(target.entryId).trim() : "",
            text,
            style: {
              fill: typeof style.fill === "string" && style.fill ? style.fill : fallbackStyle.fill,
              stroke: typeof style.stroke === "string" && style.stroke ? style.stroke : fallbackStyle.stroke,
              text: typeof style.text === "string" && style.text ? style.text : fallbackStyle.text,
            },
          };
        }).filter(Boolean)
      : [];

    if (normalizedTargets.length === 0) return false;

    let didHighlight = false;
    normalizedTargets.forEach(function(target) {
      const nodesByText = findMindmapHypothesisNodesByText(target.text);
      const nodesByEntryId = target.entryId ? findMindmapHypothesisNodesByEntryId(target.entryId) : [];
      const resolvedNodes = nodesByText.length > 0 ? nodesByText : nodesByEntryId;
      resolvedNodes.forEach(function(node) {
        if (applyMindmapNodeHighlight(node, target.style)) {
          didHighlight = true;
        }
      });
    });

    return didHighlight;
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

  function getMindmapFileName(useShort = true) {
    const parts = getUserThemeParts(useShort);
    return `${parts.user}__${parts.theme}.mindmap.json`;
  }

  function getMindmapRestoreCandidates() {
    const candidates = [];
    const { user: shortUser, theme: shortTheme } = getUserThemeParts(true);
    const { user: legacyUser, theme: legacyTheme } = getUserThemeParts(false);

    const pushUnique = function(name) {
      if (!name) return;
      if (candidates.indexOf(name) === -1) {
        candidates.push(name);
      }
    };

    pushUnique(`${shortUser}__${shortTheme}.mindmap.json`);
    pushUnique(`${legacyUser}__${legacyTheme}.mindmap.json`);

    // 旧形式（テーマ未スコープ）: user.mindmap.json
    pushUnique(`${shortUser}.mindmap.json`);
    pushUnique(`${legacyUser}.mindmap.json`);

    return candidates;
  }

  function buildSnapshotPath(dir, fileName) {
    const normalizedDir = String(dir || "").replace(/^\/+|\/+$/g, "");
    return `/${normalizedDir}/${encodeURIComponent(fileName)}`;
  }

  async function checkSnapshotExistsInPrimaryDir(fileName) {
    try {
      const response = await fetch(
        `${saveApiBaseUrl}/xml-exists?filename=${encodeURIComponent(fileName)}`,
        { cache: "no-store" }
      );
      if (!response.ok) return null;
      const payload = await response.json();
      return Boolean(payload && payload.exists);
    } catch (_error) {
      return null;
    }
  }

  async function fetchSnapshotResponse(snapshotPath) {
    const response = await fetch(snapshotPath, { cache: "no-store" });
    if (response.ok) return response;
    if (response.status === 404) return null;
    throw new Error(`HTTP ${response.status}`);
  }

  function getCurrentThemeName() {
    const titleInput = document.getElementById("myTitle");
    const inputValue = titleInput ? String(titleInput.value || "").trim() : "";
    return inputValue || String(localStorage.getItem("searchTitle") || "").trim();
  }

  function getCurrentUserThemeRaw() {
    const userId = String(localStorage.getItem("userName") || "").trim();
    const themeName = getCurrentThemeName();
    return { userId, themeName };
  }

  function wait(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function collectMindmapHypothesisNodes() {
    if (!diagram || !diagram.model || !Array.isArray(diagram.model.nodeDataArray)) {
      return [];
    }

    const items = [];
    diagram.model.nodeDataArray.forEach(function(node, index) {
      const text = String(node && node.text ? node.text : "").trim();
      if (!text) return;
      if (node && node.key === 0) return;

      const parent = node && node.parent !== undefined && node.parent !== null ? String(node.parent) : "";
      items.push({ text, parent, originalIndex: index });
    });

    items.sort(function(a, b) {
      if (a.text < b.text) return -1;
      if (a.text > b.text) return 1;
      if (a.parent < b.parent) return -1;
      if (a.parent > b.parent) return 1;
      return a.originalIndex - b.originalIndex;
    });

    const result = items.map(function(item) {
      return {
        kind: "hypothesis",
        text: item.text,
        source: "mindmap",
      };
    });

    return result;
  }

  function extractMindmapModelJsonFromContent(content) {
    if (!content || typeof content !== "object" || Array.isArray(content)) return "";

    const mindmap =
      content.mindmap && typeof content.mindmap === "object" && !Array.isArray(content.mindmap)
        ? content.mindmap
        : null;

    const candidates = [
      mindmap ? mindmap.modelJson : "",
      mindmap ? mindmap.model : "",
      mindmap ? mindmap.goModelJson : "",
      content.mindmapModelJson,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = candidates[i];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
      if (value && typeof value === "object") {
        try {
          return JSON.stringify(value);
        } catch (_error) {
          // ignore invalid object values
        }
      }
    }

    return "";
  }

  function extractLegacyMindmapTextsFromContent(content) {
    if (!content || typeof content !== "object" || Array.isArray(content)) return [];

    const hypothesis =
      content.hypothesis && typeof content.hypothesis === "object" && !Array.isArray(content.hypothesis)
        ? content.hypothesis
        : null;
    if (!hypothesis) return [];

    const unique = new Set();
    const texts = [];
    const pushUniqueText = function(value) {
      const text = String(value || "").trim();
      if (!text || unique.has(text)) return;
      unique.add(text);
      texts.push(text);
    };

    const mapNodes = Array.isArray(hypothesis.mapNodes) ? hypothesis.mapNodes : [];
    mapNodes.forEach(function(entry) {
      if (typeof entry === "string") {
        pushUniqueText(entry);
        return;
      }
      if (entry && typeof entry === "object") {
        pushUniqueText(entry.text || entry.label);
      }
    });
    if (texts.length > 0) {
      return texts;
    }

    const nodes = Array.isArray(hypothesis.nodes) ? hypothesis.nodes : [];
    nodes.forEach(function(entry) {
      if (!entry || typeof entry !== "object") return;
      if (String(entry.source || "").toLowerCase() !== "mindmap") return;
      pushUniqueText(entry.text || entry.label);
    });

    return texts;
  }

  function buildLegacyMindmapModelJson(defaultTitle, nodeTexts) {
    const nodeDataArray = [{ key: 0, text: defaultTitle, loc: "0 -200" }];
    const texts = Array.isArray(nodeTexts) ? nodeTexts : [];
    texts.forEach(function(text, index) {
      nodeDataArray.push({
        key: -(index + 1),
        parent: 0,
        text,
      });
    });

    return new go.TreeModel(nodeDataArray).toJson();
  }

  async function fetchThemeRecordFromDb(userId, themeName) {
    const encodedUserId = encodeURIComponent(userId);
    const encodedThemeName = encodeURIComponent(themeName);
    const language = getCurrentThemeLanguage();
    const urls = [
      `${themeApiBaseUrl}/users/${encodedUserId}/themes/${encodedThemeName}?language=${encodeURIComponent(language)}`,
      `${themeApiBaseUrl}/users/${encodedUserId}/themes/${encodedThemeName}`,
    ];

    for (let i = 0; i < urls.length; i += 1) {
      const response = await fetch(urls[i], { cache: "no-store" });
      if (response.ok) {
        return response.json();
      }
      if (response.status === 404) {
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return null;
  }

  async function fetchMindmapSnapshotFromDb(defaultTitle) {
    const { userId, themeName } = getCurrentUserThemeRaw();
    if (!userId || !themeName) return null;

    const themeRecord = await fetchThemeRecordFromDb(userId, themeName);
    const content =
      themeRecord && themeRecord.content && typeof themeRecord.content === "object" && !Array.isArray(themeRecord.content)
        ? themeRecord.content
        : null;
    if (!content) return null;

    const modelJson = extractMindmapModelJsonFromContent(content);
    if (modelJson) {
      return {
        source: "mindmap-model",
        modelJson,
      };
    }

    const legacyTexts = extractLegacyMindmapTextsFromContent(content);
    if (legacyTexts.length > 0) {
      return {
        source: "legacy-mapNodes",
        nodeCount: legacyTexts.length,
        modelJson: buildLegacyMindmapModelJson(defaultTitle, legacyTexts),
      };
    }

    return null;
  }

  function applyMindmapModelJson(modelJson, defaultTitle) {
    if (typeof modelJson !== "string" || !modelJson.trim()) return false;

    const model = go.Model.fromJson(modelJson);
    diagram.model = model;
    shouldApplyInitialOffset = false;
    initialOffsetApplied = true;

    const nodeDataArray = Array.isArray(model.nodeDataArray) ? model.nodeDataArray : [];
    const root = diagram.findNodeForKey(0);
    if (!root && nodeDataArray.length === 0) {
      diagram.model = new go.TreeModel([{ key: 0, text: defaultTitle, loc: "0 -200" }]);
    }

    const currentRoot =
      Array.isArray(diagram.model.nodeDataArray)
        ? diagram.model.nodeDataArray.find((n) => n && n.key === 0)
        : null;
    if (currentRoot && currentRoot.text) {
      const titleInput = document.getElementById("myTitle");
      if (titleInput) titleInput.value = currentRoot.text;
      localStorage.setItem("searchTitle", currentRoot.text);
    }

    resetMindmapSaveFingerprintFromCurrent();
    return true;
  }

  async function saveMindmapStateToDb(modelJson) {
    const { userId, themeName } = getCurrentUserThemeRaw();
    if (!userId || !themeName) return;
    const serializedModelJson = typeof modelJson === "string" ? modelJson : "";

    const putResponse = await fetch(`${themeApiBaseUrl}/users/${encodeURIComponent(userId)}/themes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        themeName,
          language: getCurrentThemeLanguage(),
        content: {
          hypothesis: {
            mapNodes: collectMindmapHypothesisNodes(),
          },
          mindmap: {
            schemaVersion: 1,
            modelJson: serializedModelJson,
            savedAt: new Date().toISOString(),
          },
        },
      }),
    });

    if (putResponse.status === 404) {
      if (!hasShownMindmapUserMissingWarning) {
        hasShownMindmapUserMissingWarning = true;
        alert(
          t(
            "alerts.mindmapDbUserMissing",
            { userId },
            `ユーザー「${userId}」がDBに存在しないため、仮説関係性マップのDB保存をスキップしました。\nログインし直して（auth_user / host）利用してください。`
          )
        );
      }
      return;
    }

    if (!putResponse.ok) {
      throw new Error(`HTTP ${putResponse.status}`);
    }
  }

  function buildMindmapSaveSnapshot() {
    if (!diagram || !diagram.model) return null;
    const modelJson = diagram.model.toJson();
    const mapNodes = collectMindmapHypothesisNodes();
    const fingerprint = JSON.stringify({
      modelJson,
      mapNodes,
    });
    return {
      modelJson,
      mapNodes,
      fingerprint,
    };
  }

  function resetMindmapSaveFingerprintFromCurrent() {
    const snapshot = buildMindmapSaveSnapshot();
    lastSavedMindmapFingerprint = snapshot ? snapshot.fingerprint : "";
  }

  async function fetchMindmapSnapshot() {
    const fileNames = getMindmapRestoreCandidates();

    for (let i = 0; i < fileNames.length; i += 1) {
      const fileName = fileNames[i];
      const existsInPrimaryDir = await checkSnapshotExistsInPrimaryDir(fileName);
      if (existsInPrimaryDir === false && !ENABLE_LEGACY_MINDMAP_LOOKUP) {
        continue;
      }

      for (let j = 0; j < MINDMAP_SNAPSHOT_DIRS.length; j += 1) {
        const dir = MINDMAP_SNAPSHOT_DIRS[j];
        if (dir === MINDMAP_SNAPSHOT_DIR && existsInPrimaryDir === false) {
          continue;
        }
        const response = await fetchSnapshotResponse(buildSnapshotPath(dir, fileName));
        if (response) {
          return { response, fileName };
        }
      }
    }

    return null;
  }

  async function saveMindmapState() {
    if (!isMindmapReady || isRestoringMindmap) return;
    if (mindmapSaveInFlight) {
      mindmapSaveQueued = true;
      return;
    }

    const snapshot = buildMindmapSaveSnapshot();
    if (!snapshot) return;
    if (snapshot.fingerprint === lastSavedMindmapFingerprint) {
      return;
    }

    mindmapSaveInFlight = true;
    try {
      const fileSavePromise = fetch(`${saveApiBaseUrl}/save-xml`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: getMindmapFileName(),
          content: snapshot.modelJson,
        }),
      });
      const [response] = await Promise.all([
        fileSavePromise,
        saveMindmapStateToDb(snapshot.modelJson),
      ]);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      lastSavedMindmapFingerprint = snapshot.fingerprint;
    } catch (error) {
      console.error("Mindmap save failed:", error);
      console.error("マインドマップ保存に失敗しました:", error);
    } finally {
      mindmapSaveInFlight = false;
      if (mindmapSaveQueued) {
        mindmapSaveQueued = false;
        saveMindmapState();
      }
    }
  }

  function scheduleMindmapSave() {
    if (!isMindmapReady || isRestoringMindmap) return;
    if (mindmapSaveTimer) clearTimeout(mindmapSaveTimer);
    mindmapSaveTimer = setTimeout(function() {
      saveMindmapState();
    }, 300);
  }

  async function restoreMindmapState(defaultTitle) {
    isRestoringMindmap = true;

    try {
      const snapshot = await fetchMindmapSnapshot();
      if (!snapshot) {
        const dbSnapshot = await fetchMindmapSnapshotFromDb(defaultTitle);
        if (dbSnapshot && applyMindmapModelJson(dbSnapshot.modelJson, defaultTitle)) {
          if (dbSnapshot.source === "legacy-mapNodes") {
            logMindmapAction(`Mindmap: restored from DB fallback (${dbSnapshot.nodeCount} nodes)`);
          } else {
            logMindmapAction("Mindmap: restored from DB");
          }
          return true;
        }
        return false;
      }
      const { response, fileName } = snapshot;

      const modelJson = await response.text();
      if (!modelJson || !modelJson.trim()) return false;

      if (!applyMindmapModelJson(modelJson, defaultTitle)) return false;
      logMindmapAction(`Mindmap: restored (${fileName})`);

      logMindmapAction(`マインドマップ: 復元しました (${fileName})`);
      return true;
    } catch (error) {
      console.error("マインドマップ復元に失敗しました:", error);
      return false;
    } finally {
      isRestoringMindmap = false;
    }
  }

  async function restoreMindmapStateWithRetry(defaultTitle) {
    const retryDelaysMs = [0, 350, 1000];
    for (let i = 0; i < retryDelaysMs.length; i += 1) {
      const delayMs = retryDelaysMs[i];
      if (delayMs > 0) {
        await wait(delayMs);
      }
      const restored = await restoreMindmapState(defaultTitle);
      if (restored) {
        return true;
      }

      const dbSnapshot = await fetchMindmapSnapshotFromDb(defaultTitle);
      if (dbSnapshot && applyMindmapModelJson(dbSnapshot.modelJson, defaultTitle)) {
        if (dbSnapshot.source === "legacy-mapNodes") {
          logMindmapAction(`Mindmap: restored from DB fallback (${dbSnapshot.nodeCount} nodes)`);
        } else {
          logMindmapAction("Mindmap: restored from DB");
        }
        return true;
      }
    }
    return false;
  }

  const diagram = $(go.Diagram, "myDiagramDiv", {
    "undoManager.isEnabled": true,
    allowInsert: false
  });
  diagram.toolManager.hoverDelay = 0;

  function handleDiagramResize() {
    if (!diagram) return;
    setTimeout(function() {
      diagram.requestUpdate();
    }, 0);
  }

  window.addEventListener("app-layout-resized", handleDiagramResize);

  function logMindmapAction(message) {
    if (typeof window.addSystemLog === "function") {
      window.addSystemLog(message);
    }
  }

  function normalizeMindmapArray(value) {
    if (Array.isArray(value)) {
      return value
        .map(function(item) {
          return String(item || "").trim();
        })
        .filter(Boolean);
    }

    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return normalizeMindmapArray(parsed);
        }
      } catch (_error) {
        // Fall back to comma-separated labels.
      }

      return value
        .split(/[\u3001,]/)
        .map(function(item) {
          return String(item || "").trim();
        })
        .filter(Boolean);
    }

    return [];
  }

  function getMindmapKeywordLabels(data) {
    return normalizeMindmapArray(data && data.basedKeywordLabels);
  }

  function getMindmapKeywordNodeIds(data) {
    return normalizeMindmapArray(data && data.basedNodeIds);
  }

  function findKeywordNodeIdsByLabels(labels) {
    if (!window.nodes || typeof window.nodes.get !== "function") return [];

    const wantedLabels = new Set(normalizeMindmapArray(labels));
    if (wantedLabels.size === 0) return [];

    const ids = [];
    window.nodes.get().forEach(function(node) {
      const labelsToMatch = [];
      const nodeLabel = String(node && node.label ? node.label : "").trim();
      if (nodeLabel) labelsToMatch.push(nodeLabel);

      if (node && node.i18nLabels && typeof node.i18nLabels === "object") {
        Object.keys(node.i18nLabels).forEach(function(langKey) {
          const localized = String(node.i18nLabels[langKey] || "").trim();
          if (localized) labelsToMatch.push(localized);
        });
      }

      if (labelsToMatch.some(function(label) { return wantedLabels.has(label); })) {
        ids.push(node.id);
      }
    });

    return ids;
  }

  function getMindmapKeywordTooltipText(data) {
    if (!data || data.key === 0) return "";
    const labels = getMindmapKeywordLabels(data);
    if (labels.length === 0) return "";
    const separator = getCurrentThemeLanguage() === "en" ? ", " : "\u3001";
    return labels.join(separator);
  }

  function clearMindmapNodeHighlight() {
    if (!diagram) return false;

    let didClear = false;
    diagram.nodes.each(function(node) {
      if (!node || !node.__mindmapHighlighted) return;
      if (restoreMindmapNodeHighlight(node)) {
        didClear = true;
      }
    });
    diagram.clearSelection();
    return didClear;
  }

  function clearMindmapInteractionHighlights() {
    clearMindmapNodeHighlight();

    if (typeof window.clearHypothesisEntryActivation === "function") {
      window.clearHypothesisEntryActivation({ clearKeywordSelection: true });
    } else if (typeof window.clearNodeSelection === "function") {
      window.clearNodeSelection();
    } else if (typeof window.setSelectedNodes === "function") {
      window.setSelectedNodes([]);
    }
  }

  function highlightMindmapNode(node) {
    clearMindmapNodeHighlight();
    if (!(node instanceof go.Node) || !node.data || node.data.key === 0) return false;

    applyMindmapNodeHighlight(node, getMindmapHighlightStyle(0));
    diagram.select(node);
    return true;
  }

  function findMindmapHypothesisNode(entryId, hypothesisText) {
    if (!diagram) return null;

    const normalizedEntryId = String(entryId || "").trim();
    const normalizedText = String(hypothesisText || "").trim();
    let matchedById = null;
    let matchedByText = null;

    diagram.nodes.each(function(node) {
      if (matchedById || !node || !node.data || node.data.key === 0) return;

      const nodeEntryId = String(node.data.hypothesisEntryId || "").trim();
      if (normalizedEntryId && nodeEntryId === normalizedEntryId) {
        matchedById = node;
        return;
      }

      const nodeText = String(node.data.text || "").trim();
      if (!matchedByText && normalizedText && nodeText === normalizedText) {
        matchedByText = node;
      }
    });

    return matchedById || matchedByText;
  }

  window.highlightMindmapHypothesisNode = function(entryId, hypothesisText) {
    const nodes = findMindmapHypothesisNodesByEntryId(entryId);
    if (nodes.length > 0) {
      return highlightMindmapNodesByTargets([{ entryId, text: hypothesisText, style: getMindmapHighlightStyle(0) }]);
    }
    const node = findMindmapHypothesisNode(entryId, hypothesisText);
    return highlightMindmapNode(node);
  };

  window.highlightMindmapHypothesisNodes = function(targets) {
    return highlightMindmapNodesByTargets(targets);
  };

  window.clearMindmapHypothesisHighlight = clearMindmapNodeHighlight;

  diagram.addDiagramListener("BackgroundSingleClicked", function() {
    clearMindmapInteractionHighlights();
  });

  function handleMindmapNodeClick(node) {
    if (!node || !node.data || node.data.key === 0) return;
    highlightMindmapNode(node);

    const nodeIds = getMindmapKeywordNodeIds(node.data);
    const labels = getMindmapKeywordLabels(node.data);
    const resolvedNodeIds = nodeIds.length > 0 ? nodeIds : findKeywordNodeIdsByLabels(labels);

    if (resolvedNodeIds.length > 0 && typeof window.setSelectedNodes === "function") {
      window.setSelectedNodes(resolvedNodeIds);
    } else if (typeof window.clearNodeSelection === "function") {
      window.clearNodeSelection();
    }

    if (typeof window.activateHypothesisEntryFromMindmap === "function") {
      window.activateHypothesisEntryFromMindmap(node.data.hypothesisEntryId, node.data.text);
    }
  }

  /* ツリーレイアウト */
  diagram.layout = $(go.TreeLayout, {
    angle: 90,
    layerSpacing: 50,
    nodeSpacing: 20
  });

  // レイアウト完了後に初回のみ全ノードを上方へ平行移動（復元時は無効）
  diagram.addDiagramListener("LayoutCompleted", function(e) {
    if (!shouldApplyInitialOffset || initialOffsetApplied) return;
    initialOffsetApplied = true;
    // ずらす量（Y方向）
    var offsetY = -200;
    diagram.nodes.each(function(node) {
      var loc = node.location;
      node.location = new go.Point(loc.x, loc.y + offsetY);
    });
  });

  /* ノードテンプレート */
  diagram.nodeTemplate =
    $(go.Node, "Auto",
      new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
      $(go.Shape, "RoundedRectangle",
        {
          name: "MINDMAP_NODE_SHAPE",
          stroke: "#3498DB",
          strokeWidth: 2,
          fill: "#FFFFFF"
        },
        new go.Binding("fill", "key", function(key) {
          return key === 0 ? "#3D6FCC" : "#FFFFFF";
        }),
        new go.Binding("stroke", "key", function(key) {
          return key === 0 ? "#3D6FCC" : "#3498DB";
        }),
        new go.Binding("fill", "isHighlighted", function(isHighlighted, shape) {
          const data = shape && shape.part ? shape.part.data : null;
          if (isHighlighted) return "#FCE6C8";
          if (data && data.key === 0) return "#3D6FCC";
          return "#FFFFFF";
        }).ofObject(),
        new go.Binding("stroke", "isHighlighted", function(isHighlighted, shape) {
          if (isHighlighted) return "#E67E22";
          return "#3498DB";
        }).ofObject(),
        new go.Binding("strokeWidth", "isHighlighted", function(isHighlighted) {
          return isHighlighted ? 4 : 2;
        }).ofObject()
      ),
      $(go.TextBlock,
        {
          name: "MINDMAP_NODE_TEXT",
          margin: 8,
          stroke: "#000000",
          font: "bold 14px 'Segoe UI', sans-serif"
        },
        new go.Binding("text").makeTwoWay(),
        new go.Binding("wrap", "key", function(key) {
          return key === 0 ? go.TextBlock.None : go.TextBlock.WrapFit;
        }),
        new go.Binding("width", "key", function(key) {
          return key === 0 ? NaN : getHypothesisNodeWidth();
        }),
        new go.Binding("stroke", "key", function(key) {
          return key === 0 ? "#FFFFFF" : "#000000";
        }),
        new go.Binding("stroke", "isHighlighted", function(isHighlighted, textBlock) {
          const data = textBlock && textBlock.part ? textBlock.part.data : null;
          return data && data.key === 0 ? "#FFFFFF" : "#000000";
        }).ofObject()
      ),
      {
        click: (e, node) => handleMindmapNodeClick(node),
        toolTip:
          $("ToolTip",
            $(go.Panel, "Auto",
              $(go.Shape, "RoundedRectangle",
                {
                  fill: "#FFF8E8",
                  stroke: "#E7A94C",
                  strokeWidth: 1.5,
                  parameter1: 8
                }
              ),
              $(go.Panel, "Vertical",
                {
                  margin: 8,
                  maxSize: new go.Size(260, NaN),
                  stretch: go.GraphObject.Horizontal
                },
                $(go.TextBlock,
                  {
                    margin: new go.Margin(0, 0, 4, 0),
                    stroke: "#A86E15",
                    font: "bold 11px 'Segoe UI', sans-serif"
                  },
                  new go.Binding("text", "", function() {
                    return t("labels.keywordTooltipTitle", {}, getCurrentThemeLanguage() === "en" ? "Keywords" : "キーワード");
                  })
                ),
                $(go.TextBlock,
                  {
                    stroke: "#5A3C12",
                    font: "bold 13px 'Segoe UI', sans-serif",
                    wrap: go.TextBlock.WrapFit
                  },
                  new go.Binding("text", "", getMindmapKeywordTooltipText)
                )
              )
            ),
            new go.Binding("visible", "", function(data) {
              return getMindmapKeywordLabels(data).length > 0;
            })
          )
      },
      {
        doubleClick: (e, node) => {
          const oldText = node.data.text;
          const newText = prompt(t("prompts.editMindmapNodeText", {}, "ノードのテキストを変更:"), oldText);
          if (newText !== null && newText.trim() !== "" && newText !== oldText) {
            diagram.startTransaction("edit text");
            diagram.model.set(node.data, "text", newText);
            diagram.commitTransaction("edit text");
            logMindmapAction(`マインドマップ: ノード編集 key=${node.data.key} "${oldText}" → "${newText}"`);
          }
        }
      },
      {
        contextMenu:
          $("ContextMenu",
            $("ContextMenuButton",
              $(go.TextBlock, t("buttons.addNode", {}, "仮説を立案")),
              { click: (e, obj) => handleAddHypothesisFromMindmap(obj.part.adornedPart) }
            ),
            $("ContextMenuButton",
              $(go.TextBlock, t("buttons.delete", {}, "削除")),
              { click: (e, obj) => removeNode(obj.part.adornedPart) }
            )
          )
      }
    );

  /* リンクライン */
  diagram.linkTemplate = $(go.Link, $(go.Shape, { stroke: "#95A5A6", strokeWidth: 2 }));

  /* 子ノードの追加 */
  function addChild(node) {
    const inputText = prompt(t("prompts.addMindmapNodeText", {}, "追加するノードのテキスト:"), "");
    if (inputText === null) return;
    const normalizedText = String(inputText || "").trim();
    if (!normalizedText) {
      alert(t("alerts.enterNodeName", {}, "ノード名を入力してください。"));
      return;
    }

    diagram.startTransaction("add child");
    const newNodeData = { text: normalizedText, parent: node.data.key };
    diagram.model.addNodeData(newNodeData);
    diagram.commitTransaction("add child");
    logMindmapAction(`マインドマップ: 子ノード追加 parent=${node.data.key} "${node.data.text}" text="${normalizedText}"`);
  }

  function isTitleMindmapNode(node) {
    return Boolean(node && node.data && node.data.key === 0);
  }

  function getMindmapNodeText(node) {
    const text = node && node.data && node.data.text ? String(node.data.text).trim() : "";
    return text || t("labels.untitledNode", {}, "(無題ノード)");
  }

  function getUniqueMindmapNodes(nodesList) {
    const uniqueNodes = [];
    const seenKeySet = new Set();
    (Array.isArray(nodesList) ? nodesList : []).forEach(function(node) {
      if (!(node instanceof go.Node) || !node.data) return;
      const key = String(node.data.key);
      if (seenKeySet.has(key)) return;
      seenKeySet.add(key);
      uniqueNodes.push(node);
    });
    return uniqueNodes;
  }

  function getTopLevelMindmapNodes(nodesList) {
    const normalizedNodes = getUniqueMindmapNodes(nodesList);
    const selectedNodeSet = new Set(normalizedNodes);
    return normalizedNodes.filter(function(node) {
      let ancestor = node.findTreeParentNode();
      while (ancestor) {
        if (selectedNodeSet.has(ancestor)) return false;
        ancestor = ancestor.findTreeParentNode();
      }
      return true;
    });
  }

  function collectSelectedMindmapNodes() {
    const selected = [];
    diagram.selection.each(function(part) {
      if (part instanceof go.Node) {
        selected.push(part);
      }
    });
    return selected;
  }

  /* ノード削除（右クリック・キーボード共通） */
  function removeNodesWithConfirm(nodesToDelete, source = "unknown") {
    const normalizedNodes = getUniqueMindmapNodes(nodesToDelete);
    if (normalizedNodes.length === 0) return false;

    if (normalizedNodes.some(isTitleMindmapNode)) {
      alert(t("alerts.cannotDeleteTitleNode", {}, "タイトルノードは削除できません。"));
      return false;
    }

    const rootNodes = getTopLevelMindmapNodes(normalizedNodes);
    if (rootNodes.length === 0) return false;

    const deleteKeySet = new Set();
    rootNodes.forEach(function(rootNode) {
      rootNode.findTreeParts().each(function(part) {
        if (!(part instanceof go.Node)) return;
        if (isTitleMindmapNode(part) || !part.data) return;
        deleteKeySet.add(String(part.data.key));
      });
    });

    const deleteCount = deleteKeySet.size;
    if (deleteCount === 0) return false;

    const confirmMessage = [
      t(
        "confirms.deleteMindmapNodesHeader",
        { count: deleteCount },
        `以下の ${deleteCount} 件のノード（子ノードを含む）を削除します。`
      ),
      ...rootNodes.map(function(node) {
        return `- ${getMindmapNodeText(node)}`;
      }),
      t("confirms.deleteNodesFooter", {}, "本当に削除してよいですか？")
    ].join("\n");

    if (!confirm(confirmMessage)) return false;

    diagram.startTransaction("remove subtree");
    rootNodes.forEach(function(rootNode) {
      const removedKey = rootNode.data && rootNode.data.key !== undefined ? rootNode.data.key : "";
      const removedText = getMindmapNodeText(rootNode);

      const highlightKey = rootNode.data && rootNode.data.hypothesisHighlightKey !== undefined
        ? String(rootNode.data.hypothesisHighlightKey)
        : "";
      const entryIdForNode = rootNode.data && rootNode.data.hypothesisEntryId !== undefined
        ? String(rootNode.data.hypothesisEntryId)
        : "";
      try {
        let matched = [];
        if (highlightKey) {
          const selector = '.scamper-tag-container[data-hypothesis-highlight-key="' + highlightKey + '"]';
          matched = Array.prototype.slice.call(document.querySelectorAll(selector) || []);
        }

        // Fallback: if no highlight-key matches, try matching by hypothesisEntryId on the enclosing hypothesis-box
        if ((matched.length === 0) && entryIdForNode) {
          const containers = Array.prototype.slice.call(document.querySelectorAll('.scamper-tag-container') || []);
          matched = containers.filter(function(container) {
            try {
              var box = container.closest && container.closest('.hypothesis-box');
              return box && box.dataset && String(box.dataset.hypothesisEntryId) === entryIdForNode;
            } catch (_e) {
              return false;
            }
          });
        }

        if (matched.length === 0) {
          // Try alternative selector: scamper-edit-box inside hypothesis-box with matching entryId
          if (entryIdForNode) {
            try {
              var textareas = Array.prototype.slice.call(document.querySelectorAll('textarea.scamper-edit-box') || []);
              textareas.forEach(function(ta) {
                try {
                  var box = ta.closest && ta.closest('.hypothesis-box');
                  if (box && box.dataset && String(box.dataset.hypothesisEntryId) === entryIdForNode) {
                    var container = ta.closest && ta.closest('.scamper-tag-container');
                    if (container) matched.push(container);
                  }
                } catch (_e) {
                  // ignore
                }
              });
            } catch (_e) {
              // ignore
            }
          }
        }

        if (matched.length > 0) {
          // Check if any matched container corresponds to the main hypothesis (top-level hypothesis)
          var handledWholeBox = false;
          function normalizeCompareText(s) {
            try {
              return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
            } catch (_e) { return String(s || "").trim(); }
          }

          var removedNorm = normalizeCompareText(removedText);

          for (var mi = 0; mi < matched.length; mi++) {
            var container = matched[mi];
            try {
              var box = container && typeof container.closest === 'function' ? container.closest('.hypothesis-box') : null;
              if (box) {
                var mainTa = box.querySelector && box.querySelector('textarea.hypothesis-text');
                var mainText = mainTa ? String(mainTa.value || '').trim() : '';
                // If the removed mindmap node text matches the main hypothesis text (normalized or partially), ask whether to delete the whole box
                var mainNorm = normalizeCompareText(mainText);
                var isMatch = false;
                if (mainNorm && removedNorm && (mainNorm === removedNorm || mainNorm.indexOf(removedNorm) !== -1 || removedNorm.indexOf(mainNorm) !== -1)) {
                  isMatch = true;
                }
                if (isMatch) {
                  var deleteWhole = confirm(
                    t(
                      'confirms.deleteEntireHypothesisBox',
                      {},
                      'このノードは仮説ボックス内の主仮説に対応しています。仮説ボックスごと削除しますか？\nOK: ボックスごと削除\nキャンセル: SCAMPERタグのみ削除'
                    )
                  );
                  if (deleteWhole) {
                    try {
                      if (box.parentNode) box.parentNode.removeChild(box);
                    } catch (_e) { /* ignore */ }
                    handledWholeBox = true;
                    // update and save
                    try {
                      var wrapperElem = document.querySelector('#hypothesisWrapper');
                      if (wrapperElem && typeof window.updateHypothesisNumbers === 'function') {
                        window.updateHypothesisNumbers(wrapperElem);
                      }
                      if (typeof window.flushHypothesisSave === 'function') {
                        window.flushHypothesisSave();
                      } else if (typeof window.scheduleHypothesisSave === 'function') {
                        window.scheduleHypothesisSave();
                      }
                    } catch (_e) { /* ignore */ }
                    break;
                  }
                }
              }
            } catch (_e) {
              // ignore
            }
          }
          

          if (!handledWholeBox) {
            const shouldDelete = confirm(
              t(
                "confirms.deleteRelatedScamperTags",
                {},
                "対応するSCAMPERタグ（同じ色のSCAMPER入力）を削除しますか？\nOK: 削除\nキャンセル: 残す"
              ) + "\n\n" + ("削除対象: " + matched.length + " 件")
            );
            if (shouldDelete) {
              var removedAny = false;
              matched.forEach(function(el) {
                try {
                  if (el.parentNode) {
                    el.parentNode.removeChild(el);
                    removedAny = true;
                  }
                } catch (_e) { /* ignore */ }
              });

              // If we removed something, try to update hypothesis numbers and trigger save
              try {
                var wrapper = document.querySelector('#hypothesisWrapper');
                if (wrapper && typeof window.updateHypothesisNumbers === 'function') {
                  window.updateHypothesisNumbers(wrapper);
                }
                if (typeof window.flushHypothesisSave === 'function') {
                  window.flushHypothesisSave();
                } else if (typeof window.scheduleHypothesisSave === 'function') {
                  window.scheduleHypothesisSave();
                }
              } catch (_e) {
                // ignore
              }
            }
          }
        }
      } catch (_e) {
        // DOM access may fail in some embed contexts; fall back silently
      }

      diagram.removeParts(rootNode.findTreeParts(), false);
      logMindmapAction(`マインドマップ: ノード削除 source=${source} key=${removedKey} "${removedText}"`);
    });
    diagram.commitTransaction("remove subtree");
    return true;
  }

  function removeNode(node) {
    removeNodesWithConfirm([node], "contextmenu");
  }

  const baseDeleteSelection = diagram.commandHandler.deleteSelection.bind(diagram.commandHandler);
  diagram.commandHandler.deleteSelection = function() {
    const selectedNodes = collectSelectedMindmapNodes();
    if (selectedNodes.length > 0) {
      removeNodesWithConfirm(selectedNodes, "keyboard");
      return;
    }
    baseDeleteSelection();
  };

  /* 初期データをmyTitleから取得 */
  // localStorageからsearchTitleを取得
  var searchTitle = localStorage.getItem('searchTitle');
  var titleInput = document.getElementById('myTitle');
  var initialText = searchTitle || (titleInput && titleInput.value) || t("defaults.newMindmapTitle", {}, "新しいマインドマップ");
  var lastTitleText = initialText;
  diagram.model = new go.TreeModel([
    { key: 0, text: initialText, loc: "0 -200" }
  ]);

  restoreMindmapStateWithRetry(initialText).then((restored) => {
    isMindmapReady = true;
    resetMindmapSaveFingerprintFromCurrent();
    if (!restored) {
      scheduleMindmapSave();
    }
  });

  // myTitleの値が変更されたらルートノードも更新
  if (titleInput) {
    titleInput.addEventListener('input', function() {
      const title = titleInput.value || t("defaults.newMindmapTitle", {}, "新しいマインドマップ");
      diagram.model.set(diagram.model.nodeDataArray[0], "text", title);
      localStorage.setItem('searchTitle', title);
    });
    titleInput.addEventListener('change', function() {
      const newTitle = titleInput.value || t("defaults.newMindmapTitle", {}, "新しいマインドマップ");
      if (newTitle !== lastTitleText) {
        logMindmapAction(`マインドマップ: タイトル変更 "${lastTitleText}" → "${newTitle}"`);
        lastTitleText = newTitle;
        scheduleMindmapSave();
      }
    });
  }

  window.addEventListener("app-language-changed", function() {
    if (!diagram) return;
    diagram.nodes.each(function(node) {
      node.updateTargetBindings();
    });
    diagram.layoutDiagram(true);
  });

  diagram.addModelChangedListener(function(e) {
    if (e.isTransactionFinished) {
      scheduleMindmapSave();
    }
  });

  // 外部スクリプトから参照できるようヘルパーを公開
  window.getMindmapNodes = function () {
    if (!diagram.model) return [];
    return diagram.model.nodeDataArray.map(function (data) {
      return { key: data.key, text: data.text, parent: data.parent };
    });
  };

  window.deleteMindmapNodeByEntryId = function (entryId) {
    if (!diagram.model || !entryId) return false;
    var nodeDataToRemove = null;
    var nodeArray = diagram.model.nodeDataArray;
    for (var i = 0; i < nodeArray.length; i++) {
      if (String(nodeArray[i].hypothesisEntryId) === String(entryId)) {
        nodeDataToRemove = nodeArray[i];
        break;
      }
    }
    if (nodeDataToRemove) {
      diagram.startTransaction('delete mindmap node by entry id');
      var node = diagram.findNodeForData(nodeDataToRemove);
      if (node) {
        diagram.removeParts(node.findTreeParts(), false);
      } else {
        diagram.model.removeNodeData(nodeDataToRemove);
      }
      diagram.commitTransaction('delete mindmap node by entry id');
      return true;
    }
    return false;
  };

  window.addMindmapChild = function (parentKey, text, metadata) {
    if (!diagram.model) return false;
    if (!text || !text.trim()) return false;
    metadata = metadata || {};

    var normalizedKey = parentKey;
    var parentNode = diagram.findNodeForKey(normalizedKey);
    if (!parentNode && typeof parentKey === "string" && parentKey !== "") {
      var numericKey = Number(parentKey);
      if (!isNaN(numericKey)) {
        normalizedKey = numericKey;
        parentNode = diagram.findNodeForKey(normalizedKey);
      }
    }

    if (!parentNode) return false;

    diagram.startTransaction("add mindmap child");
    var newNodeData = { text: text.trim(), parent: parentNode.data.key };
    if (Array.isArray(metadata.basedNodeIds)) {
      newNodeData.basedNodeIds = metadata.basedNodeIds.slice();
    }
    if (Array.isArray(metadata.basedKeywordLabels)) {
      newNodeData.basedKeywordLabels = metadata.basedKeywordLabels.slice();
    }
    if (metadata.hypothesisEntryId) {
      newNodeData.hypothesisEntryId = String(metadata.hypothesisEntryId);
    }
    diagram.model.addNodeData(newNodeData);
    diagram.commitTransaction("add mindmap child");
    diagram.select(diagram.findNodeForData(newNodeData));
    logMindmapAction(`マインドマップ: 子ノード追加 parent=${parentNode.data.key} "${parentNode.data.text}" text="${text.trim()}"`);
    return true;
  };
});

function readMindmapDataArray(value) {
  if (Array.isArray(value)) return value.slice();
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_error) {
      return value.split(/[\u3001,]/).map(function(item) {
        return String(item || "").trim();
      }).filter(Boolean);
    }
  }
  return [];
}

// 仮説関係性マップのノードから仮説を追加
function handleAddHypothesisFromMindmap(node) {
  const data = node && node.data ? node.data : null;
  if (!data) return;

  if (typeof window.showHypothesisAndKeywordDialog === "function") {
    window.showHypothesisAndKeywordDialog({
      parentMindmapKey: data.key,
      defaultNodeIds: [],
      defaultKeywordLabels: [],
    });
  } else {
    alert("仮説追加機能が利用できません。ページを再読み込みしてください。");
  }
}
