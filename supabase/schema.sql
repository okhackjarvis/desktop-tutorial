-- WILL のクラウド同期用テーブル。Supabase の SQL Editor に貼り付けて「Run」する（何度実行しても大丈夫）。

-- 記録は1人1行。アプリの記録（state）を JSON のまま保存する
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 1人あたりの容量の上限（2MB。数年分の記録でも十分）。大量のデータで容量を食いつぶされないようにする
alter table public.user_data drop constraint if exists user_data_size;
alter table public.user_data add constraint user_data_size check (pg_column_size(data) < 2000000);

-- ログインしていない人（anon）には、表を一切触らせない
revoke all on table public.user_data from anon;
revoke all on table public.user_data from public;
grant select, insert, update, delete on table public.user_data to authenticated;

-- 行レベルセキュリティ：ログインしている本人の行だけ読み書きできる
alter table public.user_data enable row level security;
alter table public.user_data force row level security;

drop policy if exists "read own data" on public.user_data;
create policy "read own data" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert own data" on public.user_data;
create policy "insert own data" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "update own data" on public.user_data;
create policy "update own data" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "delete own data" on public.user_data;
create policy "delete own data" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- アカウント削除：本人のアカウントと記録を消す（App Store の審査でも必要）
-- 管理者の権限で動くので、検索先を固定し、必ず本人（auth.uid()）だけを消す
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
