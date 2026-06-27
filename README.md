# おうちダッシュボード 🏠

iPad Mini 2向け家庭内情報端末PWAアプリ。Cloudflare Workers上で動作し、iPadにPWAとしてインストールしてキオスクモードで常時表示します。

## 機能

- **デジタル時計・日付表示** — 1秒更新、日本語曜日付き
- **天気情報** — OpenWeatherMap API連携（設定から APIキー入力）
- **カレンダー** — 月表示、イベント追加・削除、色分け
- **メモ** — カラーメモ（5色）、ピン止め、編集・削除
- **タスク/TODO** — 優先度・期限設定、完了チェック
- **PWA対応** — ホーム画面に追加、オフライン動作（Service Worker）
- **画面スリープ防止** — Wake Lock API

## iPad設定手順（キオスクモード）

### 1. PWAインストール
1. SafariでアプリURLを開く
2. 共有ボタン → 「ホーム画面に追加」
3. 名前を「おうち」に設定して追加

### 2. アクセスガイド（キオスクモード）
1. 設定 → アクセシビリティ → アクセスガイド
2. アクセスガイドをオン
3. パスコードを設定
4. アプリを開いた状態でサイドボタン3回押し → アクセスガイド開始

### 3. 自動ロック無効化
- 設定 → 画面表示と明るさ → 自動ロック → しない

### 4. 天気設定
1. アプリ右下「設定」ボタン
2. [openweathermap.org](https://openweathermap.org/api) で無料APIキーを取得
3. APIキーと都市名（Tokyo等）を入力して保存

## URL構成

| パス | 説明 |
|------|------|
| `/` | メインダッシュボード |
| `/api/memos` | メモCRUD API |
| `/api/tasks` | タスクCRUD API |
| `/api/events` | カレンダーイベントCRUD API |
| `/api/settings` | 設定R/W API |
| `/manifest.json` | PWAマニフェスト |
| `/sw.js` | Service Worker |

## 技術スタック

- **フレームワーク**: Hono (TypeScript)
- **デプロイ**: Cloudflare Workers / Pages
- **DB**: Cloudflare D1 (SQLite)
- **フロントエンド**: Vanilla JS + CSS (CDN: FontAwesome)
- **PWA**: Web App Manifest + Service Worker

## データモデル

- `memos`: id, content, color, pinned, created_at, updated_at
- `tasks`: id, title, done, due_date, priority, created_at, updated_at
- `events`: id, title, date, time, color, repeat_type, created_at
- `settings`: key, value, updated_at

## ローカル開発

```bash
npm run build
npx wrangler d1 migrations apply webapp-production --local
pm2 start ecosystem.config.cjs
# → http://localhost:3000
```

## デプロイ

Genspark Hosted Deploy (gsk-hosted-deploy) によりCloudflare Workersへ自動デプロイ

## iPad Mini 2 スペック対応

- 解像度: 1024×768px (landscape)
- iOS: 最大12.5まで対応
- Safariのみ（PWAキオスクモード）
- touch-action: none でスクロール無効化

---
Last Updated: 2026-06-27
