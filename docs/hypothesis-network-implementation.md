# 仮説形成支援・意味付きネットワーク

## 既存コードの調査と変更方針

- `main.html` / `JS/main.js`: Golden Layout の仮説洗練・構造化エリアを維持する。
- `JS/hypothesis.js`: 仮説本文、SCAMPERの思考メモ・問い、HTMLの復元、400ms後の保存を利用する。候補表示は入力欄直下の元文章プレビューに追加する。textareaそのものは編集可能なまま。
- `JS/mindmap.js`: GoJS `TreeModel` の既存マップは引き続き使用可能とする。新しい意味付きグラフをTreeModelのparentへ保存しない。
- `JS/server.js`: 既存のテーマ部分更新・V2バージョン保存を使用する。ネットワークを `content.hypothesis.network` へ追加する。既存の本文・mapNodes・キーワードマップ・探究プロセスマップを置き換えない。
- `api.py`: 既存の `POST /api`（prompt → result）をそのまま使う。APIキーをクライアントへ追加しない。新しいSDK/API仕様への変更は行わない。
- `JS/network.js` / `JS/prompt-context.js` / `JS/process-map*.js`: キーワードマップ、既存プロンプト構築、探究プロセスマップは既存実装を維持する。

## 実装したPhase

1. **モデル**: ブラウザとNode.jsで共有する `JS/hypothesis-network-model.js` を追加。ノードのタイプとエッジの意味を分離する。
2. **候補・ハイライト**: 原文のsnapshot、sourceId、start/end、採用状態を保持。元文章プレビューで候補範囲を色分けする。重なる範囲も表示可能。元文章が変わった候補は警告し、採用前に範囲を確認する。
3. **ノード確定**: 学習者が採用した時点で初めてネットワークへ登録。本文、タイプ、SRO、条件、限定、出典、日時を保持する。
4. **リンク操作**: 手動追加・編集・削除、方向・端点・タイプ変更、AI候補の採用・拒否を実装。
5. **ネットワーク表示**: 既存のvis-networkライブラリを再利用。有向矢印と意味のラベルを表示。多対多、同タイプ間、検証可能な仮説から説明仮説への接続も許可。詳細はクリックまたは一覧ボタンで表示。
6. **AI候補**: 元の仮説・SCAMPERメモ・記録済みの対話から引用範囲とSROを抽出。新規ノードから既存ノードとの方向・意味・理由・確信度を推定。結果の形式、引用一致、端点、重複、循環を確認する。AIを待つ間にノードが変更された場合はリンク候補を破棄し再取得を案内する。
7. **分析・問い**: ノードタイプ、リンクタイプ、入出次数、分岐、統合、未接続を解析。存在しない思考操作に応じて定型の問いを提示。タイプの順番や思考不足を断定しない。適応的な問いのAI生成は今後の拡張とする。

## 保存形式

```js
content.hypothesis.network = {
  schemaVersion: 1,
  updatedAt,
  nodes: [{
    id, text, hypothesisType, subject, relationship, object,
    context, qualifier, sourceText, sourceConversationId, createdAt, updatedAt
  }],
  edges: [{
    id, sourceNodeId, targetNodeId, relationType, label,
    aiGenerated, confidence, explanation, createdAt
  }],
  candidates: [{
    // ノード属性に加え、採用前の状態・原文位置を保持
    id, text, hypothesisType, sourceId, sourceConversationId,
    sourceSnapshot, sourceText, start, end,
    status, aiGenerated, nodeId
  }],
  linkCandidates: [{ /* エッジ属性 + status */ }],
  conversations: [{ id, text, role, createdAt }]
};
```

