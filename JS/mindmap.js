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
          stroke: "#3498DB",
          strokeWidth: 2,
          fill: "#FFFFFF"
        },
        new go.Binding("fill", "key", function(key) {
          return key === 0 ? "#E67E22" : "#FFFFFF";
        }),
        new go.Binding("stroke", "key", function(key) {
          return key === 0 ? "#E67E22" : "#3498DB";
        })
      ),
      $(go.TextBlock,
        {
          margin: 8,
          stroke: "#34495E",
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
          return key === 0 ? "#FFFFFF" : "#34495E";
        })
      ),
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
              { click: (e, obj) => addChild(obj.part.adornedPart) }
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

  window.addMindmapChild = function (parentKey, text) {
    if (!diagram.model) return false;
    if (!text || !text.trim()) return false;

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
    diagram.model.addNodeData(newNodeData);
    diagram.commitTransaction("add mindmap child");
    diagram.select(diagram.findNodeForData(newNodeData));
    logMindmapAction(`マインドマップ: 子ノード追加 parent=${parentNode.data.key} "${parentNode.data.text}" text="${text.trim()}"`);
    return true;
  };
});
