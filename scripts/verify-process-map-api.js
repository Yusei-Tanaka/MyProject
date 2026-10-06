const assert = require("assert");
const crypto = require("crypto");

const baseUrl = process.env.PROCESS_MAP_API_BASE_URL || "http://127.0.0.1:3000";
const userId = `pm_test_${Date.now().toString(36)}`.slice(0, 32);
const themeName = "仮説形成API確認";

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

    const makeNode = (nodeType, content, x, y) => ({
      nodeId: crypto.randomUUID(),
      nodeType,
      content,
      memo: "",
      relatedKeywords: [],
      relatedReference: "",
      existingReferenceType: "",
      existingReferenceId: "",
      x,
      y,
    });
    const problem = makeNode("problem", "見通し仮説に相当する既存概念はあるか", 0, 0);
    const suggestions = [
      makeNode("suggestion", "working hypothesisかもしれない", 240, -120),
      makeNode("suggestion", "Deweyのideaかもしれない", 240, 0),
      makeNode("suggestion", "conjectureかもしれない", 240, 120),
    ];
    const idea = makeNode("idea", "Deweyのideaが見通し仮説に近いのではないか", 480, 0);
    const explanation = makeNode(
      "explanatory_hypothesis",
      "見通し仮説は独立した仮説種ではなく、ideaが探索を方向づける状態として説明できるのではないか",
      720,
      0
    );
    const operational = makeNode(
      "operational_hypothesis",
      "Deweyの文献を確認すれば、ideaをworking hypothesisとして探索に用いる記述が確認できるはず",
      960,
      0
    );
    const nodes = [problem, ...suggestions, idea, explanation, operational];
    const makeEdge = (source, target, edgeType, reasoningText = "", memo = "") => ({
      edgeId: crypto.randomUUID(),
      sourceNodeId: source.nodeId,
      targetNodeId: target.nodeId,
      edgeType,
      reasoningText,
      memo,
    });
    const edges = [
      ...suggestions.map((suggestion) => makeEdge(problem, suggestion, "suggestion_generation")),
      makeEdge(suggestions[1], idea, "selection_retention", "Deweyの探究論と比較する価値があるため"),
      makeEdge(idea, explanation, "explanation"),
      makeEdge(
        explanation,
        operational,
        "operationalization",
        "この説明が正しいなら、Deweyの文献中にideaが探索を方向づける記述が存在するはず",
        "reasoningはリンク属性として保存"
      ),
    ];

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
    assert.strictEqual(reloaded.nodes.length, 7);
    assert.strictEqual(reloaded.edges.length, 6);
    assert.strictEqual(reloaded.nodes.filter((node) => node.nodeType === "suggestion").length, 3);
    const reasoningEdge = reloaded.edges.find((edge) => edge.edgeType === "operationalization");
    assert.strictEqual(
      reasoningEdge.reasoningText,
      "この説明が正しいなら、Deweyの文献中にideaが探索を方向づける記述が存在するはず"
    );
    assert.strictEqual(reasoningEdge.memo, "reasoningはリンク属性として保存");

    const child = await request(`/process-maps/${root.map.mapId}/children`, {
      method: "POST",
      body: JSON.stringify({
        userId,
        parentNodeId: idea.nodeId,
        title: "ideaとworking hypothesisはどのような関係にあるのか",
        grainSize: "中間テーマ",
      }),
    });
    assert.strictEqual(child.breadcrumbs.length, 2);
    assert.strictEqual(child.breadcrumbs[0].mapId, root.map.mapId);
    assert.strictEqual(child.map.parentMapId, root.map.mapId);
    assert.strictEqual(child.map.parentNodeId, idea.nodeId);

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
          nodes: nodes.filter((node) => node.nodeId !== idea.nodeId),
          edges: edges.filter((edge) => edge.sourceNodeId !== idea.nodeId && edge.targetNodeId !== idea.nodeId),
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