- `status`: 仮説候補は `pending / accepted / excluded`、リンク候補は `pending / accepted / rejected`。
- `start/end`: JavaScriptのUTF-16位置、0基準、endは含まない。引用が一致しないAI抽出範囲は原文の完全一致引用から補正。一致しない記述は採用しない。
- 仮説本文の編集と原文の引用は独立。分割された複数候補は同じ原文範囲を参照できる。
- `hypothesis.nodes`（洗練エリアの従来レコード）と `hypothesis.mapNodes`（旧マップ）は維持。新しい確定ノードの正は `hypothesis.network.nodes`。
- MariaDB V2の `theme_version_payloads.content_json` に既存保存経路で永続化する。新しいテーブル・SQLマイグレーションは不要。従来の `hypothesis_nodes` 集計には新ネットワークのノードを混在させない。
- PUTはこのエディタのフィールドだけを送信。サーバーで既存データとマージし、別マップの古いGET結果を再送しない。
- 保存中のsnapshotを固定し、保存失敗を成功扱いにしない。未保存ネットワークはユーザー・テーマ・言語別のlocalStorageへ下書き保存。再読込時は更新日時で新しい下書きを復元し、再保存する。
- DBの初期読込に失敗した場合、未読込のネットワークを上書きしない。再読込を案内する。言語・テーマが変わった場合も対象データの再読込が必要。
- 元の入力文のDB保存・復元は従来のHTML保存を利用。ネットワーク下書きには候補の元文章snapshotを含むが、未保存のtextarea内容全体を復旧する仕組みではない。

## 操作

1. 仮説洗練エリアに文章やSCAMPERメモを入力する。
2. 「AIで仮説候補を抽出」で候補を生成。AIを呼ばずに入力欄や元文章プレビューの範囲選択→「選択した文章を候補に追加」も利用可能。
3. 黄色のハイライトまたは「修正・範囲変更・分割」で本文・タイプ・SRO・抽出範囲を変更。元文章を選択すると位置が入力される。仮説本文を複数行に分けて分割も可能。
4. 「ノードとして確定」で登録。緑のハイライトは確定済みの出典を示す。
5. 構造化エリアで「仮説ネットワーク」を選択する。初期表示は従来マップを維持している。
6. AIリンク候補の理由・方向・タイプを確認して採用する。手動リンク追加も可能。
7. ノード・リンクのクリック、または「仮説・リンク一覧」から詳細・編集・削除を行う。
8. 必要なら「既存マップから取り込む」。旧マップの親子関係は意味が未確定なので、リンク候補として確認・修正する。旧マップ自体は変更されない。

SCAMPERで生成したAIの問いを対話記録に保持し、追加の対話・思考メモは「対話内容・追加の思考メモ」から記録可能。疑問だけの記述は勝手に仮説へ変換しないようAIへ指示している。

## 拡張

- 新しいrelationTypeは共有モデルの `relations` へ追加し、AIプロンプトへ定義を追加する。保存・分析は未知の文字列も保持する。
- 新規リンクは既定でDAGにする。モデルの `validateEdge(graph, edge, true)` は循環を許容する拡張点。保存済みグラフをタイプ別階層へ変換しない。
- `window.HypothesisNetwork.analyze()` または共有モデルの `analyze(graph)` で構造分析を取得できる。
- AIは既存API経由のJSON出力を解析しており、専用の構造化出力APIではない。不正JSON、引用不一致、削除済み端点等は候補として登録しない。AI障害時は手動操作を利用できる。

## 検証

```bash
npm run test:hypothesis-network
npm run test:prompt-context
node scripts/verify-process-map-support.js
node --check JS/hypothesis-network.js
node --check JS/hypothesis.js
node --check JS/server.js
```

`./scripts/hypothesis-network-ui-check.html` はモックAIと保存フックを使った自己検証ページ。テスト専用のlocalhostポートから開くこと（既存利用画面と同じoriginでは開かない）。モデル、実際のサーバーマージ関数、DAG・多対多・全タイプの組合せ、引用位置、重複、旧保存形式との互換性を検証する。

画面のDOMテストは候補抽出・手動候補・本文編集・採用・除外・分割、ノード追加・編集・削除、リンク提案・採用・編集・削除、旧マップ取り込み、分析、保存フックを確認した。jsdomで行った確認ではvis描画とResizeObserverをスタブに置き換えており、ブラウザ上の描画・レイアウトの実測ではない。

実際のMariaDB/APIサーバーとAI APIを使った保存・再読込、ブラウザの視覚確認は未実施。既存の起動手順で稼働させ、テーマ別の保存と復元、および実際のAI抽出結果を確認する必要がある。
