# PMP学習アプリ

個人用のPMP試験対策Web学習アプリです。ブラウザ内に問題データと学習記録を保存し、PMP問題を章ごとに演習・復習できます。

## 問題データの読み込み

問題本文・解説を含む `questions.json` は著作物のため、この公開リポジトリには含めません。PC、iPhoneなど**各端末で初回に1回だけ**、アプリの「データ管理」またはトップ画面からファイルを選択して読み込みます。読み込んだ内容はその端末のブラウザ内に保存され、次回以降は再選択不要です。

問題データは端末間で共有されません。iPhoneでは、`questions.json` を「ファイル」アプリまたはiCloud Driveに置いてから選択してください。

## ローカル確認

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開き、`questions.sample.json` を選択して確認します。`file://` で直接開かないでください。

## GitHub Pagesへのデプロイ

1. GitHubで公開リポジトリを作成します。
2. `.gitignore` に `questions.json`、`progress.json`、`*.local.json` が含まれることを確認します。
3. アプリのコードだけをコミットして `main` ブランチへpushします。問題データと学習記録はコミットしません。
4. リポジトリの **Settings → Pages** を開き、Sourceに **Deploy from a branch**、Branchに **main**、フォルダに **/(root)** を選択して保存します。
5. 表示されたGitHub Pages URLを各端末で開き、問題データを読み込みます。

## iPhoneでホーム画面に追加

1. SafariでGitHub PagesのURLを開きます。
2. 共有ボタンをタップします。
3. 「ホーム画面に追加」を選択し、追加します。
4. 作成された「PMP学習」アイコンから起動します。

学習記録はブラウザ内に保存されます。定期的にデータ管理画面からエクスポートし、iCloud Driveなどに保管してください。
