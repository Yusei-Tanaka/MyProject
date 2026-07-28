(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.APP_PROMPT_CONTEXT = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const toObject = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  function resolvePromptTheme({ inputTitle, storedTitle, windowTheme, fallback }) {
    return String(inputTitle || storedTitle || windowTheme || fallback || "").trim();
  }

  function buildConceptMapPromptSnapshot({ content, themeName, liveNodes, liveEdges }) {
    const storedContent = toObject(content);
    const storedNodes = Array.isArray(storedContent.keywordNodes)
      ? storedContent.keywordNodes
      : Array.isArray(storedContent.nodes)
        ? storedContent.nodes
        : [];
    const storedEdges = Array.isArray(storedContent.edges) ? storedContent.edges : [];
    const rawNodes = Array.isArray(liveNodes) ? liveNodes : storedNodes;
    const rawEdges = Array.isArray(liveEdges) ? liveEdges : storedEdges;

    return JSON.stringify({
      schemaVersion: 1,
      format: "concept-map-json",
      title: String(themeName || storedContent.title || "").trim(),
      nodes: rawNodes.map((node) => ({
        id: node && node.id !== undefined ? node.id : "",
        label: String(node?.label || node?.text || "").trim(),
        nodeType: String(node?.nodeType || "keyword"),
      })),
      edges: rawEdges.map((edge) => ({
        from: edge && edge.from !== undefined ? edge.from : "",
        to: edge && edge.to !== undefined ? edge.to : "",
        label: String(edge?.label || edge?.relation || "").trim(),
      })),
    });
  }

  function buildScamperPrompt({
    theme,
    hypothesisText,
    keywords,
    scamperLabel,
    screenStateSnapshot,
    useEnglishPrompt,
  }) {
    if (useEnglishPrompt) {
      return `
        ## Task
        You are an assistant that supports learner activities in integrated inquiry learning.

        ## Context
        - The learner is exploring: [${theme}]
        - The learner proposed this hypothesis: [${hypothesisText}]
        - The hypothesis is based on these keywords: [${keywords}]
        - The learner's concept-map state is shown in this JSON snapshot: [${screenStateSnapshot}]

        ## Input
        - Expand the hypothesis from a SCAMPER perspective.
        - Generate questions based on SCAMPER [${scamperLabel}] to encourage idea expansion.

        ## Constraints
        - Questions should help produce hypotheses that can solve [${theme}].
        - If useful, implicitly suggest using other existing map keywords or adding new concepts.
        - Do not explicitly instruct what to add; guide only through questions.

        ## Language requirement
        - Output must be in English.
        - Avoid Japanese unless an untranslated proper noun is required.

        ## Output format
        - Provide about three questions.
        - Wrap each question with <li></li> tags.
        - Output only the list. No extra explanation.
      `;
    }

    return `
        ##タスク
        ・総合的な探究の時間における，学習者の活動を支援するシステム
        ##背景・文脈
        ・学習者は[${theme}]を目標に探究活動を行っている
        ・今，学習者は[${hypothesisText}]という仮説を[${keywords}]のキーワードを基に立案した
        ・学習者が作成した概念マップから読み取れる理解状態は，次のJSONスナップショットの通りである [${screenStateSnapshot}]
        ##入力
        ・この仮説に対して，SCAMPER法に基づく観点から仮説を発散させる
        ・あなたはSCAMPER法の[${scamperLabel}]に基づき，仮説を発散させることを促す質問を与えよ．
        ##条件
        ・[${theme}]という課題を解決しうるような仮説を生成することを目的とする
        ・必要に応じて，概念マップ内の他のキーワードや新しい概念を暗に示唆する質問を生成する
        ・追加内容を明示的に指示せず，質問を通して思考を促す
        ##言語要件
        ・出力は日本語とする
        ##出力形式
        ・条件に合う質問を3つ程度提示する
        ・各質問は<li></li>タグで囲み，リストのみを出力する
      `;
  }

  return {
    buildConceptMapPromptSnapshot,
    buildScamperPrompt,
    resolvePromptTheme,
  };
});
