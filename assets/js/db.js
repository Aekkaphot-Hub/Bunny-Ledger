/* ฐานข้อมูลในเครื่อง (IndexedDB) + แคชในหน่วยความจำ
   ทุกเรคคอร์ดมี updatedAt, deleted (soft delete), _dirty (รอซิงก์ขึ้นคลาวด์) */
(function (A) {
  let DB_NAME = 'bunny-ledger'; // แต่ละร้านมีฐานข้อมูลของตัวเอง (ดู workspace.js)
  const VERSION = 2;
  const STORES = ['orders', 'expenses', 'otherIncome', 'imports', 'settings', 'templates'];
  const META = 'meta'; // ค่าเฉพาะเครื่องนี้ (เช่น ไฟล์ที่เลือกให้บันทึก) — ไม่ซิงก์ ไม่ส่งออก
  let idb = null;
  const cache = {};
  const listeners = [];

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function write(store, fn) {
    return new Promise((resolve, reject) => {
      const t = idb.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  function readAll(store) {
    return new Promise((resolve, reject) => {
      const r = idb.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function emit(e) { listeners.forEach((fn) => { try { fn(e); } catch (err) { console.error(err); } }); }

  const db = {
    STORES,
    async init(name) {
      if (name) DB_NAME = name;
      // จำชื่อฐานข้อมูลที่เคยเปิดบนเครื่องนี้ ไว้ล้างทิ้งทั้งหมดตอน "ออกจากระบบ + ล้างข้อมูล"
      const known = A.U.lsGet('bunny.dbs', []);
      if (!known.includes(DB_NAME)) A.U.lsSet('bunny.dbs', [...known, DB_NAME]);
      idb = await open();
      for (const s of STORES) {
        cache[s] = new Map();
        (await readAll(s)).forEach((x) => cache[s].set(x.id, x));
      }
    },
    on(fn) { listeners.push(fn); },
    name: () => DB_NAME,
    all(s) { const out = []; cache[s].forEach((x) => { if (!x.deleted) out.push(x); }); return out; },
    raw(s) { return [...cache[s].values()]; },
    get(s, id) { const x = cache[s].get(id); return x && !x.deleted ? x : null; },
    getRaw(s, id) { return cache[s].get(id) || null; },
    count(s) { let n = 0; cache[s].forEach((x) => { if (!x.deleted) n++; }); return n; },

    /* opts.remote: record comes from the cloud — keep its updatedAt, not dirty
       opts.keepTime: keep given updatedAt but still mark dirty (restore from backup) */
    async putMany(s, recs, opts = {}) {
      if (!recs.length) return [];
      const now = Date.now();
      const out = recs.map((r) => {
        const x = { ...r };
        if (!x.id) x.id = A.U.uid();
        if (opts.remote) {
          x._dirty = 0;
        } else {
          if (!opts.keepTime || !x.updatedAt) {
            const prev = cache[s].get(x.id);
            x.updatedAt = Math.max(now, prev ? (prev.updatedAt || 0) + 1 : 0);
          }
          x._dirty = 1;
        }
        if (x.deleted === undefined) x.deleted = false;
        return x;
      });
      await write(s, (st) => out.forEach((x) => st.put(x)));
      out.forEach((x) => cache[s].set(x.id, x));
      emit({ store: s, remote: !!opts.remote, count: out.length });
      return out;
    },
    async put(s, rec, opts) { return (await db.putMany(s, [rec], opts))[0]; },
    async remove(s, id) { const x = cache[s].get(id); if (x) await db.put(s, { ...x, deleted: true }); },
    async removeMany(s, ids) {
      const recs = ids.map((id) => cache[s].get(id)).filter(Boolean).map((x) => ({ ...x, deleted: true }));
      await db.putMany(s, recs);
    },
    dirty(s) { return db.raw(s).filter((x) => x._dirty); },
    pendingCount() { return STORES.reduce((n, s) => n + db.dirty(s).length, 0); },
    /* after a successful upload: clear the dirty flag if nothing changed meanwhile */
    async markClean(s, items) {
      const recs = [];
      items.forEach(({ id, updatedAt }) => {
        const x = cache[s].get(id);
        if (x && x.updatedAt === updatedAt && x._dirty) recs.push({ ...x, _dirty: 0 });
      });
      if (!recs.length) return;
      await write(s, (st) => recs.forEach((x) => st.put(x)));
      recs.forEach((x) => cache[s].set(x.id, x));
    },
    /* wipe this computer only (cloud copy untouched) */
    async wipeLocal() {
      for (const s of STORES) { await write(s, (st) => st.clear()); cache[s].clear(); }
      emit({ store: '*', remote: false });
    },
    metaGet(key) {
      return new Promise((resolve, reject) => {
        const r = idb.transaction(META).objectStore(META).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    metaSet(key, val) { return write(META, (st) => st.put(val, key)); },
    metaDel(key) { return write(META, (st) => st.delete(key)); },
    totalCount() { return STORES.reduce((n, s) => n + db.count(s), 0); },
    exportAll() {
      const data = {};
      STORES.forEach((s) => { data[s] = db.raw(s).map(({ _dirty, ...x }) => x); });
      return { app: 'bunny-ledger', version: 1, exportedAt: new Date().toISOString(), data };
    },
    /* merge a backup: newer updatedAt wins */
    async importAll(json) {
      if (!json || json.app !== 'bunny-ledger' || !json.data) throw new Error('ไม่ใช่ไฟล์สำรองของโปรแกรมนี้');
      let n = 0;
      for (const s of STORES) {
        const recs = (json.data[s] || []).filter((r) => {
          const cur = cache[s].get(r.id);
          return r && r.id && (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0));
        });
        await db.putMany(s, recs, { keepTime: true });
        n += recs.length;
      }
      return n;
    },
  };

  // ---- settings helpers ----
  A.settings = () => {
    const s = db.get('settings', 'main') || {};
    const d = A.DEFAULT_SETTINGS;
    // ร้านที่เพิ่งเปิดบนเครื่องนี้ (ยังไม่มีการตั้งค่า) ใช้ชื่อจากรายชื่อร้านไปก่อน
    const name = s.shopName || (A.workspace && A.workspace.cachedName()) || d.shopName;
    return {
      ...d, ...s, shopName: name,
      payoutDays: { ...d.payoutDays, ...(s.payoutDays || {}) },
      feeRate: { ...d.feeRate, ...(s.feeRate || {}) },
      expenseCategories: s.expenseCategories || d.expenseCategories,
      incomeCategories: s.incomeCategories || d.incomeCategories,
      shops: s.shops || [],
    };
  };
  A.saveSettings = async (patch) => {
    const cur = A.settings();
    return db.put('settings', { ...cur, ...patch, id: 'main' });
  };

  A.db = db;
})(window.App);
