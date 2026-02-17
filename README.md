# MyProject セットアップ手順（Windows / MariaDB）

- API仕様の要点・API×テーブル対応表は [docs/api-v2-reference.md](docs/api-v2-reference.md) を参照

## 1. 前提
- Node.js がインストール済み
- MariaDB が Windows にインストール済み
- 作業ディレクトリ: `C:\Users\yuuse\MyProject`

## 2. 環境変数
1. `.env.example` を参考に `.env` を作成/更新
2. 例:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=app_pass
DB_NAME=myapp
PORT=3000
DB_CONN_LIMIT=10
SAVE_XML_PORT=3005
```

## 3. MariaDB 初期準備
MariaDB にログイン:

```powershell
& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u root -p
```

初回に実行:

```sql
CREATE DATABASE IF NOT EXISTS myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'appuser'@'%' IDENTIFIED BY 'app_pass';
GRANT ALL PRIVILEGES ON myapp.* TO 'appuser'@'%';
FLUSH PRIVILEGES;
```

## 4. サーバー起動/停止
### 一括起動（推奨）

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

起動対象:
- `python -m http.server 8008`
- `api.py`
- `JS/saveXML.js`（3005）
- `JS/server.js`（ユーザ管理API）

### 一括停止

```powershell
powershell -ExecutionPolicy Bypass -File .\stop.ps1
```

## 5. API 単体起動（必要時）

```powershell
npm start
```

`package.json` は `node JS/server.js` を起動します。

## 6. 動作確認
PowerShell の `curl` は警告が出るため、`Invoke-RestMethod` または `curl.exe` を推奨します。

### ヘルスチェック

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/health"
```

### ユーザ作成

```powershell
$body = @{ id = "user1"; passwordHash = "password123" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/users" -ContentType "application/json" -Body $body
```

