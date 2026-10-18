// Accounts: Supabase email/password when configured, otherwise device-only local accounts.
import { CONFIG } from './config.js?v=1792331845';

const LS_ACC = 'ek_accounts_v1', LS_CUR = 'ek_current_v1';

async function sha(text) {
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(16);
}
const loadAcc = () => { try { return JSON.parse(localStorage.getItem(LS_ACC)) || {}; } catch (_) { return {}; } };
const saveAcc = (a) => { try { localStorage.setItem(LS_ACC, JSON.stringify(a)); } catch (_) {} };

// compact form for the old account-metadata save. Keeps every card field (variant, ability, X-Factor):
// dropping them used to break the save's seal on the other device and knock coins back to 1500.
function pack(p) {
  const { log, ...rest } = p;
  return { ...rest, ut: { ...p.ut, cards: p.ut.cards.map(c => [c.u, c.id, c.b || 0, c.x || 0, c.ab || 0, c.xf ? 1 : 0]) } };
}
function unpack(e) {
  try { return { ...e, log: [], ut: { ...e.ut, cards: (e.ut.cards || []).map(a => { const c = { u: a[0], id: a[1], b: a[2] }; if (a[3]) c.x = a[3]; if (a[4]) c.ab = a[4]; if (a[5]) c.xf = 1; return c; }) } }; } catch (_) { return null; }
}
// how far along a save is: level and XP only ever go up, so the save with more of them is the real one
export const progOf = p => p ? (p.lvl || 1) * 1e7 + (p.xp || 0) * 10 + Math.min(9, p.games || 0) : 0;

