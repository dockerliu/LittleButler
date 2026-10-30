/* 小管家 — 本机账户锁（V1.0.1，PRD 4.7）
 * 定位：隐私保护，不是云端账号。本机仅一个主人账户。
 * 密码以「随机盐 + SHA-256 ×3000 迭代」哈希存储，不存明文；
 * 遗忘密码无法找回（数据不上传、无服务端），注册页已明示。
 */
(function () {
  'use strict';
  const AUTH_KEY = 'xgj:auth:v1';
  const SESSION_KEY = 'xgj:session:v1';
  const FAIL_KEY = 'xgj:auth:fail:v1';
  const ITERATIONS = 3000;
  const MAX_FAILS = 5;
  const LOCK_MS = 5 * 60 * 1000;      // 连错 5 次锁 5 分钟
  const REMEMBER_MS = 7 * 86400000;   // 7 天免登录
  const SESSION_MS = 12 * 3600000;    // 不勾选免登录：会话内有效（sessionStorage）

  const readJSON = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };

  async function hashHex(text) {
    if (!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues)) {
      // 非 Secure Context 兜底（file:// 部分浏览器）：FNV-1a，安全性下降但功能可用
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return 'fnv:' + (h >>> 0).toString(16);
    }
    let data = new TextEncoder().encode(text);
    for (let i = 0; i < ITERATIONS; i++) {
      data = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    }
    return 'sha:' + [...data].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function randomSalt() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const getAuth = () => readJSON(AUTH_KEY);
  const hasAccount = () => !!getAuth();
  const getUsername = () => { const a = getAuth(); return a ? a.username : ''; };

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (s && s.exp > Date.now()) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function currentUser() {
    const s = readSession();
    if (!s) return null;
    const auth = getAuth();
    return auth && auth.username === s.username ? s.username : null;
  }

  const failState = () => readJSON(FAIL_KEY) || { count: 0, until: 0 };
  const saveFail = f => localStorage.setItem(FAIL_KEY, JSON.stringify(f));
  function lockedForMs() {
    const f = failState();
    return f.until > Date.now() ? f.until - Date.now() : 0;
  }

  async function register(username, password) {
    if (getAuth()) return { ok: false, msg: '本机已存在账户，请直接登录' };
    if (!/^[^\s]{2,16}$/.test(username)) return { ok: false, msg: '用户名需 2–16 位且不含空格' };
    if (password.length < 6) return { ok: false, msg: '密码至少 6 位' };
    const salt = randomSalt();
    const hash = await hashHex(salt + password);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ username, salt, hash, createdAt: new Date().toISOString() }));
    return { ok: true };
  }

  async function login(username, password, remember) {
    const lock = lockedForMs();
    if (lock > 0) return { ok: false, msg: `尝试次数过多，请约 ${Math.ceil(lock / 60000)} 分钟后再试` };
    const auth = getAuth();
    if (!auth) return { ok: false, msg: '本机尚未注册账户' };
    const hash = await hashHex(auth.salt + password);
    if (auth.username !== username || hash !== auth.hash) {
      const f = failState();
      f.count += 1;
      if (f.count >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.count = 0; }
      saveFail(f);
      return { ok: false, msg: f.until > Date.now() ? '错误次数过多，已锁定 5 分钟' : `用户名或密码错误（再错 ${MAX_FAILS - f.count} 次将锁定 5 分钟）` };
    }
    saveFail({ count: 0, until: 0 });
    setSession(auth.username, remember);
    return { ok: true };
  }

  function setSession(username, remember) {
    const s = JSON.stringify({ username, exp: Date.now() + (remember ? REMEMBER_MS : SESSION_MS) });
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, s);
  }

  function logout() { clearSession(); }

  window.XGJAuth = { hasAccount, getUsername, currentUser, register, login, logout, lockedForMs };
})();
