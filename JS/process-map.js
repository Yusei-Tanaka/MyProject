(function () {
  "use strict";

  const NODE_TYPES = [
    { value: "problem_question", label: "問題・疑問", color: "#e8f1fb", border: "#4f7fa8" },
    { value: "suggestion", label: "suggestion", color: "#f0eafa", border: "#7964a8" },
    { value: "idea_working_hypothesis", label: "idea / working hypothesis", color: "#f7edf5", border: "#9b638e" },
    { value: "explanatory_hypothesis", label: "説明仮説", color: "#fff2dc", border: "#a9782e" },
    { value: "reasoning", label: "reasoning", color: "#eef0f2", border: "#68737d" },
    { value: "working_hypothesis", label: "作業仮説", color: "#fff6d9", border: "#9a8129" },
    { value: "information_work", label: "情報収集・作業", color: "#e7f4ef", border: "#4f8873" },
    { value: "result", label: "結果", color: "#e7f3e5", border: "#56874f" },
    { value: "revision_update", label: "修正・更新", color: "#f9e9e7", border: "#a76259" },
  ];

  const EDGE_TYPES = [
    { value: "directed", label: "通常の有向リンク" },
    { value: "suggestion_generation", label: "suggestion生成" },
    { value: "selection_retention", label: "選択・保持" },
    { value: "explanation", label: "説明化" },
    { value: "reasoning", label: "reasoning" },
    { value: "operationalization", label: "操作化" },
    { value: "verification", label: "検証" },
    { value: "support", label: "支持" },
    { value: "rejection", label: "棄却" },
    { value: "revision", label: "修正" },
  ];

  const nodeTypeByValue = new Map(NODE_TYPES.map((type) => [type.value, type]));
  const edgeTypeByValue = new Map(EDGE_TYPES.map((type) => [type.value, type]));
  const state = {
    initialized: false,
    loading: false,
    dirty: false,
    saveInFlight: false,
    saveQueued: false,
    saveTimer: null,
    currentMapId: null,
    map: null,
    breadcrumbs: [],
    childrenByNode: new Map(),
    selection: null,
    linkSourceNodeId: null,
    network: null,
    nodes: null,
    edges: null,
  };

  let elements = {};

  const currentUserId = () => String(localStorage.getItem("userName") || "").trim();
  const currentThemeName = () => {
    const input = document.getElementById("myTitle");
    return String((input && input.value) || localStorage.getItem("searchTitle") || "").trim();
  };
  const currentLanguage = () => {
    if (window.APP_I18N && typeof window.APP_I18N.getLanguage === "function") {
      const language = window.APP_I18N.getLanguage();
      if (language === "ja" || language === "en") return language;
    }
    return (document.documentElement.lang || "ja").toLowerCase().startsWith("en") ? "en" : "ja";
  };
  const apiBaseUrl = () => {
    const config = window.APP_CONFIG || {};
    const protocol = config.protocol || window.location.protocol.replace(":", "") || "http";
    const host = config.host || window.location.hostname || "127.0.0.1";
    return config.apiBaseUrl || `${protocol}://${host}:${Number(config.apiPort || 3000)}`;
  };

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `pm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function setStatus(message, kind = "") {
    if (!elements.status) return;
    elements.status.textContent = message || "";
    elements.status.classList.toggle("is-error", kind === "error");
    elements.status.classList.toggle("is-success", kind === "success");
  }

  function setEditorEnabled(enabled) {
    [
      elements.addNodeBtn,
      elements.addEdgeBtn,
      elements.deleteSelectionBtn,
      elements.reloadBtn,
      elements.saveBtn,
    ].forEach((button) => {
      if (button) button.disabled = !enabled;
    });
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function logProcessAction(eventType, message, payload = {}) {
    const userId = currentUserId();
    if (!userId) return;
    fetch(`${apiBaseUrl()}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        themeName: currentThemeName(),
        eventType,
        logText: message,
        payload: { mapId: state.currentMapId, ...payload },
      }),
    }).catch((error) => console.warn("Process map log failed:", error));
  }

  function fillSelect(select, options) {
    select.replaceChildren();
    options.forEach((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    });
  }

  function nodeStyle(nodeType) {
    const type = nodeTypeByValue.get(nodeType) || NODE_TYPES[0];
    return {
      shape: "box",
      margin: { top: 10, right: 13, bottom: 10, left: 13 },
      color: {
        background: type.color,
        border: type.border,
        highlight: { background: type.color, border: "#e67e22" },
        hover: { background: type.color, border: "#3498db" },
      },
      borderWidth: 2,
      borderWidthSelected: 3,
      font: { color: "#34495e", size: 14, face: "Arial", multi: false },
      widthConstraint: { minimum: 110, maximum: 230 },
    };
  }

  function toVisNode(node) {
    const nodeType = node.nodeType || "problem_question";
    const type = nodeTypeByValue.get(nodeType) || NODE_TYPES[0];
    const content = String(node.content || type.label);
    return {
      id: String(node.nodeId || node.id),
      label: content,
      title: `${type.label}\n${content}`,
      nodeType,
      content,
      memo: String(node.memo || ""),
      relatedKeywords: Array.isArray(node.relatedKeywords) ? node.relatedKeywords : [],
      relatedReference: String(node.relatedReference || ""),
      parentNodeId: node.parentNodeId || null,
      existingReferenceType: String(node.existingReferenceType || ""),
      existingReferenceId: String(node.existingReferenceId || ""),
      createdAt: node.createdAt || new Date().toISOString(),
      updatedAt: node.updatedAt || new Date().toISOString(),
      x: Number.isFinite(Number(node.x)) ? Number(node.x) : undefined,
      y: Number.isFinite(Number(node.y)) ? Number(node.y) : undefined,
      ...nodeStyle(nodeType),
    };
  }

  function toVisEdge(edge) {
    const edgeType = edge.edgeType || "directed";
    const type = edgeTypeByValue.get(edgeType) || EDGE_TYPES[0];
    return {
      id: String(edge.edgeId || edge.id),
      from: String(edge.sourceNodeId || edge.from),
      to: String(edge.targetNodeId || edge.to),
      edgeType,
      label: edgeType === "directed" ? "" : type.label,
      arrows: "to",
      color: { color: "#95a5a6", highlight: "#e67e22", hover: "#3498db" },
      font: { color: "#68737d", size: 11, align: "middle", background: "#ffffff" },
      width: 2,
      smooth: false,
      createdAt: edge.createdAt || new Date().toISOString(),
    };
  }

  function initializeNetwork() {
    if (state.network || !window.vis || !elements.network) return;
    state.nodes = new window.vis.DataSet();
    state.edges = new window.vis.DataSet();
    state.network = new window.vis.Network(
      elements.network,
      { nodes: state.nodes, edges: state.edges },
      {
        autoResize: true,
        physics: { enabled: false },
        interaction: { hover: true, multiselect: true, navigationButtons: false },
        manipulation: { enabled: false },
        edges: { arrows: "to", smooth: false },
      }
    );

    state.network.on("selectNode", (event) => {
      if (!event.nodes.length) return;
      showNodeInspector(String(event.nodes[event.nodes.length - 1]));
    });
    state.network.on("selectEdge", (event) => {
      if (event.nodes && event.nodes.length) return;
      if (event.edges.length) showEdgeInspector(String(event.edges[event.edges.length - 1]));
    });
    state.network.on("click", handleNetworkClick);
    state.network.on("dragEnd", (event) => {
      if (event.nodes && event.nodes.length) markDirty();
    });
    state.network.on("doubleClick", (event) => {
      if (!event.nodes || event.nodes.length !== 1) return;
      const child = state.childrenByNode.get(String(event.nodes[0]));
      if (child) openMap(child.childMapId, "process_hierarchy_down", "下位グレインへ移動");
    });
  }

  function handleNetworkClick(event) {
    if (
      state.linkSourceNodeId === null &&
      (!event.nodes || event.nodes.length === 0) &&
      (!event.edges || event.edges.length === 0)
    ) {
      showEmptyInspector();
      return;
    }
    if (!state.linkSourceNodeId && (!event.nodes || !event.nodes.length)) return;
    if (!event.nodes || event.nodes.length !== 1) return;
    const nodeId = String(event.nodes[0]);
    if (state.linkSourceNodeId === null) return;
    if (state.linkSourceNodeId === "") {
      state.linkSourceNodeId = nodeId;
      setStatus("リンク先のノードを選択してください。");
      return;
    }
    if (state.linkSourceNodeId === nodeId) {
      setStatus("リンク元と異なるノードを選択してください。", "error");
      return;
    }
    createEdge(state.linkSourceNodeId, nodeId, elements.edgeType.value);
    cancelLinkMode();
  }

  function beginLinkMode() {
    if (!state.currentMapId || !state.nodes) {
      setStatus("マップの読み込み完了後に操作してください。", "error");
      return;
    }
    const selected = state.network.getSelectedNodes().map(String);
    if (selected.length === 2) {
      createEdge(selected[0], selected[1], elements.edgeType.value);
      return;
    }
    state.linkSourceNodeId = selected.length === 1 ? selected[0] : "";
    elements.addEdgeBtn.textContent = "リンク作成を取消";
    setStatus(selected.length === 1 ? "リンク先のノードを選択してください。" : "リンク元のノードを選択してください。");
  }

  function cancelLinkMode() {
    state.linkSourceNodeId = null;
    elements.addEdgeBtn.textContent = "リンク作成";
  }

  function createEdge(sourceId, targetId, edgeType) {
    const duplicate = state.edges.get().some(
      (edge) => String(edge.from) === sourceId && String(edge.to) === targetId && edge.edgeType === edgeType
    );
    if (duplicate) {
      setStatus("同じ関係のリンクが既にあります。", "error");
      return;
    }
    const edge = toVisEdge({
      edgeId: createId(),
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      edgeType,
    });
    state.edges.add(edge);
    state.network.selectEdges([edge.id]);
    showEdgeInspector(edge.id);
    markDirty();
    logProcessAction("process_link_add", "探究プロセスマップ: リンク追加", {
      edgeId: edge.id,
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      edgeType,
    });
    setStatus("リンクを追加しました。", "success");
  }

  function serializeSnapshot() {
    const positions = state.network ? state.network.getPositions(state.nodes.getIds()) : {};
    return {
      title: state.map ? state.map.title : currentThemeName(),
      grainSize: state.map ? state.map.grainSize : "研究全体",
      nodes: state.nodes.get().map((node) => ({
        nodeId: String(node.id),
        nodeType: node.nodeType,
        content: String(node.content || node.label || ""),
        memo: String(node.memo || ""),
        relatedKeywords: Array.isArray(node.relatedKeywords) ? node.relatedKeywords : [],
        relatedReference: String(node.relatedReference || ""),
        parentNodeId: node.parentNodeId || null,
        existingReferenceType: String(node.existingReferenceType || ""),
        existingReferenceId: String(node.existingReferenceId || ""),
        x: Number.isFinite(positions[node.id]?.x) ? positions[node.id].x : null,
        y: Number.isFinite(positions[node.id]?.y) ? positions[node.id].y : null,
      })),
      edges: state.edges.get().map((edge) => ({
        edgeId: String(edge.id),
        sourceNodeId: String(edge.from),
        targetNodeId: String(edge.to),
        edgeType: edge.edgeType || "directed",
      })),
    };
  }

  function markDirty() {
    if (state.loading) return;
    state.dirty = true;
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveNow(false), 800);
  }

  async function saveNow(showFeedback = true) {
    if (!state.currentMapId || !state.nodes || !state.dirty) {
      if (showFeedback && state.currentMapId) setStatus("変更はありません。", "success");
      return true;
    }
    if (state.saveInFlight) {
      state.saveQueued = true;
      return false;
    }
    state.saveInFlight = true;
    if (state.saveTimer) clearTimeout(state.saveTimer);
    try {
      if (showFeedback) setStatus("保存しています…");
      await apiFetch(`/process-maps/${encodeURIComponent(state.currentMapId)}/snapshot`, {
        method: "PUT",
        body: JSON.stringify({ userId: currentUserId(), ...serializeSnapshot() }),
      });
      state.dirty = false;
      if (showFeedback) setStatus("保存しました。", "success");
      return true;
    } catch (error) {
      console.error("Process map save failed:", error);
      setStatus(`保存できませんでした: ${error.message}`, "error");
      return false;
    } finally {
      state.saveInFlight = false;
      if (state.saveQueued) {
        state.saveQueued = false;
        if (state.dirty) saveNow(false);
      }
    }
  }

  async function ensureRootMap() {
    const query = new URLSearchParams({
      userId: currentUserId(),
      themeName: currentThemeName(),
      language: currentLanguage(),
    });
    try {
      return await apiFetch(`/process-maps/root?${query.toString()}`);
    } catch (error) {
      if (error.status !== 404) throw error;
      return apiFetch("/process-maps/root", {
        method: "POST",
        body: JSON.stringify({
          userId: currentUserId(),
          themeName: currentThemeName(),
          language: currentLanguage(),
          title: currentThemeName(),
        }),
      });
    }
  }

  async function loadInitialMap() {
    if (!currentUserId() || !currentThemeName()) {
      setStatus("ユーザまたはテーマが未設定です。", "error");
      return;
    }
    state.loading = true;
    setEditorEnabled(false);
    setStatus("探究プロセスマップを読み込んでいます…");
    try {
      const bundle = await ensureRootMap();
      applyBundle(bundle);
      setStatus("読み込みました。", "success");
    } catch (error) {
      console.error("Process map load failed:", error);
      state.initialized = false;
      setStatus(`読み込めませんでした: ${error.message}`, "error");
    } finally {
      state.loading = false;
    }
  }

  async function loadMap(mapId) {
    state.loading = true;
    setEditorEnabled(false);
    setStatus("読み込んでいます…");
    try {
      const query = new URLSearchParams({ userId: currentUserId() });
      const bundle = await apiFetch(`/process-maps/${encodeURIComponent(mapId)}?${query.toString()}`);
      applyBundle(bundle);
      setStatus("読み込みました。", "success");
      return true;
    } catch (error) {
      console.error("Process map load failed:", error);
      setStatus(`読み込めませんでした: ${error.message}`, "error");
      setEditorEnabled(Boolean(state.currentMapId));
      return false;
    } finally {
      state.loading = false;
    }
  }

  async function openMap(mapId, eventType, message) {
    if (state.dirty && !(await saveNow(false))) return;
    if (await loadMap(mapId)) {
      logProcessAction(eventType, `探究プロセスマップ: ${message}`, { destinationMapId: mapId });
    }
  }

  function applyBundle(bundle) {
    cancelLinkMode();
    state.loading = true;
    state.map = bundle.map;
    state.currentMapId = String(bundle.map.mapId);
    state.breadcrumbs = Array.isArray(bundle.breadcrumbs) ? bundle.breadcrumbs : [];
    state.childrenByNode = new Map(
      (Array.isArray(bundle.childMaps) ? bundle.childMaps : []).map((child) => [String(child.parentNodeId), child])
    );
    state.selection = null;
    state.nodes.clear();
    state.edges.clear();
    const nodes = (bundle.nodes || []).map(toVisNode);
    const edges = (bundle.edges || []).map(toVisEdge);
    if (nodes.length) state.nodes.add(nodes);
    if (edges.length) state.edges.add(edges);
    state.dirty = false;
    setEditorEnabled(true);
    updateContext();
    showEmptyInspector();
    updateGuidance();
    requestAnimationFrame(() => {
      state.network.redraw();
      if (nodes.length) state.network.fit({ animation: false });
    });
    state.loading = false;
  }

  function updateContext() {
    elements.title.textContent = state.map?.title || currentThemeName() || "探究プロセスマップ";
    elements.grainSize.textContent = state.map?.grainSize || "研究全体";
    elements.backBtn.disabled = state.breadcrumbs.length <= 1;
    elements.breadcrumbs.replaceChildren();
    state.breadcrumbs.forEach((crumb, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "process-map-breadcrumb-separator";
        separator.textContent = "＞";
        separator.setAttribute("aria-hidden", "true");
        elements.breadcrumbs.appendChild(separator);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = crumb.title;
      if (index === state.breadcrumbs.length - 1) {
        button.setAttribute("aria-current", "page");
        button.disabled = true;
      } else {
        button.addEventListener("click", () => openMap(String(crumb.mapId), "process_hierarchy_up", "パンくずから上位グレインへ移動"));
      }
      elements.breadcrumbs.appendChild(button);
    });
  }

  function showEmptyInspector() {
    state.selection = null;
    elements.emptyInspector.hidden = false;
    elements.nodeForm.hidden = true;
    elements.edgeForm.hidden = true;
    elements.selectionKind.textContent = "未選択";
    updateGuidance();
  }

  function showNodeInspector(nodeId) {
    const node = state.nodes.get(nodeId);
    if (!node) return;
    state.selection = { kind: "node", id: nodeId };
    elements.emptyInspector.hidden = true;
    elements.nodeForm.hidden = false;
    elements.edgeForm.hidden = true;
    elements.selectionKind.textContent = nodeTypeByValue.get(node.nodeType)?.label || "ノード";
    elements.detailNodeType.value = node.nodeType;
    elements.nodeContent.value = node.content || "";
    elements.nodeMemo.value = node.memo || "";
    elements.relatedKeywords.value = (node.relatedKeywords || []).join(", ");
    elements.relatedReference.value = node.relatedReference || "";
    elements.existingReferenceType.value = node.existingReferenceType || "";
    elements.existingReferenceId.value = node.existingReferenceId || "";
    renderRelatedNodes(nodeId);
    const child = state.childrenByNode.get(nodeId);
    elements.childGrainState.textContent = child ? `「${child.title}」があります。` : "まだ作成されていません。";
    elements.childGrainBtn.textContent = child ? "下位グレインを開く" : "下位グレインを作成";
    updateGuidance(nodeId);
  }

  function showEdgeInspector(edgeId) {
    const edge = state.edges.get(edgeId);
    if (!edge) return;
    state.selection = { kind: "edge", id: edgeId };
    elements.emptyInspector.hidden = true;
    elements.nodeForm.hidden = true;
    elements.edgeForm.hidden = false;
    elements.selectionKind.textContent = "リンク";
    const source = state.nodes.get(edge.from);
    const target = state.nodes.get(edge.to);
    elements.edgeSummary.textContent = `${source?.content || edge.from} → ${target?.content || edge.to}`;
    elements.detailEdgeType.value = edge.edgeType || "directed";
    updateGuidance();
  }

  function renderRelatedNodes(nodeId) {
    elements.relatedNodes.replaceChildren();
    const related = state.edges
      .get()
      .filter((edge) => String(edge.from) === nodeId || String(edge.to) === nodeId)
      .map((edge) => {
        const otherId = String(edge.from) === nodeId ? String(edge.to) : String(edge.from);
        return { node: state.nodes.get(otherId), edge, direction: String(edge.from) === nodeId ? "→" : "←" };
      });
    if (!related.length) {
      const item = document.createElement("li");
      item.textContent = "関連ノードはありません。";
      elements.relatedNodes.appendChild(item);
      return;
    }
    related.forEach(({ node, edge, direction }) => {
      const item = document.createElement("li");
      const edgeLabel = edgeTypeByValue.get(edge.edgeType)?.label || "通常の有向リンク";
      item.textContent = `${direction} ${node?.content || "不明なノード"}（${edgeLabel}）`;
      elements.relatedNodes.appendChild(item);
    });
  }

  function updateGuidance(selectedNodeId = null) {
    if (!state.nodes || !window.ProcessMapSupport) return;
    const messages = window.ProcessMapSupport.generateGuidance(state.nodes.get(), state.edges.get());
    const ordered = selectedNodeId
      ? [...messages.filter((message) => message.nodeIds.includes(selectedNodeId)), ...messages.filter((message) => !message.nodeIds.includes(selectedNodeId))]
      : messages;
    elements.guidanceList.replaceChildren();
    if (!ordered.length) {
      const item = document.createElement("li");
      item.textContent = "現在の構造に対する確認事項はありません。";
      elements.guidanceList.appendChild(item);
      return;
    }
    ordered.forEach((message) => {
      const item = document.createElement("li");
      item.textContent = message.message;
      elements.guidanceList.appendChild(item);
    });
  }

  function addNode() {
    if (!state.currentMapId || !state.network) {
      setStatus("マップの読み込み完了後に操作してください。", "error");
      return;
    }
    const nodeType = elements.nodeType.value;
    const type = nodeTypeByValue.get(nodeType) || NODE_TYPES[0];
    const viewPosition = state.network.getViewPosition();
    const offset = state.nodes.length * 12;
    const node = toVisNode({
      nodeId: createId(),
      nodeType,
      content: type.label,
      x: viewPosition.x + (offset % 96),
      y: viewPosition.y + (offset % 72),
    });
    state.nodes.add(node);
    state.network.selectNodes([node.id]);
    showNodeInspector(node.id);
    elements.nodeContent.focus();
    elements.nodeContent.select();
    markDirty();
    logProcessAction("process_node_add", "探究プロセスマップ: ノード追加", {
      nodeId: node.id,
      nodeType,
    });
    setStatus("ノードを追加しました。右側で内容を編集してください。", "success");
  }

  function updateSelectedNode(event) {
    event.preventDefault();
    if (!state.selection || state.selection.kind !== "node") return;
    const node = state.nodes.get(state.selection.id);
    if (!node) return;
    const content = elements.nodeContent.value.trim();
    if (!content) {
      setStatus("ノードの内容を入力してください。", "error");
      elements.nodeContent.focus();
      return;
    }
    const nodeType = elements.detailNodeType.value;
    state.nodes.update({
      id: node.id,
      nodeType,
      content,
      label: content,
      title: `${nodeTypeByValue.get(nodeType)?.label || nodeType}\n${content}`,
      memo: elements.nodeMemo.value.trim(),
      relatedKeywords: [...new Set(elements.relatedKeywords.value.split(/[,、]/).map((value) => value.trim()).filter(Boolean))],
      relatedReference: elements.relatedReference.value.trim(),
      existingReferenceType: elements.existingReferenceType.value,
      existingReferenceId: elements.existingReferenceId.value.trim(),
      updatedAt: new Date().toISOString(),
      ...nodeStyle(nodeType),
    });
    elements.selectionKind.textContent = nodeTypeByValue.get(nodeType)?.label || "ノード";
    markDirty();
    updateGuidance(node.id);
    logProcessAction("process_node_edit", "探究プロセスマップ: ノード編集", {
      nodeId: node.id,
      nodeType,
    });
    setStatus("ノードの変更を反映しました。", "success");
  }

  function deleteNode(nodeId) {
    const node = state.nodes.get(nodeId);
    if (!node) return;
    if (state.childrenByNode.has(nodeId)) {
      setStatus("下位グレインがあるノードは削除できません。先に階層構造を確認してください。", "error");
      return;
    }
    if (!window.confirm(`「${node.content}」を削除しますか？`)) return;
    const connectedEdges = state.edges.get().filter((edge) => String(edge.from) === nodeId || String(edge.to) === nodeId);
    if (connectedEdges.length) state.edges.remove(connectedEdges.map((edge) => edge.id));
    state.nodes.remove(nodeId);
    showEmptyInspector();
    markDirty();
    logProcessAction("process_node_delete", "探究プロセスマップ: ノード削除", {
      nodeId,
      removedEdgeIds: connectedEdges.map((edge) => edge.id),
    });
    connectedEdges.forEach((edge) => {
      logProcessAction("process_link_delete", "探究プロセスマップ: ノード削除に伴うリンク削除", {
        edgeId: edge.id,
        sourceNodeId: edge.from,
        targetNodeId: edge.to,
      });
    });
    setStatus("ノードを削除しました。", "success");
  }

  function deleteEdge(edgeId) {
    const edge = state.edges.get(edgeId);
    if (!edge) return;
    state.edges.remove(edgeId);
    showEmptyInspector();
    markDirty();
    logProcessAction("process_link_delete", "探究プロセスマップ: リンク削除", {
      edgeId,
      sourceNodeId: edge.from,
      targetNodeId: edge.to,
    });
    setStatus("リンクを削除しました。", "success");
  }

  function deleteSelection() {
    if (state.selection?.kind === "node") deleteNode(state.selection.id);
    else if (state.selection?.kind === "edge") deleteEdge(state.selection.id);
    else setStatus("削除するノードまたはリンクを選択してください。", "error");
  }

  function updateSelectedEdge(event) {
    event.preventDefault();
    if (!state.selection || state.selection.kind !== "edge") return;
    const edge = state.edges.get(state.selection.id);
    if (!edge) return;
    const edgeType = elements.detailEdgeType.value;
    state.edges.update({
      id: edge.id,
      edgeType,
      label: edgeType === "directed" ? "" : edgeTypeByValue.get(edgeType)?.label || edgeType,
    });
    markDirty();
    logProcessAction("process_link_edit", "探究プロセスマップ: リンク関係を編集", {
      edgeId: edge.id,
      edgeType,
    });
    setStatus("リンクの関係を更新しました。", "success");
  }

  async function handleChildGrain() {
    if (!state.selection || state.selection.kind !== "node") return;
    const nodeId = state.selection.id;
    const existingChild = state.childrenByNode.get(nodeId);
    if (existingChild) {
      await openMap(String(existingChild.childMapId), "process_hierarchy_down", "下位グレインへ移動");
      return;
    }
    const node = state.nodes.get(nodeId);
    if (!node) return;
    if (state.dirty && !(await saveNow(false))) return;
    const defaultTitle = `${node.content}の検討`;
    const title = window.prompt("下位グレインのテーマ名を入力してください。", defaultTitle);
    if (title === null || !title.trim()) return;
    try {
      setStatus("下位グレインを作成しています…");
      const grainSize = state.breadcrumbs.length <= 1 ? "中間テーマ" : "個別作業";
      const bundle = await apiFetch(`/process-maps/${encodeURIComponent(state.currentMapId)}/children`, {
        method: "POST",
        body: JSON.stringify({ userId: currentUserId(), parentNodeId: nodeId, title: title.trim(), grainSize }),
      });
      applyBundle(bundle);
      logProcessAction("process_hierarchy_create", "探究プロセスマップ: 下位グレイン作成", {
        parentMapId: state.breadcrumbs.length > 1 ? state.breadcrumbs[state.breadcrumbs.length - 2]?.mapId : null,
        parentNodeId: nodeId,
        childMapId: bundle.map.mapId,
      });
      logProcessAction("process_hierarchy_down", "探究プロセスマップ: 作成した下位グレインへ移動", {
        destinationMapId: bundle.map.mapId,
      });
      setStatus("下位グレインを作成しました。", "success");
    } catch (error) {
      console.error("Child process map creation failed:", error);
      setStatus(`下位グレインを作成できませんでした: ${error.message}`, "error");
    }
  }

  async function goBack() {
    if (state.breadcrumbs.length <= 1) return;
    const parent = state.breadcrumbs[state.breadcrumbs.length - 2];
    await openMap(String(parent.mapId), "process_hierarchy_up", "上位グレインへ移動");
  }

  function switchWorkspace(target) {
    const existing = target === "existing";
    elements.existingPanel.hidden = !existing;
    elements.processPanel.hidden = existing;
    elements.existingPanel.classList.toggle("is-active", existing);
    elements.processPanel.classList.toggle("is-active", !existing);
    document.body.dataset.activeWorkspace = target;
    elements.tabs.forEach((tab) => {
      const active = tab.dataset.workspaceTab === target;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (existing) {
      saveNow(false);
      window.dispatchEvent(new Event("app-layout-resized"));
      return;
    }
    initializeNetwork();
    requestAnimationFrame(() => state.network?.redraw());
    if (!state.initialized) {
      state.initialized = true;
      loadInitialMap();
    }
  }

  function bindElements() {
    elements = {
      tabs: [...document.querySelectorAll("[data-workspace-tab]")],
      existingPanel: document.getElementById("existing-system-view"),
      processPanel: document.getElementById("process-map-view"),
      backBtn: document.getElementById("processMapBackBtn"),
      title: document.getElementById("processMapTitle"),
      grainSize: document.getElementById("processMapGrainSize"),
      breadcrumbs: document.getElementById("processMapBreadcrumbs"),
      nodeType: document.getElementById("processNodeType"),
      edgeType: document.getElementById("processEdgeType"),
      addNodeBtn: document.getElementById("processAddNodeBtn"),
      addEdgeBtn: document.getElementById("processAddEdgeBtn"),
      deleteSelectionBtn: document.getElementById("processDeleteSelectionBtn"),
      fitBtn: document.getElementById("processFitBtn"),
      reloadBtn: document.getElementById("processReloadBtn"),
      saveBtn: document.getElementById("processSaveBtn"),
      status: document.getElementById("processMapStatus"),
      network: document.getElementById("processMapNetwork"),
      selectionKind: document.getElementById("processSelectionKind"),
      emptyInspector: document.getElementById("processEmptyInspector"),
      nodeForm: document.getElementById("processNodeForm"),
      edgeForm: document.getElementById("processEdgeForm"),
      detailNodeType: document.getElementById("processDetailNodeType"),
      nodeContent: document.getElementById("processNodeContent"),
      nodeMemo: document.getElementById("processNodeMemo"),
      relatedKeywords: document.getElementById("processRelatedKeywords"),
      relatedReference: document.getElementById("processRelatedReference"),
      existingReferenceType: document.getElementById("processExistingReferenceType"),
      existingReferenceId: document.getElementById("processExistingReferenceId"),
      relatedNodes: document.getElementById("processRelatedNodes"),
      childGrainState: document.getElementById("processChildGrainState"),
      childGrainBtn: document.getElementById("processChildGrainBtn"),
      deleteNodeBtn: document.getElementById("processDeleteNodeBtn"),
      edgeSummary: document.getElementById("processEdgeSummary"),
      detailEdgeType: document.getElementById("processDetailEdgeType"),
      deleteEdgeBtn: document.getElementById("processDeleteEdgeBtn"),
      guidanceList: document.getElementById("processGuidanceList"),
    };
  }

  function initialize() {
    bindElements();
    if (!elements.processPanel || !elements.tabs.length) return;
    fillSelect(elements.nodeType, NODE_TYPES);
    fillSelect(elements.detailNodeType, NODE_TYPES);
    fillSelect(elements.edgeType, EDGE_TYPES);
    fillSelect(elements.detailEdgeType, EDGE_TYPES);
    setEditorEnabled(false);
    elements.tabs.forEach((tab) => tab.addEventListener("click", () => switchWorkspace(tab.dataset.workspaceTab)));
    elements.addNodeBtn.addEventListener("click", addNode);
    elements.addEdgeBtn.addEventListener("click", () => {
      if (state.linkSourceNodeId !== null) cancelLinkMode();
      else beginLinkMode();
    });
    elements.deleteSelectionBtn.addEventListener("click", deleteSelection);
    elements.fitBtn.addEventListener("click", () => state.network?.fit({ animation: true }));
    elements.reloadBtn.addEventListener("click", () => {
      if (!state.currentMapId) return;
      if (state.dirty && !window.confirm("未保存の変更を破棄して再読み込みしますか？")) return;
      loadMap(state.currentMapId);
    });
    elements.saveBtn.addEventListener("click", () => saveNow(true));
    elements.backBtn.addEventListener("click", goBack);
    elements.nodeForm.addEventListener("submit", updateSelectedNode);
    elements.deleteNodeBtn.addEventListener("click", () => {
      if (state.selection?.kind === "node") deleteNode(state.selection.id);
    });
    elements.childGrainBtn.addEventListener("click", handleChildGrain);
    elements.edgeForm.addEventListener("submit", updateSelectedEdge);
    elements.deleteEdgeBtn.addEventListener("click", () => {
      if (state.selection?.kind === "edge") deleteEdge(state.selection.id);
    });
    document.body.dataset.activeWorkspace = "existing";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
