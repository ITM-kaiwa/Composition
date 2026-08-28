# 呪文バトル (Jumon Battle)

「みんなの日本語」初級I・II（第1課〜第50課）の文型・例文・練習Aから抽出した約1,500文をもとにした、単語カードのドラッグ&ドロップ並び替えゲーム。ドラクエ風のバトル画面で、正しい語順に並べて「呪文」を完成させるとモンスターにダメージを与える。

## 使い方

```bash
npm install
npm run dev
```

`http://localhost:3000` を開く（ポートが使用中の場合は自動的に別ポートが割り当てられる）。

- 画面上部のドロップダウンで課（第1課〜第50課、またはランダム全課）を選択
- 下部の単語タイルをドラッグ（またはタップ）して上の空欄に並べる
- 全部並べたら「✨ 呪文をとなえる！」で判定
- 正解でモンスターにダメージ、5回正解で勝利。誤答するとハート（HP）を1つ失い、3回間違えると敗北
- 「文リストをダウンロード (CSV)」で抽出した全文データをダウンロード可能

## データパイプライン

文データは手作業で入力したものではなく、教科書PDFのスキャン画像をOCR（Claudeによる画像読み取り）で読み取って抽出した。

1. `scripts/ocr-source/*.json` — 各課の文型・例文・練習A（代入練習を組み合わせて完全な文にしたもの）を抽出した生データ。第1課〜第25課はVol.1、第26課〜第50課はVol.2から。
2. `scripts/build-sentence-data.mjs` — 上記JSONを統合し、[kuromoji](https://github.com/takuyaa/kuromoji.js)（IPADIC辞書による形態素解析）で単語・助詞レベルまで分割し、`src/lib/sentenceBattleData.ts` を生成する。

文データを修正・再抽出した場合は、`scripts/ocr-source/` のJSONを編集してから再実行する:

```bash
node scripts/build-sentence-data.mjs
```

`src/lib/sentenceBattleData.ts` は自動生成ファイルなので直接編集しない。

## 技術構成

Next.js 14 (App Router) / React / TypeScript / Tailwind CSS。ビルド不要のバックエンドなしSPA。
