// ログインとクラウド同期（Supabase）。設定がないとき・読み込めないときは null を返し、アプリは端末の中だけで動く
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let client = null;

export const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function getClient() {
  if (!cloudConfigured()) return null;
  if (client) return client;
  // オフラインでもアプリ本体は動くように、ここで必要になったときだけ読み込む
  const { createClient } = await import(SDK_URL);
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export async function currentUser() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user || null;
}

const redirectTo = () => location.origin + location.pathname;

export async function signIn(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  return { user: data?.user || null, error };
}

export async function signUp(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
  // メール確認が必要な設定では session が null になる
  return { user: data?.user || null, needsConfirm: !data?.session, error };
}

export async function sendPasswordReset(email) {
  const c = await getClient();
  return (await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })).error;
}

export async function updatePassword(password) {
  const c = await getClient();
  return (await c.auth.updateUser({ password })).error;
}

export async function signOut() {
  const c = await getClient();
  if (c) await c.auth.signOut();
}

export async function onAuthChange(fn) {
  const c = await getClient();
  if (c) c.auth.onAuthStateChange((event, session) => fn(event, session?.user || null));
}

// 記録は1人1行（user_data テーブル）に JSON でまとめて保存する
export async function pull(userId) {
  const c = await getClient();
  const { data, error } = await c.from('user_data').select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? { data: data.data, updatedAt: Date.parse(data.updated_at) } : null;
}

export async function push(userId, data, updatedAt) {
  const c = await getClient();
  const { error } = await c.from('user_data').upsert({ user_id: userId, data, updated_at: new Date(updatedAt).toISOString() });
  if (error) throw error;
}

export async function deleteAccount() {
  const c = await getClient();
  const { error } = await c.rpc('delete_user');
  if (error) throw error;
  await c.auth.signOut();
}
