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
3. Redirect URLs に `https://okhackjarvis.github.io/desktop-tutorial/**` を追加して保存（これ以外のアドレスには戻らないようにする）

（確認メールやパスワード再設定メールのリンクを開くと、このアドレスに戻ってきます）

## 4. 安全のための設定

「Authentication」の中で、次のようにします（名前は画面の更新で少し変わることがあります）。

| 場所 | 設定 |
|---|---|
| Sign In / Providers → Email | **Confirm email をオン**（本人のメールアドレスか確認する） |
| Sign In / Providers → Email | **Minimum password length を 10**、**Password requirements を「Letters and digits」** |
| Sign In / Providers → Email | **Secure email change をオン**（メールアドレス変更は新旧両方で確認） |
| Sign In / Providers → Email | Prevent use of leaked passwords（流出したパスワードを禁止）。有料プランのみなので、無料の間はなくてよい |
| Sign In / Providers | Email 以外（Phone、Anonymous など）は使わないのでオフのまま |
| Rate Limits | 初期値のまま（ログインの試行回数を制限している） |

あわせて、**GitHub と Supabase のアカウントの2段階認証（2FA）をオン**にしてください。どちらかのアカウントを乗っ取られると、アプリを書き換えられてしまうためです。

- GitHub：右上のアイコン →「Settings」→「Password and authentication」→「Enable two-factor authentication」
- Supabase：右上のアイコン →「Account preferences」→「Multi-factor authentication」

## 5. 接続先を `js/config.js` に書く

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
**service_role キー（新しい画面では secret キー）は絶対に貼らないでください**（すべてのデータを操作できてしまいます）。間違えて貼っても、アプリは使わずにエラーを出すようにしています。

## しくみ（安全のために気をつけていること）

- **記録は本人だけ**：表に行レベルセキュリティ（RLS）をかけ、ログインした本人の行しか読み書きできない。ログインしていない人は表に触れない
- **パスワードはアプリでもリポジトリでも保存しない**：Supabase が元に戻せない形（ハッシュ）で保存する
- **外部のスクリプトを読まない**：ログイン用ライブラリは npm の公式版をそのまま `vendor/` に置いて使う。Content-Security-Policy で、このサイト以外のスクリプトを実行できないようにしている
- **メールのリンクは PKCE 方式**：ログイン用の情報がアドレスバーや履歴に残らない。そのため、確認メール・再設定メールは登録した端末と同じブラウザで開く（別の端末で開いた場合も登録は完了するので、もとの端末でログインし直す）
- **ログアウトすると端末の記録を消す**：共用の端末でも、次の人に記録が見えない（クラウドには残る）
- 1人あたりの保存容量に上限（2MB）をつけている

## 補足

- 無料プランでは、確認メールは1時間に数通までしか送れません。人数が増えたら「Authentication」→「Emails」で自前のメール送信（SMTP）を設定します。
- 無料プランのプロジェクトは、1週間アクセスがないと一時停止します（ダッシュボードから再開できます）。
- 体の写真はクラウドに送らず、これまでどおり端末の中だけに保存します（ログアウトしても消えないので、共用の端末では写真の画面で削除してください）。