export const Auth = {
  mode: 'local', client: null, user: null,

  configured() { return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY); },

  async init() {
    if (this.configured()) {
      try {
        const { createClient } = await import('../vendor/supabase.js');
        this.client = createClient(CONFIG.SUPABASE_URL.trim(), CONFIG.SUPABASE_ANON_KEY.trim(), {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        this.mode = 'supabase';
        const { data } = await this.client.auth.getSession();
        if (data && data.session) this.user = this.fromSb(data.session.user);
        return this.user;
      } catch (e) {
        console.warn('Supabase init failed, using local mode', e);
        this.mode = 'local'; this.client = null;
      }
    }
    try { const cur = localStorage.getItem(LS_CUR); const acc = loadAcc(); if (cur && acc[cur]) this.user = this.fromLocal(cur, acc[cur]); } catch (_) {}
    return this.user;
  },

  fromSb(u) {
    this._sbUser = u;
    const m = u.user_metadata || {};
    return { id: u.id, name: m.username || (u.email || 'Player').split('@')[0], email: u.email, wins: m.wins || 0, losses: m.losses || 0, ties: m.ties || 0, kind: 'account' };
  },
  fromLocal(name, a) { return { id: 'local-' + name.toLowerCase(), name, wins: a.wins || 0, losses: a.losses || 0, ties: a.ties || 0, kind: 'local' }; },

  validName(n) { return /^[A-Za-z0-9_]{3,16}$/.test(n); },

  async signUp(username, email, password) {
    username = (username || '').trim();
    if (!this.validName(username)) throw new Error('Username: 3-16 letters, numbers or _');
    if ((password || '').length < 6) throw new Error('Password needs at least 6 characters');
    if (this.mode === 'supabase') {
      const { data, error } = await this.client.auth.signUp({
        email: (email || '').trim(), password,
        options: { data: { username, wins: 0, losses: 0, ties: 0 }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw new Error(error.message);
      if (!data.session) return { needsConfirm: true };
      this.user = this.fromSb(data.user);
      return { user: this.user };
    }
    const acc = loadAcc();
    const key = Object.keys(acc).find(k => k.toLowerCase() === username.toLowerCase());
    if (key) throw new Error('That username is taken on this device');
    const salt = Math.random().toString(36).slice(2);
    acc[username] = { salt, hash: await sha(salt + password), wins: 0, losses: 0, ties: 0, created: Date.now() };
    saveAcc(acc);
    localStorage.setItem(LS_CUR, username);
    this.user = this.fromLocal(username, acc[username]);
    return { user: this.user };
  },

  async signIn(id, password) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.client.auth.signInWithPassword({ email: (id || '').trim(), password });
      if (error) throw new Error(error.message === 'Email not confirmed' ? 'Confirm your email first (check your inbox)' : error.message);
      this.user = this.fromSb(data.user);
      return this.user;
    }
    const acc = loadAcc();
    const key = Object.keys(acc).find(k => k.toLowerCase() === (id || '').trim().toLowerCase());
    if (!key || acc[key].hash !== await sha(acc[key].salt + password)) throw new Error('Wrong username or password');
    localStorage.setItem(LS_CUR, key);
    this.user = this.fromLocal(key, acc[key]);
    return this.user;
  },

  async resetPassword(email) {
    if (this.mode !== 'supabase') throw new Error('Password reset needs online accounts set up');
    const { error } = await this.client.auth.resetPasswordForEmail((email || '').trim(), { redirectTo: location.origin + location.pathname });
    if (error) throw new Error(error.message);
  },

  guest() {
    // the same guest on this device keeps their progress
    let g = null; try { g = JSON.parse(localStorage.getItem('ek_guest') || 'null'); } catch (_) {}
    if (!g) { g = { id: 'guest-' + Math.random().toString(36).slice(2, 8), name: 'Guest' + Math.floor(1000 + Math.random() * 9000) }; try { localStorage.setItem('ek_guest', JSON.stringify(g)); } catch (_) {} }
    this.user = { id: g.id, name: g.name, wins: 0, losses: 0, ties: 0, kind: 'guest' };
    return this.user;
  },

  // progression save that follows a real account between devices (kept compact: it rides in the account metadata)
  cloudProfile() {
    if (this.mode !== 'supabase' || !this.user || this.user.kind !== 'account') return null;
    if (this._row) return this._row.p || null;
    return this._sbUser && this._sbUser.user_metadata && this._sbUser.user_metadata.ek ? unpack(this._sbUser.user_metadata.ek) : null;
  },
  // the full save (profile + franchise + season) from the ek_saves table, falling back to the old metadata copy
  async refreshCloud() {
    if (this.mode !== 'supabase' || !this.user || this.user.kind !== 'account') return null;
    try {
      const { data, error } = await this.client.from('ek_saves').select('data').eq('id', this.user.id).maybeSingle();
      if (!error) { this._saves = true; this._row = data ? data.data : null; }
    } catch (_) {}
    if (!this._row) { try { const { data } = await this.client.auth.getUser(); if (data && data.user) this._sbUser = data.user; } catch (_) {} }
    return this.cloudProfile();
  },
  // send any waiting save right away (tab hidden or closing)
  flushNow() { if (this._pendP && this._cloudT) { clearTimeout(this._cloudT); this._cloudT = null; this.flushCloud(); } },
  cloudExtra(k) { return this._row && this._row[k] !== undefined ? this._row[k] : undefined; },
  saveCloud(p, extra) {
    if (this.mode !== 'supabase' || !this.user || this.user.kind !== 'account') return;
    this._pendP = p || this._pendP || (this._row && this._row.p) || null; if (extra) this._pendX = { ...(this._pendX || {}), ...extra };
    clearTimeout(this._cloudT);
    this._cloudT = setTimeout(() => { this._cloudT = null; this.flushCloud(); }, 2500);
    if (!this._hideHook) { this._hideHook = true; const f = () => this.flushNow(); addEventListener('pagehide', f); document.addEventListener('visibilitychange', () => { if (document.hidden) f(); }); }
  },
  async flushCloud() {
    const p = this._pendP; if (!p || this.mode !== 'supabase' || !this.user || this.user.kind !== 'account') return;
    const row = { ...(this._row || {}), ...(this._pendX || {}), p, at: Date.now() };
    try {
      const { error } = await this.client.from('ek_saves').upsert({ id: this.user.id, data: row, prog: progOf(p), updated_at: new Date().toISOString() });
      if (!error) { this._row = row; this._saves = true; this._pendX = null; return; }
      console.warn('cloud save (table) failed, using account metadata', error.message);
    } catch (e) { console.warn(e); }
    try { const { data } = await this.client.auth.updateUser({ data: { ek: pack(p) } }); if (data && data.user) this._sbUser = data.user; } catch (e) { console.warn('cloud save failed', e); }
  },

  async signOut() {
    if (this.mode === 'supabase' && this.user && this.user.kind === 'account') await this.client.auth.signOut();
    try { localStorage.removeItem(LS_CUR); } catch (_) {}
    this.user = null;
  },

  async recordResult(r) {
    const u = this.user; if (!u) return;
    if (r === 'W') u.wins++; else if (r === 'L') u.losses++; else u.ties++;
    if (u.kind === 'account' && this.mode === 'supabase') {
      try { await this.client.auth.updateUser({ data: { wins: u.wins, losses: u.losses, ties: u.ties } }); } catch (e) { console.warn(e); }
    } else if (u.kind === 'local') {
      const acc = loadAcc(); const a = acc[u.name]; if (a) { a.wins = u.wins; a.losses = u.losses; a.ties = u.ties; saveAcc(acc); }
    }
  },
};
