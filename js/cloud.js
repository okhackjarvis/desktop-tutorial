// ログインとクラウド同期（Supabase）。設定がないとき・読み込めないときは null を返し、アプリは端末の中だけで動く
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// ライブラリは外部の配信サービスから読まず、このサイトに置いたもの（npm の公式版をそのままコピー）を使う
const SDK_PATH = 'vendor/supabase-2.45.4.js';
let client = null;

// 公開してよいキー（anon / publishable）だけを使う。管理者用のキーが書かれていたら使わない
function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch { return false; }
}
const keyIsSafe = !!SUPABASE_ANON_KEY && !isSecretKey(SUPABASE_ANON_KEY);
if (SUPABASE_ANON_KEY && !keyIsSafe) console.error('js/config.js に管理者用のキーが書かれています。anon public キーに差し替えてください。');

export const cloudConfigured = () => !!(SUPABASE_URL.startsWith('https://') && keyIsSafe);

function loadSdk() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_PATH;
    s.onload = () => (window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('sdk')));
    s.onerror = () => reject(new Error('sdk'));
    document.head.append(s);
  });
}

export async function getClient() {
  if (!cloudConfigured()) return null;
  if (client) return client;
  // オフラインでもアプリ本体は動くように、ここで必要になったときだけ読み込む
  const { createClient } = await loadSdk();
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
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
  return (await c.auth.resetPasswordForEmail(email, { redirectTo: `${redirectTo()}?reset=1` })).error;
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
