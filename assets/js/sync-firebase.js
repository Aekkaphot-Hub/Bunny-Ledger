/* ซิงก์ข้อมูล IndexedDB ⇄ Firebase Firestore
   - ข้อมูลในเครื่องเป็นตัวหลัก ใช้งานได้แม้ออฟไลน์
   - Firestore: users/{uid}/{store}/{id}
   - ส่งขึ้นเฉพาะรายการที่แก้ไข (_dirty), ดึงลงเฉพาะที่ใหม่กว่า (updatedAt) + ฟังการเปลี่ยนแปลงแบบเรียลไทม์
   - ชนกัน: ฉบับที่แก้ไขล่าสุดชนะ, การลบใช้ deleted:true */
(function (A) {
  const U = A.U;
  const SDK = '10.12.2';
  const CFG_KEY = 'bunny.firebaseConfig';
  const AUTO_KEY = 'bunny.sync.auto';
  const BATCH = 450;
  const STORES = () => A.db.STORES;

  let backend = null; // {uid, pull, write, listen}
  let unsubs = [];
  let status = { state: 'off', at: 0, msg: '', email: '' };
  const statusListeners = [];
  let auth = null;
  let sdkPromise = null;
  let busy = false;
  let again = false;

  function setStatus(patch) {
    status = { ...status, ...patch };
    statusListeners.forEach((fn) => { try { fn(status); } catch (e) { console.error(e); } });
    drawPill();
  }
  function drawPill() {
    const el = document.getElementById('sync-pill');
    if (!el) return;
    const pend = A.db && A.db.STORES ? safePending() : 0;
    const map = {
      off: ['', 'ยังไม่เปิดซิงก์'],
      signedOut: ['', 'ซิงก์: ยังไม่เข้าสู่ระบบ'],
      connecting: ['busy', 'กำลังเชื่อมต่อ…'],
      busy: ['busy', 'กำลังซิงก์…'],
      ok: ['ok', `ซิงก์แล้ว ${status.at ? new Date(status.at).toTimeString().slice(0, 5) : ''}${pend ? ` • รอส่ง ${pend}` : ''}`],
      offline: ['err', `ออฟไลน์${pend ? ` • รอส่ง ${pend}` : ''}`],
      error: ['err', 'ซิงก์มีปัญหา'],
    };
    const [cls, text] = map[status.state] || map.off;
    el.className = `sync-pill ${cls}`;
    el.innerHTML = `<span class="dot"></span>${A.icon('cloud')}<span>${text}</span>`;
    el.title = status.msg || 'สถานะการซิงก์ Firebase';
  }
  function safePending() { try { return A.db.pendingCount(); } catch (e) { return 0; } }

  // ---- cursors (latest updatedAt pulled, per store) ----
  const curKey = () => `bunny.sync.cursor.${backend ? backend.uid : 'x'}`;
  const getCursor = () => U.lsGet(curKey(), {});
  const setCursor = (c) => U.lsSet(curKey(), c);

  const clean = (x) => { const { _dirty, ...rest } = x; return JSON.parse(JSON.stringify(rest)); };

  async function applyRemote(store, docs) {
    if (!docs.length) return 0;
    const fresh = docs.filter((d) => {
      if (!d || !d.id) return false;
      const cur = A.db.getRaw(store, d.id);
      return !cur || (d.updatedAt || 0) > (cur.updatedAt || 0);
    });
    if (fresh.length) await A.db.putMany(store, fresh, { remote: true });
    const c = getCursor();
    c[store] = Math.max(c[store] || 0, ...docs.map((d) => d.updatedAt || 0));
    setCursor(c);
    return fresh.length;
  }
  async function push() {
    let n = 0;
    for (const s of STORES()) {
      const dirty = A.db.dirty(s);
      if (!dirty.length) continue;
      const docs = dirty.map(clean);
      for (let i = 0; i < docs.length; i += BATCH) {
        const part = docs.slice(i, i + BATCH);
        await backend.write(s, part);
        await A.db.markClean(s, part.map((d) => ({ id: d.id, updatedAt: d.updatedAt })));
        n += part.length;
      }
    }
    return n;
  }
  async function pull() {
    let n = 0;
    const c = getCursor();
    for (const s of STORES()) n += await applyRemote(s, await backend.pull(s, c[s] || 0));
    return n;
  }
  function listen() {
    unsubs.forEach((u) => u()); unsubs = [];
    const c = getCursor();
    STORES().forEach((s) => {
      unsubs.push(backend.listen(s, c[s] || 0, (docs) => {
        applyRemote(s, docs).then((n) => { if (n) setStatus({ state: 'ok', at: Date.now() }); }).catch((e) => console.error(e));
      }, (err) => { console.error(err); setStatus({ state: 'error', msg: err.message }); }));
    });
  }

  async function syncNow() {
    if (!backend) return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
    busy = true;
    setStatus({ state: 'busy' });
    try {
      const got = await pull();
      const sent = await push();
      setStatus({ state: 'ok', at: Date.now(), msg: `ดึงลง ${got} • ส่งขึ้น ${sent} รายการ` });
      U.lsSet('bunny.sync.lastAt', Date.now());
      return { got, sent };
    } catch (e) {
      console.error(e);
      setStatus({ state: navigator.onLine ? 'error' : 'offline', msg: e.message });
      throw e;
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(syncNow, 300); }
    }
  }
  const pushSoon = U.debounce(() => { if (backend && isAuto()) syncNow().catch(() => {}); }, 2000);
  const isAuto = () => U.lsGet(AUTO_KEY, true);

  async function startWith(b) {
    backend = b;
    setStatus({ state: 'busy' });
    try { await syncNow(); } catch (e) { /* status already set */ }
    listen();
  }
  function stop() {
    unsubs.forEach((u) => u()); unsubs = [];
    backend = null;
  }

  // ---- Firebase SDK ----
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('โหลด Firebase SDK ไม่ได้ (ตรวจอินเทอร์เน็ต)'));
      document.head.appendChild(s);
    });
  }
  function loadSdk() {
    if (!sdkPromise) {
      sdkPromise = (async () => {
        const base = `https://www.gstatic.com/firebasejs/${SDK}/`;
        await loadScript(base + 'firebase-app-compat.js');
        await loadScript(base + 'firebase-auth-compat.js');
        await loadScript(base + 'firebase-firestore-compat.js');
      })();
      sdkPromise.catch(() => { sdkPromise = null; });
    }
    return sdkPromise;
  }
  function firestoreBackend(uid) {
    const fs = firebase.firestore();
    const col = (s) => fs.collection('users').doc(uid).collection(s);
    return {
      uid,
      async pull(s, since) { const snap = await col(s).where('updatedAt', '>', since).get(); return snap.docs.map((d) => d.data()); },
      async write(s, docs) { const b = fs.batch(); docs.forEach((d) => b.set(col(s).doc(d.id), d)); await b.commit(); },
      listen(s, since, cb, onErr) {
        return col(s).where('updatedAt', '>', since).onSnapshot((snap) => {
          const docs = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites).map((c) => c.doc.data());
          if (docs.length) cb(docs);
        }, onErr);
      },
    };
  }

  const ERR = {
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชีนี้ — กด "สมัครบัญชีใหม่" ก่อน',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/invalid-login-credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/email-already-in-use': 'อีเมลนี้มีบัญชีแล้ว — กด "เข้าสู่ระบบ" แทน',
    'auth/weak-password': 'รหัสผ่านสั้นไป (อย่างน้อย 6 ตัว)',
    'auth/operation-not-allowed': 'ยังไม่ได้เปิด Email/Password ใน Firebase Authentication',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้',
    'auth/unauthorized-domain': 'ต้องเพิ่ม localhost ใน Authorized domains ของ Firebase',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'apiKey ใน Firebase config ไม่ถูกต้อง',
    'permission-denied': 'Firestore ไม่อนุญาต — ตรวจว่าได้วาง firestore.rules แล้ว',
  };
  const thErr = (e) => ERR[e && e.code] || (e && e.message) || String(e);

  A.sync = {
    status: () => status,
    onStatus(fn) { statusListeners.push(fn); },
    isOn: () => !!backend,
    isAuto,
    setAuto(v) { U.lsSet(AUTO_KEY, !!v); if (v) syncNow().catch(() => {}); },
    getConfig: () => U.lsGet(CFG_KEY, null) || window.BUNNY_FIREBASE_CONFIG || null,
    configFromFile: () => !U.lsGet(CFG_KEY, null) && !!window.BUNNY_FIREBASE_CONFIG,
    parseConfig(text) {
      const cfg = {};
      const re = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(text))) cfg[m[1]] = m[2];
      if (!cfg.apiKey || !cfg.projectId) throw new Error('ไม่พบ apiKey หรือ projectId — คัดลอกส่วน firebaseConfig มาทั้งก้อน');
      if (!cfg.authDomain) cfg.authDomain = `${cfg.projectId}.firebaseapp.com`;
      return cfg;
    },
    async saveConfig(cfg) {
      U.lsSet(CFG_KEY, cfg);
      if (window.firebase && firebase.apps && firebase.apps.length) { location.reload(); return; }
      await A.sync.boot();
    },
    clearConfig() { localStorage.removeItem(CFG_KEY); stop(); location.reload(); },
    async boot() {
      drawPill();
      const cfg = A.sync.getConfig();
      if (!cfg) { setStatus({ state: 'off' }); return; }
      setStatus({ state: 'connecting' });
      try {
        await loadSdk();
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        auth = firebase.auth();
        auth.onAuthStateChanged((user) => {
          if (user) { setStatus({ email: user.email }); startWith(firestoreBackend(user.uid)); }
          else { stop(); setStatus({ state: 'signedOut', email: '' }); }
        });
      } catch (e) {
        setStatus({ state: 'error', msg: thErr(e) });
      }
    },
    async signIn(email, pw) { if (!auth) throw new Error('ยังไม่ได้ตั้งค่า Firebase'); try { await auth.signInWithEmailAndPassword(email, pw); } catch (e) { throw new Error(thErr(e)); } },
    async signUp(email, pw) { if (!auth) throw new Error('ยังไม่ได้ตั้งค่า Firebase'); try { await auth.createUserWithEmailAndPassword(email, pw); } catch (e) { throw new Error(thErr(e)); } },
    async signOut() { if (auth) await auth.signOut(); },
    async syncNow() { try { return await syncNow(); } catch (e) { throw new Error(thErr(e)); } },
    resetCursor() { if (backend) setCursor({}); },
    // ---- for testing with a fake backend ----
    _startWith: startWith,
    _stop: stop,
  };

  // local edits → upload shortly after
  document.addEventListener('DOMContentLoaded', () => {
    A.db.on((e) => { if (!e.remote) { drawPill(); pushSoon(); } });
  });
  window.addEventListener('online', () => { if (backend) syncNow().catch(() => {}); });
  window.addEventListener('offline', () => { if (backend) setStatus({ state: 'offline' }); });
})(window.App);
