# Cloudflareデプロイガイド

## 1. 事前準備

### Cloudflareアカウント設定
```bash
# Cloudflare CLIにログイン
npx wrangler login

# アカウント情報確認
npx wrangler whoami
```

### Google Cloud Console設定
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成またはに既存プロジェクトを選択
3. APIとサービス > OAuth同意画面でアプリケーションを設定
4. APIとサービス > 認証情報でOAuthクライアントIDを作成
   - アプリケーションタイプ: ウェブアプリケーション
   - 承認済みのJavaScript生成元: `https://your-frontend-domain.pages.dev`
   - 承認済みリダイレクトURI: `https://your-worker-domain.workers.dev/auth/callback`
5. Google Apps Script API を有効化

## 2. データベースセットアップ

```bash
# D1データベースを作成
npx wrangler d1 create gas-metrics-db

# 出力されたdatabase_idをwrangler.tomlに設定
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# マイグレーション実行
npm run db:migrate
# ローカルで確認したい場合
# npm run db:local-migrate
```

## 3. 環境変数設定

```bash
# Google OAuth認証情報
npx wrangler secret put GOOGLE_CLIENT_ID
# → Google Cloud Consoleで取得したクライアントIDを入力

npx wrangler secret put GOOGLE_CLIENT_SECRET
# → Google Cloud Consoleで取得したクライアントシークレットを入力

# Auth.js用秘密鍵（ランダムな文字列）
npx wrangler secret put AUTH_SECRET
# → openssl rand -base64 32 で生成した文字列を入力
```

## 4. Workerデプロイ

```bash
# Workerをデプロイ
npm run deploy

# デプロイ成功後、Worker URLが表示されます
# 例: https://gas-metrics.your-account.workers.dev
```

表示されたURLを`/src/frontend/public-config.json`の`worker`に設定してください。

## 5. フロントエンドデプロイ

```bash
# フロントエンドのAPI_BASE_URLを更新
# src/frontend/app.js の API_BASE_URL を実際のWorker URLに変更

# Cloudflare Pagesにデプロイ
npx wrangler pages deploy src/frontend --project-name gas-metrics-frontend

# カスタムドメインの設定（オプション）
npx wrangler pages custom-domain gas-metrics-frontend your-domain.com
```

表示されたURLを`/src/frontend/public-config.json`の`site`に設定してください。

## 6. OAuth リダイレクトURI更新

1. Google Cloud Console > APIとサービス > 認証情報
2. OAuthクライアントIDを編集
3. 承認済みリダイレクトURIに以下を追加：
   - `https://your-worker-domain.workers.dev/auth/callback`
   - `https://your-frontend-domain.pages.dev/auth/callback`

## 7. 動作確認

1. フロントエンドURLにアクセス
2. "Googleでログイン"をクリック
3. Google認証を完了
4. 監視設定を追加
5. Cron Triggerの動作確認
  - 一次的に実行頻度を変更して確認する
  - `wrangler.toml`を編集してデプロイする

## 8. Additional Settings (Optional)

- CloudflareのGitHubアプリを利用し自動的にデプロイされるようにする
- 監視設定の更新・削除機能の追加

など。

## デバック方法

次のコマンドを実行した状態で、操作することでログを確認できます。

```bash
npx wrangler tail --format=pretty
```

## 定期実行頻度の変更

wrangler.tomlのtriggersで変更出来ます。

```toml
# Cron Triggers - 監視タスクを10分毎に実行
[triggers]
crons = ["*/10 * * * *"]
```

頻度を高くしすぎると課金が発生する可能性があるため注意してください。

## トラブルシューティング

### よくある問題と解決方法

**問題**: OAuth認証エラー

解決策:
- リダイレクトURIが正確に設定されているか確認
- クライアントIDとシークレットが正しく設定されているか確認

 
**問題**: デプロイプレビューで認証エラー

解決策:
- Google Cloud Console > APIとサービス > 認証情報で承認済みのJavaScript生成元と承認済みリダイレクトURIを都度追加する必要がある（非推奨）
- 正規表現が利用できないので、デプロイプレビューのURLを数パターンに制御するような運用が考えられる。


**問題**: D1データベースエラー

解決策:
- `pnpm run db:list-table`を実行し、テーブルが作成されているか確認
- wrangler.tomlのdatabase_idが正しく設定されているか確認
- マイグレーションが実行されているか確認

**問題**: GAS API接続エラー

解決策:
- Google Apps Script APIが有効化されているか確認
- OAuth scopeに "https://www.googleapis.com/auth/script.metrics" が含まれているか確認
