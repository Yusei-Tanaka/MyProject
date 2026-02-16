# MyProject セットアップ手順（Windows / MariaDB）

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
- `JS/XML` のスナップショットXMLファイルは `短縮ユーザ__短縮テーマ.xml` 形式で保存
- `log` のログファイルは `短縮ユーザ__短縮テーマ_log` 形式で保存
- ファイル名パーツ（ユーザ/テーマ）は記号除去・空白を `_` へ正規化し、24文字超過時は `先頭15文字 + _ + 8桁ハッシュ` に短縮

### 既存XMLをDBへ一括移行

`JS/XML` 配下のXMLを `user_themes.content_json` に移行できます。

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
