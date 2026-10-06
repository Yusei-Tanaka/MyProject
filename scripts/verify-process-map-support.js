const assert = require("assert");
const { generateGuidance } = require("../JS/process-map-support.js");

const node = (id, nodeType) => ({ id, nodeType });
const edge = (id, from, to, edgeType = "directed") => ({ id, from, to, edgeType });

const explanationOnly = generateGuidance([node("e", "explanatory_hypothesis")], []);
assert(explanationOnly.some((item) => item.code === "missing_working_hypothesis"));

const unlinkedWork = generateGuidance([node("w", "information_work")], []);
assert(unlinkedWork.some((item) => item.code === "work_without_hypothesis"));

const resultWithoutUpdate = generateGuidance([node("r", "result")], []);
assert(resultWithoutUpdate.some((item) => item.code === "result_without_update"));

const ideaWithoutExplanation = generateGuidance([node("i", "idea_working_hypothesis")], []);
assert(ideaWithoutExplanation.some((item) => item.code === "idea_without_explanation"));

const connected = generateGuidance(
  [
    node("e", "explanatory_hypothesis"),
    node("h", "working_hypothesis"),
    node("w", "information_work"),
    node("r", "result"),
    node("u", "revision_update"),
    node("i", "idea_working_hypothesis"),
  ],
  [
    edge("1", "e", "w", "verification"),
    edge("2", "r", "u", "revision"),
    edge("3", "i", "e", "explanation"),
  ]
);
assert.strictEqual(connected.length, 0);

console.log("process-map-support: all checks passed");
