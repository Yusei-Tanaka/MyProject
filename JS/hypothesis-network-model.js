/* Shared browser/server model. Types describe roles, never graph levels. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HypothesisNetworkModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const types = { working: '作業仮説', explanatory: '説明仮説', operational: '検証可能な仮説', idea: 'working hypothesis', unclassified: '未分類' };
  const relations = {
    specification: '対象・条件を具体化',
    decomposition: '理由・仕組みを詳しくした',
    operationalization: '検証できる形にした', alternative: '代替的な説明', complement: '補完', unclassified: 'その他・未分類',
  };
  const id = () => typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : `hn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const str = value => typeof value === 'string' ? value : '';
  function node(value = {}) {
    const now = new Date().toISOString();
    let legacyLabels = [];
    try { const labels = JSON.parse(value.context); if (Array.isArray(labels) && labels.every(v => typeof v === 'string')) legacyLabels = labels; } catch (_) {}
    const keywordLabels = Array.isArray(value.keywordLabels) ? value.keywordLabels : legacyLabels;
    const keywordNodeIds = Array.isArray(value.keywordNodeIds) ? value.keywordNodeIds : [];
    return { ...value, id: str(value.id) || id(), text: str(value.text).trim(),
      hypothesisType: Object.hasOwn(types, value.hypothesisType) ? value.hypothesisType : 'unclassified',
      subject: str(value.subject), relationship: str(value.relationship), object: str(value.object),
      keywordNodeIds: [...new Set(keywordNodeIds.filter(v => typeof v === 'string' || typeof v === 'number').map(String))],
      keywordLabels: keywordLabels.map(str),
      context: legacyLabels.length ? '' : str(value.context), qualifier: str(value.qualifier), sourceText: str(value.sourceText),
      sourceConversationId: str(value.sourceConversationId),
      reviewStatus: str(value.reviewStatus) || 'unexamined',
      position: value.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y) ? {x:value.position.x,y:value.position.y} : null,
      createdAt: str(value.createdAt) || now, updatedAt: str(value.updatedAt) || now };
  }
  function edge(value = {}) {
    const relationType = str(value.relationType) || 'unclassified';
    return { ...value, id: str(value.id) || id(), sourceNodeId: str(value.sourceNodeId),
      targetNodeId: str(value.targetNodeId), relationType,
      label: typeof value.label === 'string' ? value.label : (Object.hasOwn(relations, relationType) ? relations[relationType] : relationType),
      aiGenerated: value.aiGenerated === true,
      confidence: Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : null,
      explanation: str(value.explanation), createdAt: str(value.createdAt) || new Date().toISOString() };
  }
  function normalize(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const nodes = (Array.isArray(value.nodes) ? value.nodes : []).filter(v => v && typeof v === 'object').map(node).filter(n => n.text);
    const unique = list => [...new Map(list.map(item => [item.id, item])).values()];
    const ids = new Set(nodes.map(n => n.id));
    return { ...value, schemaVersion: 2, nodes: unique(nodes),
      edges: unique((Array.isArray(value.edges) ? value.edges : []).filter(v => v && typeof v === 'object').map(edge)
        .filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId) && e.sourceNodeId !== e.targetNodeId)),
      candidates: Array.isArray(value.candidates) ? value.candidates.filter(v => v && typeof v === 'object') : [],
      linkCandidates: Array.isArray(value.linkCandidates) ? value.linkCandidates.filter(v => v && typeof v === 'object') : [],
      sessions: Array.isArray(value.sessions) ? unique(value.sessions.filter(v => v && typeof v === 'object').map(v => ({...v, id:str(v.id) || id(), nodeId:str(v.nodeId), text:str(v.text), questions:Array.isArray(v.questions) ? v.questions : [], history:Array.isArray(v.history) ? v.history : []}))) : [],
      conversations: Array.isArray(value.conversations) ? value.conversations.filter(v => v && typeof v === 'object') : [] };
  }
  function validateEdge(graph, value, allowCycles = false) {
    if (!graph.nodes.some(n => n.id === value.sourceNodeId) || !graph.nodes.some(n => n.id === value.targetNodeId)) return 'リンクの両端に仮説を選択してください。';
    if (value.sourceNodeId === value.targetNodeId) return '同じ仮説へのリンクは追加できません。';
    const edges = graph.edges.filter(e => e.id !== value.id);
    if (edges.some(e => e.sourceNodeId === value.sourceNodeId && e.targetNodeId === value.targetNodeId && e.relationType === value.relationType)) return '同じ関係のリンクが既にあります。';
    if (!allowCycles) {
      const seen = new Set(), stack = [value.targetNodeId];
      while (stack.length) {
        const current = stack.pop();
        if (current === value.sourceNodeId) return '循環するリンクです。方向またはリンク先を見直してください。';
        if (seen.has(current)) continue;
        seen.add(current);
        edges.filter(e => e.sourceNodeId === current).forEach(e => stack.push(e.targetNodeId));
      }
    }
    return '';
  }
  function analyze(graph) {
    const nodeTypes = {}, relationTypes = {}, degrees = {};
    graph.nodes.forEach(n => { nodeTypes[n.hypothesisType] = (nodeTypes[n.hypothesisType] || 0) + 1; degrees[n.id] = { incoming: 0, outgoing: 0 }; });
    graph.edges.forEach(e => {
      relationTypes[e.relationType] = (relationTypes[e.relationType] || 0) + 1;
      if (degrees[e.sourceNodeId]) degrees[e.sourceNodeId].outgoing++;
      if (degrees[e.targetNodeId]) degrees[e.targetNodeId].incoming++;
    });
    const guidance = [];
    if (graph.nodes.length) {
      if (!relationTypes.specification) guidance.push({ relationType: 'specification', observation: '対象や条件を具体化する関係がまだありません。', question: 'どのような対象や条件を想定していますか？' });
      if (!relationTypes.decomposition) guidance.push({ relationType: 'decomposition', observation: '理由・仕組みを詳しくする関係がまだありません。', question: 'なぜその関係が生じると考えられますか？' });
      if (!relationTypes.operationalization) guidance.push({ relationType: 'operationalization', observation: '観察・検証につながる関係がまだありません。', question: 'その仮説が正しい場合、具体的にどのような結果が観察されるでしょうか？' });
    }
    return { nodeTypes, relationTypes, degrees, isolated: Object.keys(degrees).filter(k => !degrees[k].incoming && !degrees[k].outgoing),
      branches: Object.keys(degrees).filter(k => degrees[k].outgoing > 1), integrations: Object.keys(degrees).filter(k => degrees[k].incoming > 1), guidance };
  }
  // Offsets refer to the exact stored source snapshot, using JavaScript UTF-16 indices.
  function candidate(value, source) {
    const quote = str(value.sourceText);
    let start = Number.isInteger(value.start) ? value.start : source.text.indexOf(quote);
    let end = Number.isInteger(value.end) ? value.end : start + quote.length;
    if (!quote || start < 0 || end <= start || source.text.slice(start, end) !== quote) {
      start = source.text.indexOf(quote); end = start + quote.length;
    }
    if (!quote || start < 0 || source.text.slice(start, end) !== quote) return null;
    return { ...node(value), sourceId: source.id, sourceConversationId: source.conversationId || '',
      sourceSnapshot: source.text, sourceText: quote, start, end, status: 'pending', aiGenerated: true };
  }
  function segments(text, candidates) {
    const valid = candidates.filter(c => c.status !== 'excluded' && c.sourceSnapshot === text && Number.isInteger(c.start) && Number.isInteger(c.end) && c.start >= 0 && c.end <= text.length && c.end > c.start);
    const points = [...new Set([0, text.length, ...valid.flatMap(c => [c.start, c.end])])].sort((a,b) => a-b);
    return points.slice(0,-1).map((start,i) => ({ text: text.slice(start,points[i+1]), start, end: points[i+1],
      candidates: valid.filter(c => c.start < points[i+1] && c.end > start).map(c => c.id) }));
  }
  function mergeProcessHypotheses(graph, bundles, themeName = '') {
    const result = normalize(graph);
    const roles = { explanatory_hypothesis: 'explanatory', working_hypothesis: 'working', operational_hypothesis: 'working' };
    // Discard only untouched idea nodes from the earlier process importer.
    result.nodes = result.nodes.filter(n => !(n.hypothesisType === 'idea' && n.processSources?.length && n.text === n.sourceText));
    const sourceKey = source => JSON.stringify([String(source.mapId), String(source.nodeId)]);
    const textKey = value => JSON.stringify([value.hypothesisType, value.text.replace(/\s+/g, ' ').trim()]);
    const bySource = new Map(), byText = new Map(), selectedSources = new Map(), rawNodes = new Map(), outgoing = new Map();
    const rootBundle = bundles.find(b => b?.map?.isRoot) || bundles[0];
    const title = str(themeName).trim() || str(rootBundle?.map?.title).trim();
    let themeNode = result.nodes.find(n => n.nodeKind === 'theme');
    if (title) {
      if (!themeNode) { themeNode = node({id:'research-theme', nodeKind:'theme', text:title}); result.nodes.unshift(themeNode); }
      else themeNode.text = title;
    }
    result.nodes.forEach(n => {
      byText.set(textKey(n), n);
      (n.processSources || []).forEach(source => bySource.set(sourceKey(source), n));
    });
    let added = 0;
    for (const bundle of bundles) {
      const map = bundle?.map;
      if (map?.mapId == null) continue;
      for (const processNode of bundle.nodes || []) {
        const rawKey = sourceKey({mapId:map.mapId,nodeId:processNode.nodeId});
        rawNodes.set(rawKey, {...processNode, mapId:String(map.mapId)});
        const role = roles[processNode.nodeType];
        const text = str(processNode.content).trim();
        if (!role || !text || !processNode.nodeId) continue;
        const source = { mapId: String(map.mapId), nodeId: String(processNode.nodeId),
          title: str(map.title), grainSize: str(map.grainSize), sourceText: text };
        const incoming = node({ text, sourceText: text, hypothesisType: role,
          keywordLabels: processNode.relatedKeywords || [], processSources: [source] });
        const existing = bySource.get(sourceKey(source)) || byText.get(textKey(incoming));
        if (existing) {
          // Re-importing must retain edits made in the structured workspace.
          existing.processSources = (existing.processSources || []).filter(s => sourceKey(s) !== sourceKey(source));
          existing.processSources.push(source);
          existing.keywordLabels = [...new Set([...existing.keywordLabels, ...incoming.keywordLabels])];
          bySource.set(sourceKey(source), existing);
          selectedSources.set(rawKey, existing);
        } else {
          result.nodes.push(incoming);
          bySource.set(sourceKey(source), incoming);
          byText.set(textKey(incoming), incoming);
          selectedSources.set(rawKey, incoming);
          added++;
        }
      }
    }
    const connect = (from, to, original) => {
      if (!rawNodes.has(from) || !rawNodes.has(to)) return;
      if (!outgoing.has(from)) outgoing.set(from, []);
      outgoing.get(from).push({to, original});
    };
    const entries = bundle => {
      const targets = new Set((bundle.edges || []).map(e => String(e.targetNodeId)));
      const roots = (bundle.nodes || []).filter(n => !targets.has(String(n.nodeId)));
      return roots.length ? roots : [(bundle.nodes || []).find(n => n.nodeType === 'problem_question') || bundle.nodes?.[0]].filter(Boolean);
    };
    for (const bundle of bundles) {
      if (bundle?.map?.mapId == null) continue;
      const mapId = String(bundle.map.mapId);
      for (const original of bundle.edges || []) {
        connect(sourceKey({mapId,nodeId:original.sourceNodeId}), sourceKey({mapId,nodeId:original.targetNodeId}), {...original,mapId});
      }
      for (const child of bundle.childMaps || []) {
        const childBundle = bundles.find(b => String(b?.map?.mapId) === String(child.childMapId));
        if (!childBundle) continue;
        for (const entry of entries(childBundle)) {
          connect(sourceKey({mapId,nodeId:child.parentNodeId}), sourceKey({mapId:child.childMapId,nodeId:entry.nodeId}),
            {mapId,parentNodeId:child.parentNodeId,childMapId:String(child.childMapId),edgeType:'hierarchy'});
        }
      }
    }
    const ids = new Set(result.nodes.map(n => n.id));
    result.edges = result.edges.filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
    result.edges.forEach(e => { if (e.processPaths) e.processPaths = [...e.processPaths]; });
    const labels = {directed:'',suggestion_generation:'suggestion生成',selection_retention:'選択・保持',explanation:'説明化',
      reasoning:'reasoning',operationalization:'操作化',verification:'検証',support:'支持',rejection:'棄却',revision:'修正',hierarchy:'下位'};
    const pathKey = path => JSON.stringify([path.nodes.map(n => [n.mapId,n.nodeId]),path.edges.map(e => [e.mapId,e.edgeId || [e.parentNodeId,e.childMapId]])]);
    const existingPaths = new Map();
    result.edges.forEach(e => (e.processPaths || []).forEach(path => existingPaths.set(pathKey(path), e)));
    const projected = new Map();
    function walk(from, rawKey, pathNodes, pathEdges, visited) {
      if (visited.has(rawKey)) return;
      const raw = rawNodes.get(rawKey);
      if (!raw) return;
      const nextNodes = [...pathNodes, {mapId:raw.mapId,nodeId:raw.nodeId,nodeType:raw.nodeType,content:raw.content}];
      const target = selectedSources.get(rawKey);
      if (target && target.id !== from.id) {
        const last = [...pathEdges].reverse().find(e => e.edgeType !== 'hierarchy') || pathEdges.at(-1);
        if (!last && from.nodeKind !== 'theme') return;
        const path = {nodes:nextNodes,edges:pathEdges};
        const signature = pathKey(path), relationType = last?.edgeType || 'theme';
        const pair = JSON.stringify([from.id,target.id,relationType]);
        let link = existingPaths.get(signature) || projected.get(pair);
        if (!link) {
          link = edge({sourceNodeId:from.id,targetNodeId:target.id,relationType,
            label:last?.label || labels[relationType] || relationType,
            explanation:nextNodes.filter(n => n.nodeType === 'reasoning').map(n => n.content).join('\n'),processPaths:[]});
          // A normal process link has no caption.
          if ((relationType === 'directed' || relationType === 'theme') && !last?.label) link.label = '';
          result.edges.push(link);
        }
        if (!link.processPaths.some(p => pathKey(p) === signature)) link.processPaths.push(path);
        projected.set(pair, link); existingPaths.set(signature, link);
        return;
      }
      const nextVisited = new Set(visited); nextVisited.add(rawKey);
      for (const hop of outgoing.get(rawKey) || []) walk(from,hop.to,nextNodes,[...pathEdges,hop.original],nextVisited);
    }
    for (const [rawKey, from] of selectedSources) {
      const raw = rawNodes.get(rawKey);
      for (const hop of outgoing.get(rawKey) || []) walk(from,hop.to,[{mapId:raw.mapId,nodeId:raw.nodeId,nodeType:raw.nodeType,content:raw.content}], [hop.original], new Set([rawKey]));
    }
    if (themeNode && rootBundle) for (const entry of entries(rootBundle)) {
      walk(themeNode,sourceKey({mapId:rootBundle.map.mapId,nodeId:entry.nodeId}),[],[],new Set());
    }
    return { graph: result, added };
  }
  return { types, relations, id, node, edge, normalize, validateEdge, analyze, candidate, segments, mergeProcessHypotheses };
});
