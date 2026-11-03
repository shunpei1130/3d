# Katachi — ほしいを、かたちに。

日本語で相談 → 実寸3D比較 → STL保存／Resendで自分に送信する個人向け3Dプリントスタジオ。

## 起動

Node.js 22以上。`npm ci` → `.env.example` を `.env.local` にコピー → `npm run dev`。

## Vercel 環境変数

| 変数 | 設定内容 |
|---|---|
| `OPENAI_API_KEY` | OpenAI APIキー。サーバーのみで使用 |
| `RESEND_API_KEY` | Resendの送信用APIキー |
| `RESEND_FROM` | Resendで確認済みの送信元。例 `Katachi <studio@example.com>`。未設定時は `onboarding@resend.dev`（自アカウント宛テスト制限あり） |
| `STUDIO_PASSWORD` | 任意の追加アクセスコード。設定するとAPIの利用にコードが必要 |

Productionを選び保存後、Redeployしてください。Vercelの既存Deployment Protectionを維持する想定。公開範囲を広げる際には永続的なレート制限・ログインを追加してください。現状のAPI制限はプロセス内の簡易制限であり分散上限ではありません。

## 仕様

- OpenAI Responses API、`gpt-6-luna`、`reasoning.effort=max`。別モデルへの自動置換なし。`store:false`。
- AIは検証済みスキーマのCSGレシピを出力。任意コード実行なし。幾何プリミティブの加算・減算、多角形、英数字の文字入れに対応。
- 自由曲面の有機物、人物彫刻、写真からの3D復元、既存STLの編集は未対応。会話で限界を説明。
- 形状生成はブラウザWorker。表示とSTLは同一三角形。Workerが45秒超過した場合は停止。
- メールはサーバーで同じレシピを再計算し、ZIP（STL、編集用JSON、印刷メモ）を添付。宛先は **s.hasegawa1130@gmail.com** に固定。送信ボタン以外では送らない。
- iPhone 16はApple公式寸法 71.6 × 147.6 × 7.8 mm。本体の比較用近似モデル、ケース・カメラ突起は含まない。
- A1 mini 180 × 180 × 180 mm、0.4 mmノズル、0.2 mm積層、テクスチャPEI、eSUN PLA+・外部スプール。
- 現物の印刷、サポート、寸法公差、強度、文字再現は別途Bambu Studioと実機で確認。サイトからプリンターの開始操作は行わない。
- 保存はローカルストレージ（最大12件）。別ブラウザへはプロジェクトJSONをダウンロード・読み込み。
- サンプルの筆記体はAllura。以前のSTLのSegoe Script Boldとは異なる。フォントはOFLで同梱。

## チェック

`npm test`（CSGの寸法・体積・彫り込み・STL整合性と入力拒否）、`npm run typecheck`、`npm run build`。

## 根拠

- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://support.apple.com/ja-jp/121029
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/attachments

APIキー設定前は接続準備中と表示し、サンプル・比較・STL保存は利用可能。
