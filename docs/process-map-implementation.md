# 仮説形成ビュー 実装報告

## 概要

既存システムを既定表示のまま維持し、別タブの旧「探究プロセスマップ」を、仮説を立てるファーストフェーズに限定した「仮説形成」ビューへ改修した。

このビューは、問題・疑問、suggestion、idea、説明仮説、作業仮説の分岐と精緻化を記録する。決められた順序を強制するWizardではなく、不足段階があっても保存できる。reasoningはノードではなく、説明仮説と作業仮説を結ぶリンクの記述として保持する。

## 仮説形成と仮説構造の分離

- 仮説形成ビュー（vis-network）: 1つの仮説がどのような問題、可能性、選択、説明、推論から形成されたかを扱う。
- 既存の仮説構造化マップ（GoJS）: 形成された複数の仮説同士の構造を扱う。
- 説明仮説／作業仮説は、利用者がボタンを押した場合だけ仮説構造化マップのルート直下へ「候補」として追加する。親子関係や説明関係は自動確定しない。
- suggestion、idea、reasoningは仮説構造化マップへ自動追加しない。

## 新規作成ファイル

- `scripts/sql/20261006_hypothesis_formation_up.sql`: 既存の `process_edges` にreasoning用列を追加する差分SQL
- `scripts/sql/20261006_hypothesis_formation_down.sql`: 上記差分のロールバックSQL（reasoningデータを削除するため注意）

前回実装で追加済みの専用ファイルは次のとおり。

- `process-map.css`
- `JS/process-map.js`
- `JS/process-map-support.js`
- `scripts/sql/20261006_process_maps_up.sql`
- `scripts/sql/20261006_process_maps_down.sql`
- `scripts/verify-process-map-support.js`
- `scripts/verify-process-map-api.js`
- `docs/process-map-implementation.md`

## 修正ファイル

- `main.html`: タブ名、5段階ガイド、reasoning編集、任意の次段階追加、形成済み仮説一覧、構造候補追加UI
- `process-map.css`: 上記UI専用スタイル
- `JS/process-map.js`: 5種node、分岐、段階別リンク、reasoning編集、形成済み仮説一覧、階層、候補連携、ログ
- `JS/process-map-support.js`: ファーストフェーズ用の固定問いかけを生成する独立モジュール
- `JS/server.js`: 旧type互換、reasoning保存・読込、mapの親情報返却
- `JS/mindmap.js`: 仮説形成ノードを構造候補として追加・同期する限定的な公開関数
- `scripts/sql/20261006_process_maps_up.sql`: 新規環境向けedge定義にreasoning列を反映
- `scripts/verify-process-map-support.js`: 新しい支援ルールの単体確認
- `scripts/verify-process-map-api.js`: 指定された具体例による保存・再読込・階層確認
- `start.ps1`: macOS/Linuxでプロジェクトの `.venv` があれば優先し、Flask依存を確実に読み込む
- `README.md`: 機能説明と確認手順を更新

`JS/network.js`、`JS/hypothesis.js`、既存SCAMPER処理、既存保存・読込処理は変更していない。

## DB変更

前回追加済みの4テーブルを維持する。

- `process_maps`: 各グレインのマップ。親対応は `process_hierarchy` からAPIで `parentMapId` / `parentNodeId` として返す。
- `process_nodes`: 形成段階、内容、メモ、参照、座標
- `process_edges`: 有向リンク、関係種別、`reasoning_text`、リンクメモ、作成・更新日時
- `process_hierarchy`: 親マップ、下位マップ、起点ノード

既存DBへ追加した列：

```text
process_edges.reasoning_text TEXT NULL
process_edges.memo           TEXT NULL
process_edges.updated_at     TIMESTAMP
```

サーバー起動時に不足列だけを追加する。新規環境では更新済みの `20261006_process_maps_up.sql` を使う。旧版の4テーブルを既に作成済みの環境だけ、差分SQL `20261006_hypothesis_formation_up.sql` を使える。

旧type名はデータを失わないためAPIで次のように読み替える。

| 旧type | 現在のtype |
| --- | --- |
| `problem_question` | `problem` |
| `idea_working_hypothesis` | `idea` |
| `working_hypothesis` | `operational_hypothesis` |

旧版のreasoning、情報収集・作業、結果、修正・更新ノードと検証・支持・棄却・修正リンクは新規作成UIから非表示にした。保存済みデータを消さないため、API互換は残している。

## reasoningの表現

説明仮説から作業仮説へのリンクを選択すると、右パネルで次を編集できる。

- 関係種別（通常は `operationalization`）
- reasoning本文
- リンクの補足メモ

reasoning本文は `process_edges.reasoning_text` に保存され、リンク上にも要約表示される。suggestionからideaへのリンクでも、検討価値を判断した理由として同じ欄を利用できる。

## グレインサイズ

どのnode typeからでも「詳しく検討する」で下位マップを作成できる。対応関係は `process_hierarchy(parent_map_id, child_map_id, parent_node_id)` で保持し、下位マップではパンくずと上位へ戻る操作を表示する。下位マップを持つ起点ノードは、対応を壊さないよう削除を拒否する。

## 実装機能

- 「既存システム」「仮説形成」のタブ切替
- 問題・疑問、suggestion、idea、説明仮説、作業仮説の追加・編集・削除・移動
- suggestionの自由な複数分岐
- 任意リンク作成と、段階の組合せに応じた関係種別の補完
- 説明仮説→作業仮説リンクのreasoning編集
- 途中段階がなくても保存できる非Wizard型UI
- 任意ノードからの下位マップ作成、上下移動、パンくず
- 形成された説明仮説／作業仮説の一覧
- 利用者操作による仮説構造化マップへの候補追加
- 構造に応じた4系統の固定問いかけ
- 自動保存、手動保存、再読込
- node、link、階層、構造候補追加の操作ログ

## 非表示／MVP対象外

- reasoning独立ノード
- 情報収集・作業、結果、修正・更新ノード
- 検証、支持、棄却、修正リンクと判定
- 実験結果入力、分析支援、結果からの仮説更新
- LLM支援、自動分類、自動現在地推定、MT資料生成

## 動作確認

```powershell
# 起動（3サービス）
pwsh ./start.ps1

# 支援ルール
node scripts/verify-process-map-support.js

# Express API起動中にDB統合確認
node scripts/verify-process-map-api.js
```

画面では次を確認する。

1. `http://127.0.0.1:8008/main.html` を開き、既存システムが従来どおり操作できる。
2. 「仮説形成」へ切り替え、問題から3つのsuggestionを並列作成する。
3. idea、説明仮説、作業仮説へリンクし、最後のリンクにreasoningを記述する。
4. 保存後に再読み込みし、node、位置、link、reasoningが復元される。
5. ideaから「詳しく検討する」で下位問題を作成し、パンくずで往復する。
6. 説明仮説または作業仮説を「仮説構造ビューの候補に追加」し、既存システム側の仮説構造化マップでルート直下の候補として確認する。

統合テストは依頼で提示された「見通し仮説」「Deweyのidea」の具体例をそのまま保存し、3分岐、reasoning再読込、idea起点の下位グレイン、起点ノード削除防止まで検証する。

## 現時点の制約

- 仮説構造候補はルート直下へ追加するだけで、構造の自動推定はしない。
- 下位マップ自体を削除する管理UIはない。
- 旧版の非表示node／edgeが保存済みの場合は互換表示されるが、新規作成はできない。
- SCAMPERとの直接遷移UIは未実装。既存SCAMPER機能と参照フィールドは維持している。
