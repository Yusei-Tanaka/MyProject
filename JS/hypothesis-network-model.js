/* Shared browser/server model. Types describe roles, never graph levels. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HypothesisNetworkModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const types = { working: '作業仮説', explanatory: '説明仮説', operational: '検証可能な仮説' };
  const relations = {
    specification: '対象・条件を具体化',
    decomposition: '理由・仕組みを詳しくした',
    operationalization: '検証できる形にした',
  };
  const id = () => typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : `hn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const str = value => typeof value === 'string' ? value : '';
  function node(value = {}) {
    const now = new Date().toISOString();
    return { ...value, id: str(value.id) || id(), text: str(value.text).trim(),
      hypothesisType: Object.hasOwn(types, value.hypothesisType) ? value.hypothesisType : 'working',
      subject: str(value.subject), relationship: str(value.relationship), object: str(value.object),
      context: str(value.context), qualifier: str(value.qualifier), sourceText: str(value.sourceText),
      sourceConversationId: str(value.sourceConversationId),
      createdAt: str(value.createdAt) || now, updatedAt: str(value.updatedAt) || now };
  }
  function edge(value = {}) {
    const relationType = str(value.relationType) || 'specification';
    return { ...value, id: str(value.id) || id(), sourceNodeId: str(value.sourceNodeId),
      targetNodeId: str(value.targetNodeId), relationType,
      label: str(value.label) || (Object.hasOwn(relations, relationType) ? relations[relationType] : relationType),
      aiGenerated: value.aiGenerated === true,
      confidence: Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : null,
      explanation: str(value.explanation), createdAt: str(value.createdAt) || new Date().toISOString() };
  }
  function normalize(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const nodes = (Array.isArray(value.nodes) ? value.nodes : []).filter(v => v && typeof v === 'object').map(node).filter(n => n.text);
    const unique = list => [...new Map(list.map(item => [item.id, item])).values()];
    const ids = new Set(nodes.map(n => n.id));
    return { ...value, schemaVersion: 1, nodes: unique(nodes),
      edges: unique((Array.isArray(value.edges) ? value.edges : []).filter(v => v && typeof v === 'object').map(edge)
        .filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId) && e.sourceNodeId !== e.targetNodeId)),
      candidates: Array.isArray(value.candidates) ? value.candidates.filter(v => v && typeof v === 'object') : [],
      linkCandidates: Array.isArray(value.linkCandidates) ? value.linkCandidates.filter(v => v && typeof v === 'object') : [],
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
  return { types, relations, id, node, edge, normalize, validateEdge, analyze, candidate, segments };
});
