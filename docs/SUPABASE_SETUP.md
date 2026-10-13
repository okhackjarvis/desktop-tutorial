# ログイン（Supabase）の準備

WILL のログインとクラウド同期には [Supabase](https://supabase.com)（無料プランで使えます）を使います。次の手順は一度だけです。

## 1. プロジェクトを作る

1. https://supabase.com で「Start your project」→ GitHub アカウントでサインイン
2. 「New project」を押す
   - Name：`will`
   - Database Password：「Generate a password」で作ってメモしておく（アプリには使いません）
   - Region：`Northeast Asia (Tokyo)`
3. 「Create new project」。1〜2分待つ

## 2. 表を作る

1. 左のメニューの「SQL Editor」を開く
2. このリポジトリの `supabase/schema.sql` の中身を全部貼り付けて「Run」
3. 「Success. No rows returned」と出れば OK

## 3. ログイン後に戻ってくる URL を設定する

1. 左のメニューの「Authentication」→「URL Configuration」
2. Site URL：`https://okhackjarvis.github.io/desktop-tutorial/`
3. Redirect URLs に同じ URL を追加して保存

（確認メールやパスワード再設定メールのリンクを開くと、このアドレスに戻ってきます）

## 4. 接続先を `js/config.js` に書く

1. 左下の歯車「Project Settings」→「API」（または「Data API」と「API Keys」）
2. 次の2つをコピー
   - Project URL（`https://xxxx.supabase.co`）
   - anon public キー（`eyJ...` で始まる長い文字列）
3. `js/config.js` に貼り付ける

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

anon キーは公開してよいキーです（アプリの中に入れて使う前提のもの）。記録は表の権限設定（RLS）で、本人しか読み書きできないようにしています。
**service_role キーは絶対に貼らないでください**（すべてのデータを操作できてしまいます）。

## 補足

- 無料プランでは、確認メールは1時間に数通までしか送れません。人数が増えたら「Authentication」→「Emails」で自前のメール送信（SMTP）を設定します。
- 無料プランのプロジェクトは、1週間アクセスがないと一時停止します（ダッシュボードから再開できます）。
- 体の写真はクラウドに送らず、これまでどおり端末の中だけに保存します。
