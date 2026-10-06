const assert = require("assert");
const { generateGuidance } = require("../JS/process-map-support.js");

const node = (id, nodeType) => ({ id, nodeType });
const edge = (id, from, to, edgeType = "directed", reasoningText = "") => ({
  id,
  from,
  to,
  edgeType,
  reasoningText,
});

const branching = generateGuidance(
  [node("p", "problem"), node("s1", "suggestion"), node("s2", "suggestion")],
  [edge("1", "p", "s1", "suggestion_generation"), edge("2", "p", "s2", "suggestion_generation")]
);
assert(branching.some((item) => item.code === "multiple_suggestions_to_consider"));

const ideaWithoutReason = generateGuidance(
  [node("s", "suggestion"), node("i", "idea")],
  [edge("1", "s", "i", "selection_retention")]
);
assert(ideaWithoutReason.some((item) => item.code === "idea_without_selection_reason"));
assert(ideaWithoutReason.some((item) => item.code === "idea_without_explanation"));

const explanationOnly = generateGuidance([node("e", "explanatory_hypothesis")], []);
assert(explanationOnly.some((item) => item.code === "missing_operational_hypothesis"));

const missingReasoning = generateGuidance(
  [node("e", "explanatory_hypothesis"), node("o", "operational_hypothesis")],
  [edge("1", "e", "o", "operationalization")]
);
assert(missingReasoning.some((item) => item.code === "missing_reasoning"));

const connected = generateGuidance(
  [
    node("p", "problem"),
    node("s", "suggestion"),
    node("i", "idea"),
    node("e", "explanatory_hypothesis"),
    node("o", "operational_hypothesis"),
  ],
  [
    edge("1", "p", "s", "suggestion_generation"),
    edge("2", "s", "i", "selection_retention", "検討する価値があるため"),
    edge("3", "i", "e", "explanation"),
    edge("4", "e", "o", "operationalization", "文献中の記述として確認できるため"),
  ]
);
assert.strictEqual(connected.length, 0);

const legacy = generateGuidance(
  [node("e", "explanatory_hypothesis"), node("o", "working_hypothesis")],
  [edge("1", "e", "o", "operationalization")]
);
assert(legacy.some((item) => item.code === "missing_reasoning"));

console.log("process-map-support: all checks passed");
