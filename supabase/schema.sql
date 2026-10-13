-- WILL のクラウド同期用テーブル。Supabase の SQL Editor に貼り付けて「Run」する。

-- 記録は1人1行。アプリの記録（state）を JSON のまま保存する
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 行レベルセキュリティ：ログインしている本人の行だけ読み書きできる
alter table public.user_data enable row level security;

drop policy if exists "read own data" on public.user_data;
create policy "read own data" on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists "insert own data" on public.user_data;
create policy "insert own data" on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own data" on public.user_data;
create policy "update own data" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own data" on public.user_data;
create policy "delete own data" on public.user_data
  for delete using (auth.uid() = user_id);

-- アカウント削除：本人のアカウントと記録を消す（App Store の審査でも必要）
create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
