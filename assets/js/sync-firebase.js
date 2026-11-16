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
  // พนักงานซิงก์ได้เฉพาะข้อมูลที่มีสิทธิ์ (ตรงกับ firestore.rules)
  const READ_STORES = () => (A.workspace ? A.workspace.readStores(STORES()) : STORES());
  const WRITE_STORES = () => (A.workspace ? A.workspace.writeStores(STORES()) : STORES());
  const pendingCount = () => WRITE_STORES().reduce((n, s) => n + A.db.dirty(s).length, 0);

  let backend = null; // {uid, pull, write, listen}
  let unsubs = [];
  let status = { state: 'off', at: 0, msg: '', email: '', authReady: false };
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
    // ไม่มีเมนูซิงก์แล้ว — แสดงป้ายนี้เฉพาะเมื่อเคยตั้งค่า Firebase ไว้
    el.className = `sync-pill ${cls} ${status.state === 'off' ? 'hidden' : ''}`;
    el.innerHTML = `<span class="dot"></span>${A.icon('cloud')}<span>${text}</span>`;
    el.title = status.msg || 'สถานะการซิงก์ Firebase';
  }
  function safePending() { try { return pendingCount(); } catch (e) { return 0; } }

  // ---- cursors (latest updatedAt pulled, per store) ----
  const curKey = () => `bunny.sync.cursor.${backend ? backend.uid : 'x'}${A.workspace ? A.workspace.cursorSuffix() : ''}`;
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
  /* ข้อมูลชุดใหม่ (ต้นทุน / เงินเข้าธนาคาร) ต้องอัปเดตกฎ firestore.rules ก่อน — ถ้ายังไม่อัปเดต ข้ามไปก่อน ไม่ให้ซิงก์ทั้งหมดล้ม */
  const NEW_STORES = ['products', 'deposits', 'invoices'];
  const blocked = new Set();
  const denied = (e) => e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
  const guard = async (s, fn) => {
    try { return await fn(); } catch (e) {
      if (NEW_STORES.includes(s) && denied(e)) { blocked.add(s); return 0; }
      throw e;
    }
  };
  async function push() {
    let n = 0;
    for (const s of WRITE_STORES()) {
      const dirty = A.db.dirty(s);
      if (!dirty.length) continue;
      const docs = dirty.map(clean);
      n += await guard(s, async () => {
        let k = 0;
        for (let i = 0; i < docs.length; i += BATCH) {
          const part = docs.slice(i, i + BATCH);
          await backend.write(s, part);
          await A.db.markClean(s, part.map((d) => ({ id: d.id, updatedAt: d.updatedAt })));
          k += part.length;
        }
        blocked.delete(s);
        return k;
      });
    }
    return n;
  }
  async function pull() {
    let n = 0;
    const c = getCursor();
    for (const s of READ_STORES()) n += await guard(s, async () => applyRemote(s, await backend.pull(s, c[s] || 0)));
    return n;
  }
  function listen() {
    unsubs.forEach((u) => u()); unsubs = [];
    const c = getCursor();
    READ_STORES().forEach((s) => {
      unsubs.push(backend.listen(s, c[s] || 0, (docs) => {
        applyRemote(s, docs).then((n) => { if (n) setStatus({ state: 'ok', at: Date.now() }); }).catch((e) => console.error(e));
      }, (err) => { if (NEW_STORES.includes(s) && denied(err)) { blocked.add(s); return; } console.error(err); setStatus({ state: 'error', msg: err.message }); }));
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
    if (window.firebase && firebase.auth && firebase.firestore) return Promise.resolve(); // already loaded
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
  /* ร้านแรก: users/{uid}/{store} • ร้านที่สร้างเพิ่ม: users/{uid}/shops/{shopId}/{store} */
  function firestoreBackend(uid, shopId = 'main') {
    const fs = firebase.firestore();
    const root = A.workspace ? A.workspace.dataRoot(fs, uid) : shopId === 'main' ? fs.collection('users').doc(uid) : fs.collection('users').doc(uid).collection('shops').doc(shopId);
    const col = (s) => root.collection(s);
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
    'auth/unauthorized-domain': `ต้องเพิ่ม ${location.hostname} ใน Firebase → Authentication → Settings → Authorized domains`,
    'auth/admin-restricted-operation': 'Firebase ของร้านนี้ปิดการสมัครบัญชีใหม่อยู่ — เจ้าของร้านเปิดได้ที่ Firebase Console → Authentication → Settings → User actions → ติ๊ก "Enable create (sign-up)" → Save',
    'auth/too-many-requests': 'ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
    'auth/missing-email': 'กรอกอีเมลก่อน',
    'auth/user-disabled': 'บัญชีนี้ถูกปิดใช้งาน',
    'auth/configuration-not-found': 'ยังไม่ได้เปิด Authentication ใน Firebase Console (Build → Authentication → Get started → เปิด Email/Password)',
    'failed-precondition': 'ยังไม่ได้สร้างฐานข้อมูล Firestore ใน Firebase Console',
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
    hasConfig: () => !!A.sync.getConfig(),
    async boot() {
      drawPill();
      if (auth) return; // already started
      const cfg = A.sync.getConfig();
      if (!cfg) { setStatus({ state: 'off', authReady: true }); return; }
      setStatus({ state: 'connecting', authReady: false });
      try {
        await loadSdk();
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        auth = firebase.auth();
        auth.onAuthStateChanged((user) => {
          if (user) {
            if (A.workspace && !A.workspace.bindUser(user.uid)) return; // ร้านที่เปิดอยู่เป็นของบัญชีอื่น → โหลดใหม่ที่ร้านแรก
            setStatus({ email: user.email, authReady: true });
            startWith(firestoreBackend(user.uid, A.workspace ? A.workspace.id() : 'main'));
            if (A.workspace) A.workspace.fetchList().then(() => A.renderSidebar && A.renderSidebar()).catch(() => {});
            let pick = false;
            try { pick = sessionStorage.getItem('bunny.openPicker') === '1'; sessionStorage.removeItem('bunny.openPicker'); } catch (e) { /* ignore */ }
            if (pick && A.workspace) setTimeout(() => A.workspace.openPicker({ afterLogin: true }), 300);
          } else { stop(); setStatus({ state: 'signedOut', email: '', authReady: true }); }
        });
      } catch (e) {
        // ออฟไลน์ตอนเปิดแอป / โหลด SDK ไม่ได้ → ใช้งานในเครื่องไปก่อน ไม่บล็อกแอป
        setStatus({ state: navigator.onLine ? 'error' : 'offline', msg: thErr(e), authReady: true });
      }
    },
    async signIn(email, pw) { if (!auth) throw new Error('ยังเชื่อมต่อ Firebase ไม่ได้ (ตรวจอินเทอร์เน็ต)'); try { await auth.signInWithEmailAndPassword(email, pw); } catch (e) { throw new Error(thErr(e)); } },
    async signUp(email, pw) {
      if (!auth) throw new Error('ยังเชื่อมต่อ Firebase ไม่ได้ (ตรวจอินเทอร์เน็ต)');
      let cred;
      try { cred = await auth.createUserWithEmailAndPassword(email, pw); } catch (e) { throw new Error(thErr(e)); }
      // ส่งอีเมลยืนยัน (ใช้ร้านของตัวเองได้ทันที — ยืนยันเมื่อจะเข้าร้านที่ได้รับเชิญ)
      try { auth.languageCode = 'th'; await cred.user.sendEmailVerification(); } catch (e) { console.warn('verify email', e); }
    },
    /* อีเมลยืนยันแล้วหรือยัง (บัญชีที่ไม่มีอีเมล ถือว่าไม่เกี่ยว) */
    verified: () => { const u = auth && auth.currentUser; return !u || !u.email || !!u.emailVerified; },
    async sendVerify() { const u = auth && auth.currentUser; if (!u) throw new Error('ต้องเข้าสู่ระบบก่อน'); try { auth.languageCode = 'th'; await u.sendEmailVerification(); } catch (e) { throw new Error(thErr(e)); } },
    /* หลังกดลิงก์ยืนยันในอีเมล: โหลดสถานะบัญชีใหม่ + ขอสิทธิ์ใหม่จาก Firebase */
    async refreshUser() { const u = auth && auth.currentUser; if (!u) return false; await u.reload(); await auth.currentUser.getIdToken(true); return !!auth.currentUser.emailVerified; },
    /* ยืนยันตัวตนอีกครั้งด้วยรหัสผ่านของอีเมลที่เข้าสู่ระบบอยู่ (ใช้ก่อนทำสิ่งที่ย้อนกลับไม่ได้ เช่น ลบไฟล์ที่นำเข้า) */
    async reauth(pw) {
      const u = auth && auth.currentUser;
      if (!u || !u.email) throw new Error('ต้องเข้าสู่ระบบด้วยอีเมลก่อน');
      if (!pw) throw new Error('ใส่รหัสผ่านก่อนนะ');
      try { await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, pw)); } catch (e) { throw new Error(thErr(e)); }
    },
    async resetPassword(email) { if (!auth) throw new Error('ยังเชื่อมต่อ Firebase ไม่ได้'); try { auth.languageCode = 'th'; await auth.sendPasswordResetEmail(email); } catch (e) { throw new Error(thErr(e)); } },
    /* wipe: ล้างข้อมูลในเครื่องนี้ด้วย (ใช้กับเครื่องที่ใช้ร่วมกัน) — ข้อมูลบนคลาวด์ยังอยู่ */
    async signOut({ wipe = false } = {}) {
      if (wipe && pendingCount() > 0) { try { await syncNow(); } catch (e) { /* ignore */ } }
      if (auth) await auth.signOut();
      if (wipe) {
        if (A.filestore && A.filestore.isOn()) A.filestore.pause(true);
        await A.db.wipeLocal();
        if (A.workspace) await A.workspace.wipeOtherLocal(); // ร้านอื่นๆ ที่เคยเปิดบนเครื่องนี้ด้วย
        A.sync.resetCursor();
      }
      // ออกจากระบบแล้วกลับไปร้านแรก (ร้านที่สร้างเพิ่มเปิดได้เฉพาะตอนเข้าสู่ระบบ)
      if (A.workspace && A.workspace.resetToMain()) { location.hash = '#/dashboard'; location.reload(); }
    },
    user: () => (auth && auth.currentUser) || null,
    pending: () => safePending(),
    // ข้อมูลชุดที่กฎ Firebase ยังไม่อนุญาต (ต้องเผยแพร่ firestore.rules ใหม่)
    blocked: () => [...blocked],
    firestore: () => firebase.firestore(),
    async syncNow() { try { return await syncNow(); } catch (e) { throw new Error(thErr(e)); } },
    /* ลืมจุดซิงก์ล่าสุดของทุกบัญชีในเครื่องนี้ → เข้าสู่ระบบครั้งหน้าจะดึงข้อมูลทั้งหมดลงมาใหม่ */
    resetCursor() {
      Object.keys(localStorage).filter((k) => k.startsWith('bunny.sync.cursor.')).forEach((k) => localStorage.removeItem(k));
    },
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
