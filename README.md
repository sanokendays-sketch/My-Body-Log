# My Body Log v0.1

個人用の体組成記録アプリです。HTML、CSS、Vanilla JavaScriptのみで動作し、入力データはブラウザーのIndexedDBに保存します。外部APIやログイン機能はありません。

## 起動

`index.html`をブラウザーで開くか、ローカルのHTTPサーバーで配信してください。PWAのインストールとService WorkerにはHTTPS（またはlocalhost）が必要です。

## GitHub Pagesで公開

1. このフォルダーのファイルをGitHubリポジトリの公開対象ブランチへ配置します。
2. リポジトリの **Settings → Pages** で公開元ブランチとフォルダーを選択します。
3. 公開されたHTTPS URLをiPhoneのSafariで開き、共有メニューから「ホーム画面に追加」を選びます。

## データについて

- 記録は利用中のブラウザーとサイトの保存領域に保存されます。端末やブラウザーを変えると自動では引き継がれません。
- ブラウザーのサイトデータを消す前に、設定画面からJSONバックアップを作成してください。
- JSON復元は現在の記録を置き換えます。復元前に確認画面が表示されます。
- AI相談機能は文章を端末内で生成するだけで、外部へ自動送信しません。
- このアプリは健康管理の記録用であり、医療診断を行いません。

## 主なファイル

- `index.html`：画面構成
- `styles.css`：レスポンシブUI
- `app.js`：IndexedDB、記録・グラフ・出力処理
- `manifest.json`：PWA設定
- `service-worker.js`：オフライン用キャッシュ
- `icon-180.png` / `icon-192.png` / `icon-512.png`：iPhone・PWAアイコン
