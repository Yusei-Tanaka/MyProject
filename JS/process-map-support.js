(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ProcessMapSupport = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const normalizeId = (value) => String(value ?? "");

  function generateGuidance(nodes, edges) {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const safeEdges = Array.isArray(edges) ? edges : [];
    const nodeById = new Map(safeNodes.map((node) => [normalizeId(node.id ?? node.nodeId), node]));
    const outgoing = new Map();
    const incoming = new Map();

    safeEdges.forEach((edge) => {
      const source = normalizeId(edge.from ?? edge.sourceNodeId);
      const target = normalizeId(edge.to ?? edge.targetNodeId);
      if (!outgoing.has(source)) outgoing.set(source, []);
      if (!incoming.has(target)) incoming.set(target, []);
      outgoing.get(source).push(edge);
      incoming.get(target).push(edge);
    });

    const messages = [];
    const explanationNodes = safeNodes.filter((node) => node.nodeType === "explanatory_hypothesis");
    const workingNodes = safeNodes.filter((node) => node.nodeType === "working_hypothesis");

    if (explanationNodes.length > 0 && workingNodes.length === 0) {
      messages.push({
        code: "missing_working_hypothesis",
        nodeIds: explanationNodes.map((node) => normalizeId(node.id ?? node.nodeId)),
        message: "この説明が正しい場合、何が観察されると考えられますか？",
      });
    }

    safeNodes
      .filter((node) => node.nodeType === "information_work")
      .forEach((node) => {
        const nodeId = normalizeId(node.id ?? node.nodeId);
        const isLinkedToHypothesis = (incoming.get(nodeId) || []).some((edge) => {
          const sourceNode = nodeById.get(normalizeId(edge.from ?? edge.sourceNodeId));
          return sourceNode && ["explanatory_hypothesis", "working_hypothesis"].includes(sourceNode.nodeType);
        });
        if (!isLinkedToHypothesis) {
          messages.push({
            code: "work_without_hypothesis",
            nodeIds: [nodeId],
            message: "この作業は、どの仮説を検証するためのものですか？",
          });
        }
      });

    safeNodes
      .filter((node) => node.nodeType === "result")
      .forEach((node) => {
        const nodeId = normalizeId(node.id ?? node.nodeId);
        const hasUpdateTarget = (outgoing.get(nodeId) || []).some((edge) => {
          const edgeType = edge.edgeType || edge.edge_type || "directed";
          const targetNode = nodeById.get(normalizeId(edge.to ?? edge.targetNodeId));
          return (
            ["support", "rejection", "revision"].includes(edgeType) ||
            (targetNode && ["explanatory_hypothesis", "working_hypothesis", "revision_update"].includes(targetNode.nodeType))
          );
        });
        if (!hasUpdateTarget) {
          messages.push({
            code: "result_without_update",
            nodeIds: [nodeId],
            message: "この結果によって、どの仮説が支持・修正されましたか？",
          });
        }
      });

    safeNodes
      .filter((node) => node.nodeType === "idea_working_hypothesis")
      .forEach((node) => {
        const nodeId = normalizeId(node.id ?? node.nodeId);
        const hasExplanation = (outgoing.get(nodeId) || []).some((edge) => {
          const targetNode = nodeById.get(normalizeId(edge.to ?? edge.targetNodeId));
          return targetNode && targetNode.nodeType === "explanatory_hypothesis";
        });
        if (!hasExplanation) {
          messages.push({
            code: "idea_without_explanation",
            nodeIds: [nodeId],
            message: "なぜこのideaが成り立つと考えますか？",
          });
        }
      });

    return messages;
  }

  return { generateGuidance };
});
