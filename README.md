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
ADMIN_PANEL_PASSWORD=change-this-password
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

## 7. 管理画面
ブラウザで以下を開く:
- `user-admin.html`

※ `index.html` / `main.html` から遷移する場合は、管理画面用パスワード入力が必要です（`ADMIN_PANEL_PASSWORD`）。

機能:
- ユーザ追加
- パスワード更新
- ユーザ削除
- ユーザ一覧取得

## 8. 仕様メモ
- ユーザID: 3〜32文字（英数字・`_`・`-`）
- パスワード: 1文字以上（長さ上限なし）
- `users.password_hash` はサーバー側で SHA-256 ハッシュ化して保存
- サーバー起動時に必要テーブルを自動作成/補完

## 9. トラブルシュート
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