### ユーザ一覧

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/users"
```

### パスワード更新

```powershell
$body = @{ passwordHash = "newPassword123" } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:3000/users/user1" -ContentType "application/json" -Body $body
```

### ログイン確認

```powershell
$body = @{ id = "user1"; passwordHash = "newPassword123" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/auth/login" -ContentType "application/json" -Body $body
```

## 7. DB管理画面
ブラウザで以下を開く:
- `http://localhost/phpmyadmin/`

`index.html` / `main.html` のボタンからも同URLを開けます。

## 8. 仕様メモ
- ユーザID: 3〜32文字（英数字・`_`・`-`）
- パスワード: 1文字以上（長さ上限なし）
- `users.password_hash` はサーバー側で SHA-256 ハッシュ化して保存
- サーバー起動時に必要テーブルを自動作成/補完
- テーマ履歴は `user_themes` テーブルに保存（`(user_id, theme_name)` の複合主キー）
- キーワードマップのノード/エッジは、テーマ単位で `user_themes.content_json` に保存
- 左下の仮説発散エリア（仮説本文HTML）は `user_themes.content_json.hypothesis.html` に保存され、`hypothesis_spread` テーブルにも同期保存
- キーワードノードは `user_themes.content_json.keywordNodes` に保存
- キーワードマップ構成エリアのノード/エッジは `keyword_nodes` / `keyword_edges`（DB V2）を正とします
- 仮説関係性マップ内の仮説ノードは `user_themes.content_json.hypothesis.nodes` に保存され、`node_hypothesis` テーブルにも同期保存
- `XML` のスナップショットXMLファイルは `短縮ユーザ__短縮テーマ.xml` 形式で保存
- `log` のログファイルは `短縮ユーザ__短縮テーマ_log` 形式で保存
- DBの `logs` テーブルは現在使用しません（起動時に削除されます）
- ファイル名パーツ（ユーザ/テーマ）は記号除去・空白を `_` へ正規化し、24文字超過時は `先頭15文字 + _ + 8桁ハッシュ` に短縮

### 既存XMLをDBへ一括移行

`XML` 配下のXMLを `user_themes.content_json` に移行できます。

```powershell
# 事前確認（DB更新しない）
node scripts/migrate-xml-to-db.js --dry-run

# 本実行
node scripts/migrate-xml-to-db.js
```

補足:
- ファイル名が `user__theme.xml` の場合は、その `user` / `theme` を使用
- それ以外は `user=ファイル名(拡張子除く)`、`theme=meta title(あれば)` を使用
- 対象ユーザーが未作成の場合、移行時に自動作成します
- `ConceptMap` 形式XMLはノード/エッジをそのまま移行します
- `tanaka.xml` / `user2.xml` のような `<root></root>` 形式XMLは、空マップ（`nodes=[]`, `edges=[]`）として移行します（fallback移行）
- 実行ログの `fallback=...` は、上記 fallback 移行された件数です

移行後の確認例:

```powershell
# tanaka の移行結果確認
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/users/tanaka/themes/tanaka" | ConvertTo-Json -Depth 8

# user2 の移行結果確認
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/users/user2/themes/user2" | ConvertTo-Json -Depth 8
```

```powershell
# curl.exe 版（tanaka）
curl.exe http://127.0.0.1:3000/users/tanaka/themes/tanaka

# curl.exe 版（user2）
curl.exe http://127.0.0.1:3000/users/user2/themes/user2
```

確認ポイント:
- `content.nodes` と `content.edges` が存在すること
- fallback対象では `content.migratedFromFallbackRoot = true` になること

### 既存 user_themes から DB V2 のキーワード表へ移行

`user_themes.content_json` を元に、`keyword_nodes` / `keyword_edges` を含むDB V2テーブルへ移行できます。

```powershell
# 事前確認（DB更新しない）
node scripts/backfill-legacy-to-v2.js --dry-run

# 本実行（全ユーザー・全テーマ）
node scripts/backfill-legacy-to-v2.js

# 特定ユーザーのみ
node scripts/backfill-legacy-to-v2.js --user user1

# 特定ユーザー + 特定テーマのみ
node scripts/backfill-legacy-to-v2.js --user user1 --theme 再生可能エネルギー
```

補足:
- 既存V2版があるテーマを再投入する場合は `--force-append` を利用
- `npm run migrate:v2` でも実行できます

### 既存 user_themes から hypothesis_spread を再生成

`user_themes.content_json.hypothesis.html` を元に、`hypothesis_spread` テーブルを再生成できます。

```powershell
# 事前確認（DB更新しない）
node scripts/backfill-user-themes-to-hypotheses.js --dry-run

# 本実行（全ユーザー・全テーマ）
node scripts/backfill-user-themes-to-hypotheses.js

# 特定ユーザーのみ
node scripts/backfill-user-themes-to-hypotheses.js --user user1

# 特定ユーザー + 特定テーマのみ
node scripts/backfill-user-themes-to-hypotheses.js --user user1 --theme 再生可能エネルギー
```

補足:
- `hypothesis.html` が空のテーマはスキップされます
- `npm run backfill:hypothesis` でも実行できます

### DB V2 スキーマ適用（再構成用）

`scripts/sql/20260217_db_v2_up.sql` を適用すると、
`themes` / `theme_versions` 系の新スキーマを追加できます（既存テーブルは維持）。

```powershell
# 適用
Get-Content -Raw .\scripts\sql\20260217_db_v2_up.sql |
	& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u appuser -p -D myapp

# ロールバック（新規テーブルのみ削除）
Get-Content -Raw .\scripts\sql\20260217_db_v2_down.sql |
	& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u appuser -p -D myapp
```

注意:
- `DOWN` は V2 新規テーブルのみ対象で、既存の `users` / `user_themes` などは削除しません
- 本番では実行前に必ずバックアップを取得してください
- V2テーブル未作成時は、テーマ系APIが利用できません（起動時に警告を表示）
- 読み取りをV2優先に切り替える場合は `.env` に `ENABLE_V2_READ=true` を設定（既定値は `false`）
- `ENABLE_V2_READ=true` のとき、`/users/:id/themes*`、`/hypotheses`、`/hypothesis-nodes` は V2 のみを参照します
- 現在の実装では、テーマ保存/削除およびテーマ系読み取りは V2 を正として動作します
- `ENABLE_V2_READ=false` の場合、テーマ系の読み取りAPIは `503` を返します（V2有効化が前提）

### 既存DBの仮説スキーマを正規化（HTML直保存廃止）

既に稼働中のDBで `hypothesis_spreads.hypothesis_html` や
`hypothesis_nodes.theme_version_id` が残っている場合は、下記を実行します。

```powershell
node scripts/migrate-hypothesis-schema-to-normalized.js

# npm script でも実行可
npm run migrate:v2:hypothesis-normalize
```

この処理で以下へ変換します。
- `hypothesis_spreads`: `hypothesis_html` 列を削除
- `hypothesis_nodes`: `theme_version_id` を廃止し `hypothesis_spread_id` 外部キーへ移行

### 仮説正規化の整合チェック

正規化後に、列構成・外部キー・件数整合を一括確認できます。

```powershell
node scripts/check-hypothesis-normalization-integrity.js

# npm script でも実行可
npm run check:v2:hypothesis-integrity
```

### 既存 user_themes から DB V2 へバックフィル

`user_themes.content_json` から、`themes` / `theme_versions` / `keyword_*` / `hypothesis_*` へ移行します。

```powershell
# 事前確認（DB更新しない）
node scripts/backfill-legacy-to-v2.js --dry-run

# 本実行（初回）
node scripts/backfill-legacy-to-v2.js

# 特定ユーザーのみ
node scripts/backfill-legacy-to-v2.js --user user1

# 特定ユーザー + 特定テーマのみ
node scripts/backfill-legacy-to-v2.js --user user1 --theme 再生可能エネルギー

# 既存テーマに追加バージョンとして再投入したい場合
node scripts/backfill-legacy-to-v2.js --force-append
```

補足:
- 既定では、すでに V2 側にバージョンがあるテーマはスキップします（重複投入防止）
- `npm run migrate:v2 -- --dry-run` でも実行できます

### 旧テーマ系テーブルの廃止（V2完全移行後）

以下は **3段階** で実施してください。

```powershell
# 1) 事前確認（件数/サンプル比較）
Get-Content -Raw .\scripts\sql\20260217_legacy_theme_tables_precheck.sql |
	& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u appuser -p -D myapp

# 2) まずはアーカイブ（rename）
Get-Content -Raw .\scripts\sql\20260217_legacy_theme_tables_archive.sql |
	& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u appuser -p -D myapp

# 3) 安定運用確認後に最終削除
Get-Content -Raw .\scripts\sql\20260217_legacy_theme_tables_drop.sql |
	& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u appuser -p -D myapp
```

対象テーブル:
- `user_themes`
- `hypothesis_spread`
- `node_hypothesis`

### テーマAPI

テーマはユーザ単位で保存されます。

```powershell
# テーマ一覧
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/users/user1/themes"

# テーマ保存（新規/更新）
$body = @{ themeName = "再生可能エネルギー"; content = @{ themeName = "再生可能エネルギー" } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:3000/users/user1/themes" -ContentType "application/json" -Body $body

# テーマ1件削除
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:3000/users/user1/themes/%E5%86%8D%E7%94%9F%E5%8F%AF%E8%83%BD%E3%82%A8%E3%83%8D%E3%83%AB%E3%82%AE%E3%83%BC"

# テーマ全削除
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:3000/users/user1/themes"

# 仮説本文（1テーマ）
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/users/user1/themes/%E5%86%8D%E7%94%9F%E5%8F%AF%E8%83%BD%E3%82%A8%E3%83%8D%E3%83%AB%E3%82%AE%E3%83%BC/hypothesis"

# 仮説ノード一覧（1テーマ）
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/users/user1/themes/%E5%86%8D%E7%94%9F%E5%8F%AF%E8%83%BD%E3%82%A8%E3%83%8D%E3%83%AB%E3%82%AE%E3%83%BC/hypothesis-nodes"
```

### グラフAPI（V2）

`/graph/*` は V2 テーブル（`keyword_nodes` / `keyword_edges`）を参照します。

```powershell
# 利用する themeVersionId の取得例
& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u appuser -p -D myapp -e "SELECT tv.id AS theme_version_id FROM themes t JOIN theme_versions tv ON tv.theme_id=t.id AND tv.version_no=t.latest_version_no WHERE t.user_id='user1' AND t.theme_name='再生可能エネルギー' LIMIT 1;"

# ノード作成（themeVersionId 必須）
$body = @{
	themeVersionId = 1
	label = "キーワードA"
	clientNodeId = "node_a"
	nodeType = "keyword"
	x = 100
	y = 120
	props = @{ source = "manual" }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/graph/nodes" -ContentType "application/json" -Body $body

# エッジ作成（themeVersionId + src/dst client node id 必須）
$body = @{
	themeVersionId = 1
	srcClientNodeId = "node_a"
	dstClientNodeId = "node_a"
	relation = "self"
	props = @{ source = "manual" }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/graph/edges" -ContentType "application/json" -Body $body

# ノード取得（themeVersionId / userId / themeName で絞り込み可能）
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/graph/nodes?themeVersionId=1&limit=20"

# エッジ取得（themeVersionId / userId / themeName で絞り込み可能）
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/graph/edges?themeVersionId=1&limit=20"
```

## 9. トラブルシュート
### Windows起動時の自動起動を止めたい
以下を実行すると、`Startup` フォルダ / `Run` レジストリ / タスクスケジューラの
`MyProject` 関連自動起動エントリを削除します。

```powershell
powershell -ExecutionPolicy Bypass -File .\disable-autostart.ps1
```

### `EADDRINUSE: address already in use :::3000`
3000番ポートが既に使用中です。

```powershell
powershell -ExecutionPolicy Bypass -File .\stop.ps1
```

それでも解消しない場合は、`.env` の `PORT` を `3001` などに変更して再起動してください。

### PowerShell の `curl` で警告が出る
PowerShell では `curl` が `Invoke-WebRequest` の別名です。次を使ってください。

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/users"
```

または:

```powershell
curl.exe http://127.0.0.1:3000/users
```

### `mysql` コマンドが見つからない
MariaDB クライアントをフルパスで実行します。

```powershell
& "C:\Program Files\MariaDB 12.1\bin\mysql.exe" -u root -p
```

### `No database selected` エラー
SQL 実行前にDBを選択してください。

```sql
USE myapp;
```

## 10. セキュリティ注意
- `.env` は Git 管理対象外です（`.gitignore` 設定済み）。
- APIキーやDBパスワードを `README` やソースに直接書かないでください。
- もしキーを誤って保存・共有した場合は、必ず失効（ローテーション）してください。
