# 探究プロセスマップ 実装報告

## 概要

既存システムを既定表示のまま維持し、画面上部の別タブとして「探究プロセスマップ」を追加した。既存のキーワード候補提示、キーワードマップ、仮説立案、SCAMPER助言、仮説関係性マップ、保存・読込の主要JSは変更していない。

## 新規作成したファイル

- `process-map.css`: 探究プロセスマップ専用UI
- `JS/process-map.js`: vis-networkによるノード／リンク編集、保存、再読込、階層移動、操作ログ
- `JS/process-map-support.js`: 独立したルールベース支援生成関数
- `scripts/sql/20261006_process_maps_up.sql`: 新規4テーブルの作成
- `scripts/sql/20261006_process_maps_down.sql`: 新規4テーブルの削除（ロールバック用）
- `scripts/verify-process-map-support.js`: 支援ルールの単体確認
- `scripts/verify-process-map-api.js`: 一時ユーザを用いたDB保存・再読込・階層APIの統合確認（終了時に削除）
- `docs/process-map-implementation.md`: 本報告

## 修正したファイル

- `main.html`: 2タブ、新画面のマークアップ、新規CSS/JS読込を追加。既存Golden Layoutの内部構成は維持
- `style.css`: タブパネル表示に必要な最小限の共通レイアウトを追加
- `JS/server.js`: 新規テーブルの起動時作成と探究プロセスマップAPIを追加
- `JS/runtime-config.js`: 残存していたマージ競合記号を除去（設定値は `host=auto`, `apiPort=3000` を維持）
- `start.ps1`: 残存していたマージ競合記号を除去し、既存のHTTP／Flask／Express起動構成を維持
- `README.md`: セットアップと動作確認への導線を追加

## DB変更

既存テーブルは変更せず、次を追加した。

- `process_maps`: テーマに属する各グレインのマップ
- `process_nodes`: 9種類のノード、本文、メモ、既存データ参照、座標
- `process_edges`: 有向リンクと関係種別
- `process_hierarchy`: 親マップ、下位マップ、対応する親ノード

サーバー起動時にも `CREATE TABLE IF NOT EXISTS` を実行する。手動適用する場合は以下を使う。

```powershell
Get-Content -Raw .\scripts\sql\20261006_process_maps_up.sql |
  & "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u appuser -p -D myapp
```

## 実装した機能

- 「既存システム」「探究プロセスマップ」のタブ切替
- 9種類の色分けされたノードの追加、編集、削除、移動
- 有向リンクの作成、関係種別の編集、削除
- 手動保存、変更時の自動保存、DBからの再読込
- 任意ノードから下位グレインを作成／開く操作
- 上位階層へ戻る操作と、任意の上位へ移動できるパンくず
- 選択ノードの詳細、関連ノード、下位グレイン有無の表示
- `existing_reference_type` / `existing_reference_id` による既存データ参照用フィールド
- 4種類の固定文による不足リンク・構造支援
- ノード、リンク、階層操作の `user_action_logs` 記録
- 下位グレインを持つ親ノードの削除防止

## 未実装／将来拡張

- LLMによる支援文生成
- 仮説の自動分類、現在地推定、MT資料の自動生成
- 既存の仮説・キーワードを検索して選択するUI（参照フィールドとDB構造のみ用意）
- 下位マップそのものを削除する管理UI

## 動作確認方法

1. V2 DBスキーマを適用済みのMariaDBを起動する。
2. `npm start` でExpress APIを起動する。ログに `Process maps: enabled` が出ることを確認する。
3. 既存の起動手順で `main.html` を開き、「既存システム」で従来機能を確認する。
4. 「探究プロセスマップ」へ切り替え、9種のノードを各1件追加する。
5. 「リンク作成」を押し、リンク元・リンク先を順に選ぶ。右パネルで関係種別を変更する。
6. ノードをドラッグし「保存」を押してからページを再読込し、位置・内容・リンクが復元されることを確認する。
7. ノードを選択し「下位グレインを作成」、パンくずと「上位階層へ戻る」で往復する。
8. `user_action_logs` に `process_node_add` 等が記録されることを確認する。
9. 支援ルールの確認は `node scripts/verify-process-map-support.js` を実行する。
10. API起動中に `node scripts/verify-process-map-api.js` を実行すると、一時ユーザを作成して9種ノードの保存・再読込・下位グレイン・削除保護を確認し、最後に一時ユーザを削除する。

## 既存機能への影響

既存画面が初期選択で、既存の描画・保存モジュールには手を加えていない。タブ復帰時に既存グラフへリサイズ通知を送るため、非表示中のサイズ変更後も再描画される。DBも新規テーブルのみで、既存データは参照・更新しない。

## 実施済み検証

- JavaScript構文検証（サーバー、新画面、支援モジュール、設定）: 成功
- 支援ルール単体確認: 成功
- MariaDB統合確認（9種ノード、リンク、再読込、下位グレイン、削除保護）: 成功
- ExpressからのHTML/CSS/JS配信: HTTP 200を確認
- HTMLの必須IDとJSのDOM参照36件の対応、HTML構造検査: 成功
- `start.ps1` PowerShell構文検証: 成功

ブラウザ制御機能は実行環境側のモジュール初期化エラーで利用できなかったため、実ブラウザでの最終目視と既存各ボタンの操作回帰は上記「動作確認方法」に沿って手動確認が必要。
