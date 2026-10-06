const assert = require("assert");
const crypto = require("crypto");

const baseUrl = process.env.PROCESS_MAP_API_BASE_URL || "http://127.0.0.1:3000";
const userId = `pm_test_${Date.now().toString(36)}`.slice(0, 32);
const themeName = "探究プロセスマップAPI確認";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${options.method || "GET"} ${path}: HTTP ${response.status} ${payload.error || ""}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

const nodeTypes = [
  "problem_question",
  "suggestion",
  "idea_working_hypothesis",
  "explanatory_hypothesis",
  "reasoning",
  "working_hypothesis",
  "information_work",
  "result",
  "revision_update",
];

async function run() {
  let createdUser = false;
  try {
    await request("/users", {
      method: "POST",
      body: JSON.stringify({ id: userId, passwordHash: "process-map-test" }),
    });
    createdUser = true;
    await request(`/users/${encodeURIComponent(userId)}/themes`, {
      method: "PUT",
      body: JSON.stringify({
        themeName,
        language: "ja",
        content: { title: themeName, language: "ja", keywordNodes: [], nodes: [], edges: [] },
      }),
    });

    const root = await request("/process-maps/root", {
      method: "POST",
      body: JSON.stringify({ userId, themeName, language: "ja", title: themeName }),
    });
    assert(root.map.mapId > 0);
    assert.strictEqual(root.map.grainSize, "研究全体");

    const nodes = nodeTypes.map((nodeType, index) => ({
      nodeId: crypto.randomUUID(),
      nodeType,
      content: `${index + 1}: ${nodeType}`,
      memo: `memo-${index + 1}`,
      relatedKeywords: [`keyword-${index + 1}`],
      relatedReference: "test reference",
      existingReferenceType: index === 0 ? "hypothesis" : "",
      existingReferenceId: index === 0 ? "test-hypothesis" : "",
      x: index * 120,
      y: index % 2 === 0 ? 0 : 100,
    }));
    const edges = nodes.slice(0, -1).map((node, index) => ({
      edgeId: crypto.randomUUID(),
      sourceNodeId: node.nodeId,
      targetNodeId: nodes[index + 1].nodeId,
      edgeType: "directed",
    }));

    await request(`/process-maps/${root.map.mapId}/snapshot`, {
      method: "PUT",
      body: JSON.stringify({
        userId,
        title: themeName,
        grainSize: "研究全体",
        nodes,
        edges,
      }),
    });

    const reloaded = await request(
      `/process-maps/root?${new URLSearchParams({ userId, themeName, language: "ja" })}`
    );
    assert.strictEqual(reloaded.nodes.length, 9);
    assert.strictEqual(reloaded.edges.length, 8);
    assert.strictEqual(
      reloaded.nodes.find((node) => node.nodeId === nodes[0].nodeId)?.existingReferenceType,
      "hypothesis"
    );

    const child = await request(`/process-maps/${root.map.mapId}/children`, {
      method: "POST",
      body: JSON.stringify({
        userId,
        parentNodeId: nodes[0].nodeId,
        title: "下位グレインAPI確認",
        grainSize: "中間テーマ",
      }),
    });
    assert.strictEqual(child.breadcrumbs.length, 2);
    assert.strictEqual(child.breadcrumbs[0].mapId, root.map.mapId);

    const parentReloaded = await request(`/process-maps/${root.map.mapId}?userId=${encodeURIComponent(userId)}`);
    assert.strictEqual(parentReloaded.childMaps.length, 1);
    assert.strictEqual(parentReloaded.childMaps[0].childMapId, child.map.mapId);

    let protectedDeleteRejected = false;
    try {
      await request(`/process-maps/${root.map.mapId}/snapshot`, {
        method: "PUT",
        body: JSON.stringify({
          userId,
          title: themeName,
          grainSize: "研究全体",
          nodes: nodes.slice(1),
          edges: edges.slice(1),
        }),
      });
    } catch (error) {
      protectedDeleteRejected = error.status === 409;
    }
    assert(protectedDeleteRejected, "a parent node with a child grain must be protected");

    console.log("process-map-api: all checks passed");
  } finally {
    if (createdUser) {
      await request(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch((error) => {
        console.error(`temporary test user cleanup failed: ${error.message}`);
      });
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
