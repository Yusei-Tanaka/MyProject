window.addEventListener('DOMContentLoaded', function() {
  const $ = go.GraphObject.make;
  const host = window.location.hostname || "localhost";
  const saveApiBaseUrl = `http://${host}:3005`;
  const themeApiBaseUrl = `http://${host}:3000`;
  const MINDMAP_SNAPSHOT_DIR = "XML";
  const MINDMAP_LEGACY_SNAPSHOT_DIR = "JS/XML";
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

  async function saveMindmapStateToDb(modelJson) {
    const { userId, themeName } = getCurrentUserThemeRaw();
    if (!userId || !themeName) return;

    const putResponse = await fetch(`${themeApiBaseUrl}/users/${encodeURIComponent(userId)}/themes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        themeName,
        content: {
          hypothesis: {
            mapNodes: collectMindmapHypothesisNodes(),
          },
          mindmap: {},
        },
      }),
    });

    if (putResponse.status === 404) {
      if (!hasShownMindmapUserMissingWarning) {
        hasShownMindmapUserMissingWarning = true;
        alert(`ユーザー「${userId}」がDBに存在しないため、仮説関係性マップのDB保存をスキップしました。\nログインし直して（auth_user / host）利用してください。`);
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
    const dirs = [MINDMAP_SNAPSHOT_DIR, MINDMAP_LEGACY_SNAPSHOT_DIR];
    const fileNames = getMindmapRestoreCandidates();

    for (let i = 0; i < fileNames.length; i += 1) {
      const fileName = fileNames[i];
      for (let j = 0; j < dirs.length; j += 1) {
        const dir = dirs[j];
        const path = `${dir}/${fileName}`;
        const response = await fetch(path, { cache: "no-store" });
        if (response.ok) {
          return { response, fileName };
        }
        if (response.status !== 404) {
          throw new Error(`HTTP ${response.status}`);
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
      if (!snapshot) return false;
      const { response, fileName } = snapshot;

      const modelJson = await response.text();
      if (!modelJson || !modelJson.trim()) return false;

      const model = go.Model.fromJson(modelJson);
      diagram.model = model;
      shouldApplyInitialOffset = false;
      initialOffsetApplied = true;
      const root = diagram.findNodeForKey(0);
      if (!root && model.nodeDataArray && model.nodeDataArray.length === 0) {
        diagram.model = new go.TreeModel([{ key: 0, text: defaultTitle, loc: "0 -200" }]);
      }

      const rootData = diagram.model.nodeDataArray.find((n) => n.key === 0);
      if (rootData && rootData.text) {
        const titleInput = document.getElementById("myTitle");
        if (titleInput) titleInput.value = rootData.text;
        localStorage.setItem("searchTitle", rootData.text);
      }

      resetMindmapSaveFingerprintFromCurrent();

      logMindmapAction(`マインドマップ: 復元しました (${fileName})`);
      return true;
    } catch (error) {
      console.error("マインドマップ復元に失敗しました:", error);
      return false;
    } finally {
      isRestoringMindmap = false;
    }
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
          return key === 0 ? NaN : 120;
        }),
        new go.Binding("stroke", "key", function(key) {
          return key === 0 ? "#FFFFFF" : "#34495E";
        })
      ),
      {
        doubleClick: (e, node) => {
          const oldText = node.data.text;
          const newText = prompt("ノードのテキストを変更:", oldText);
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
              $(go.TextBlock, "子ノードを追加"),
              { click: (e, obj) => addChild(obj.part.adornedPart) }
            ),
            $("ContextMenuButton",
              $(go.TextBlock, "ノードを削除"),
              { click: (e, obj) => removeNode(obj.part.adornedPart) }
            )
          )
      }
    );

  /* リンクライン */
  diagram.linkTemplate = $(go.Link, $(go.Shape, { stroke: "#95A5A6", strokeWidth: 2 }));

  /* 子ノードの追加 */
  function addChild(node) {
    const inputText = prompt("追加するノードのテキスト:", "");
    if (inputText === null) return;
    const normalizedText = String(inputText || "").trim();
    if (!normalizedText) {
      alert("ノード名を入力してください。");
      return;
    }

    diagram.startTransaction("add child");
    const newNodeData = { text: normalizedText, parent: node.data.key };
    diagram.model.addNodeData(newNodeData);
    diagram.commitTransaction("add child");
    logMindmapAction(`マインドマップ: 子ノード追加 parent=${node.data.key} "${node.data.text}" text="${normalizedText}"`);
  }

  /* ノードの削除 */
  function removeNode(node) {
    if (!node) return;
    if (node.data && node.data.key === 0) {
      alert("タイトルノードは削除できません。");
      return;
    }
    const removedKey = node.data && node.data.key !== undefined ? node.data.key : "";
    const removedText = node.data && node.data.text ? node.data.text : "";
    diagram.startTransaction("remove subtree");
    var subtree = node.findTreeParts();
    diagram.removeParts(subtree, false);
    diagram.commitTransaction("remove subtree");
    logMindmapAction(`マインドマップ: ノード削除 key=${removedKey} "${removedText}"`);
  }

  /* 初期データをmyTitleから取得 */
  // localStorageからsearchTitleを取得
  var searchTitle = localStorage.getItem('searchTitle');
  var titleInput = document.getElementById('myTitle');
  var initialText = searchTitle || (titleInput && titleInput.value) || "新しいマインドマップ";
  var lastTitleText = initialText;
  diagram.model = new go.TreeModel([
    { key: 0, text: initialText, loc: "0 -200" }
  ]);

  restoreMindmapState(initialText).then((restored) => {
    isMindmapReady = true;
    resetMindmapSaveFingerprintFromCurrent();
    if (!restored) {
      scheduleMindmapSave();
    }
  });

  // myTitleの値が変更されたらルートノードも更新
  if (titleInput) {
    titleInput.addEventListener('input', function() {
      diagram.model.set(diagram.model.nodeDataArray[0], "text", titleInput.value || "新しいマインドマップ");
      localStorage.setItem('searchTitle', titleInput.value || "新しいマインドマップ");
    });
    titleInput.addEventListener('change', function() {
      const newTitle = titleInput.value || "新しいマインドマップ";
      if (newTitle !== lastTitleText) {
        logMindmapAction(`マインドマップ: タイトル変更 "${lastTitleText}" → "${newTitle}"`);
        lastTitleText = newTitle;
        scheduleMindmapSave();
      }
    });
  }

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