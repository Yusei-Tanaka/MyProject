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
  const normalizeNodeType = (value) => {
    const nodeType = String(value || "");
    if (nodeType === "problem_question") return "problem";
    if (nodeType === "idea_working_hypothesis") return "idea";
    if (nodeType === "working_hypothesis") return "operational_hypothesis";
    return nodeType;
  };

  function generateGuidance(nodes, edges) {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const safeEdges = Array.isArray(edges) ? edges : [];
    const nodeById = new Map(
      safeNodes.map((node) => [
        normalizeId(node.id ?? node.nodeId),
        { ...node, nodeType: normalizeNodeType(node.nodeType) },
      ])
    );
    const outgoing = new Map();

    safeEdges.forEach((edge) => {
      const source = normalizeId(edge.from ?? edge.sourceNodeId);
      if (!outgoing.has(source)) outgoing.set(source, []);
      outgoing.get(source).push(edge);
    });

    const messages = [];
    const normalizedNodes = [...nodeById.entries()].map(([id, node]) => ({ ...node, _id: id }));

    normalizedNodes
      .filter((node) => node.nodeType === "problem")
      .forEach((node) => {
        const suggestions = (outgoing.get(node._id) || [])
          .map((edge) => nodeById.get(normalizeId(edge.to ?? edge.targetNodeId)))
          .filter((target) => target && target.nodeType === "suggestion");
        if (suggestions.length >= 2) {
          messages.push({
            code: "multiple_suggestions_to_consider",
            nodeIds: [node._id],
            message: "どの可能性をさらに検討したいですか？",
          });
        }
      });

    safeEdges.forEach((edge) => {
      const sourceId = normalizeId(edge.from ?? edge.sourceNodeId);
      const targetId = normalizeId(edge.to ?? edge.targetNodeId);
      const source = nodeById.get(sourceId);
      const target = nodeById.get(targetId);
      const reasoningText = String(edge.reasoningText ?? edge.reasoning_text ?? "").trim();

      if (source?.nodeType === "suggestion" && target?.nodeType === "idea" && !reasoningText) {
        messages.push({
          code: "idea_without_selection_reason",
          nodeIds: [sourceId, targetId],
          edgeIds: [normalizeId(edge.id ?? edge.edgeId)],
          message: "なぜこの可能性を検討する価値があると考えましたか？",
        });
      }

      if (
        source?.nodeType === "explanatory_hypothesis" &&
        target?.nodeType === "operational_hypothesis" &&
        !reasoningText
      ) {
        messages.push({
          code: "missing_reasoning",
          nodeIds: [sourceId, targetId],
          edgeIds: [normalizeId(edge.id ?? edge.edgeId)],
          message: "なぜこの作業仮説によって、この説明仮説を確かめられると考えますか？",
        });
      }
    });

    normalizedNodes
      .filter((node) => node.nodeType === "idea")
      .forEach((node) => {
        const hasExplanation = (outgoing.get(node._id) || []).some((edge) => {
          const target = nodeById.get(normalizeId(edge.to ?? edge.targetNodeId));
          return target?.nodeType === "explanatory_hypothesis";
        });
        if (!hasExplanation) {
          messages.push({
            code: "idea_without_explanation",
            nodeIds: [node._id],
            message: "なぜこの現象・関係が生じると考えますか？",
          });
        }
      });

    normalizedNodes
      .filter((node) => node.nodeType === "explanatory_hypothesis")
      .forEach((node) => {
        const hasOperationalHypothesis = (outgoing.get(node._id) || []).some((edge) => {
          const target = nodeById.get(normalizeId(edge.to ?? edge.targetNodeId));
          return target?.nodeType === "operational_hypothesis";
        });
        if (!hasOperationalHypothesis) {
          messages.push({
            code: "missing_operational_hypothesis",
            nodeIds: [node._id],
            message: "この説明が正しいとすると、何が確認できるはずですか？",
          });
        }
      });

    return messages;
  }

  return { generateGuidance };
});
