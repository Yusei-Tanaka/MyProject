const assert = require("assert");
const {
  buildConceptMapPromptSnapshot,
  buildScamperPrompt,
  resolvePromptTheme,
} = require("../JS/prompt-context.js");

const theme = resolvePromptTheme({
  inputTitle: "TITLE_MARKER",
  storedTitle: "STALE_STORED_TITLE",
  windowTheme: "STALE_WINDOW_TITLE",
  fallback: "FALLBACK_TITLE",
});
assert.strictEqual(theme, "TITLE_MARKER");

const snapshot = buildConceptMapPromptSnapshot({
  themeName: theme,
  content: {
    title: "STALE_DB_TITLE",
    nodes: [{ id: 1, label: "DB_STATE_MARKER_ALPHA" }],
    edges: [{ from: 1, to: 2, label: "DB_EDGE_MARKER" }],
    mindmap: { modelJson: "MUST_NOT_BE_INCLUDED" },
    hypothesis: { html: "MUST_NOT_BE_INCLUDED" },
  },
});
const parsedSnapshot = JSON.parse(snapshot);
assert.strictEqual(parsedSnapshot.title, "TITLE_MARKER");
assert.strictEqual(parsedSnapshot.nodes[0].label, "DB_STATE_MARKER_ALPHA");
assert.strictEqual(parsedSnapshot.edges[0].label, "DB_EDGE_MARKER");
assert.ok(!snapshot.includes("MUST_NOT_BE_INCLUDED"));

const liveSnapshot = buildConceptMapPromptSnapshot({
  themeName: theme,
  content: { nodes: [{ id: 1, label: "STALE_DB_NODE" }] },
  liveNodes: [{ id: 9, label: "LIVE_STATE_MARKER", nodeType: "keyword" }],
  liveEdges: [],
});
assert.ok(liveSnapshot.includes("LIVE_STATE_MARKER"));
assert.ok(!liveSnapshot.includes("STALE_DB_NODE"));

const prompt = buildScamperPrompt({
  theme,
  hypothesisText: "HYPOTHESIS_MARKER",
  keywords: "PROMPT_KEYWORD_MARKER",
  scamperLabel: "SCAMPER_MARKER",
  screenStateSnapshot: snapshot,
  useEnglishPrompt: false,
});
for (const marker of [
  "TITLE_MARKER",
  "HYPOTHESIS_MARKER",
  "PROMPT_KEYWORD_MARKER",
  "SCAMPER_MARKER",
  "DB_STATE_MARKER_ALPHA",
  "DB_EDGE_MARKER",
]) {
  assert.ok(prompt.includes(marker), `prompt is missing ${marker}`);
}
assert.ok(prompt.includes("JSONスナップショット"));
assert.ok(!prompt.includes("XMLファイル"));

const englishPrompt = buildScamperPrompt({
  theme,
  hypothesisText: "HYPOTHESIS_MARKER",
  keywords: "PROMPT_KEYWORD_MARKER",
  scamperLabel: "SCAMPER_MARKER",
  screenStateSnapshot: snapshot,
  useEnglishPrompt: true,
});
assert.ok(englishPrompt.includes("JSON snapshot"));
assert.ok(!englishPrompt.includes("shown in this XML"));

console.log("prompt context verification passed");
