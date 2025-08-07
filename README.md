# GAS Metrics

これはGASの実行ログを定期的に取得し、メトリクスを取得してWebhookで通知するサービスです。

## セットアップ手順

セットアップとデプロイ手順は **[deployment-guide.md](./deployment-guide.md)** を参照してください。

## 技術スタック

| カテゴリ | 技術・サービス | 役割 |
|:------|:-------------|:-----|
| **フロントエンド** | Cloudflare Pages | UIのホスティング |
| **バックエンド** | Cloudflare Workers | API・ロジック処理 |
| **認証** | Auth.js | Googleログイン |
| **データベース** | Cloudflare D1 | ユーザー・設定データ |
| **定期実行** | Cron Triggers | 監視タスクのスケジュール |
| **外部API** | Google Apps Script API | メトリクス取得 |
