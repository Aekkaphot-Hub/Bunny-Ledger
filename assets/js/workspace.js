/* หลายร้านต่อ 1 บัญชี — เจ้าของอีเมลสร้างร้านเพิ่มได้ และสลับดูข้อมูลแต่ละร้านได้ (ข้อมูลแยกกันทั้งหมด)
   - ร้านแรก (id 'main'): Firestore users/{uid}/{store}            ฐานข้อมูลในเครื่อง 'bunny-ledger' (ข้อมูลเดิมอยู่ที่นี่)
   - ร้านที่สร้างเพิ่ม:     Firestore users/{uid}/shops/{id}/{store}  ฐานข้อมูลในเครื่อง 'bunny-ledger.{id}'
   - รายชื่อร้าน:         Firestore users/{uid}/shops/{id} = { id, name, createdAt, updatedAt, deleted } */
(function (A) {
  const U = A.U;
  const ACTIVE_KEY = 'bunny.shop.active';           // { uid, id } ร้านที่เปิดอยู่ในเครื่องนี้
  const LIST_KEY = (uid) => `bunny.shop.list.${uid}`; // รายชื่อร้าน (แคชไว้ใช้ตอนออฟไลน์)
  const MAIN = 'main';
  const ws = {};

  ws.active = () => { const a = U.lsGet(ACTIVE_KEY, null); return a && a.id ? a : { uid: null, id: MAIN }; };
  ws.id = () => ws.active().id;
  ws.isMain = () => ws.id() === MAIN;
  ws.dbName = (id = ws.id()) => (id === MAIN ? 'bunny-ledger' : `bunny-ledger.${id}`);
  ws.cursorSuffix = (id = ws.id()) => (id === MAIN ? '' : `.${id}`);
  ws.cached = (uid = ws.active().uid) => (uid ? U.lsGet(LIST_KEY(uid), []) : []);
  /* ชื่อร้านที่จำไว้ (ใช้เมื่อร้านนี้ยังไม่มีการตั้งค่าในเครื่อง เช่น เพิ่งเปิดครั้งแรกบนเครื่องนี้) */
  ws.cachedName = (id = ws.id()) => { const s = ws.cached().find((x) => x.id === id); return s ? s.name : ''; };

  /* เรียกจาก sync เมื่อรู้ว่าใครเข้าสู่ระบบ — คืน false ถ้าต้องโหลดแอปใหม่ (ร้านที่เปิดอยู่เป็นของบัญชีอื่น) */
  ws.bindUser = (uid) => {
    const a = ws.active();
    if (a.uid && a.uid !== uid && a.id !== MAIN) { U.lsSet(ACTIVE_KEY, { uid, id: MAIN }); location.reload(); return false; }
    if (a.uid !== uid) U.lsSet(ACTIVE_KEY, { uid, id: a.id });
    return true;
  };
  /* ออกจากระบบ → กลับไปร้านแรก (คืน true ถ้าต้องโหลดแอปใหม่) */
  ws.resetToMain = () => {
    const wasOther = !ws.isMain();
    U.lsSet(ACTIVE_KEY, { uid: null, id: MAIN });
    return wasOther;
  };
  ws.switchTo = (id) => {
    const uid = A.sync.user() ? A.sync.user().uid : ws.active().uid;
    U.lsSet(ACTIVE_KEY, { uid, id });
    location.hash = '#/dashboard';
    location.reload();
  };

  // ---- Firestore ----
  const shopsCol = () => { const u = A.sync.user(); if (!u) throw new Error('ต้องเข้าสู่ระบบก่อน'); return A.sync.firestore().collection('users').doc(u.uid).collection('shops'); };
  const friendly = (e) => (e && e.code === 'permission-denied'
    ? 'Firebase ยังไม่อนุญาตให้ใช้หลายร้าน — ต้องอัปเดตกฎ Firestore (firestore.rules) ใน Firebase Console ก่อน'
    : (e && e.message) || String(e));

  ws.fetchList = async () => {
    const u = A.sync.user();
    if (!u) return [];
    let list;
    try {
      const snap = await shopsCol().get();
      list = snap.docs.map((d) => d.data()).filter((x) => x && x.id && !x.deleted);
    } catch (e) {
      const err = new Error(friendly(e));
      err.cached = ws.cached(u.uid);
      throw err;
    }
    if (!list.some((x) => x.id === MAIN)) list.push({ id: MAIN, name: ws.isMain() ? A.settings().shopName : 'ร้านแรก', createdAt: 0 });
    list.sort((a, b) => (a.id === MAIN ? -1 : b.id === MAIN ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
    U.lsSet(LIST_KEY(u.uid), list);
    // ชื่อร้านที่เปิดอยู่ในรายการ ให้ตรงกับหน้าตั้งค่าเสมอ
    const cur = list.find((x) => x.id === ws.id());
    if (cur && A.settings().shopName && cur.name !== A.settings().shopName && A.db.get('settings', 'main')) ws.saveName().catch(() => {});
    return list;
  };
  ws.create = async (name) => {
    name = String(name || '').trim();
    if (!name) throw new Error('ตั้งชื่อร้านก่อน');
    const id = 's' + U.uid();
    const now = Date.now();
    // บันทึกชื่อร้านแรกไว้ด้วย (ครั้งแรกที่สร้างร้านเพิ่ม)
    if (ws.isMain()) await shopsCol().doc(MAIN).set({ id: MAIN, name: A.settings().shopName, updatedAt: now, deleted: false }, { merge: true }).catch(() => {});
    try { await shopsCol().doc(id).set({ id, name, createdAt: now, updatedAt: now, deleted: false }); } catch (e) { throw new Error(friendly(e)); }
    const uid = A.sync.user().uid;
    U.lsSet(LIST_KEY(uid), [...ws.cached(uid), { id, name, createdAt: now }]);
    return id;
  };
  /* ชื่อร้าน (จากหน้าตั้งค่า) → อัปเดตในรายชื่อร้านบนคลาวด์ */
  ws.saveName = async () => {
    const u = A.sync.user();
    if (!u) return;
    const id = ws.id(), name = A.settings().shopName;
    await shopsCol().doc(id).set({ id, name, updatedAt: Date.now(), deleted: false }, { merge: true });
    U.lsSet(LIST_KEY(u.uid), ws.cached(u.uid).map((x) => (x.id === id ? { ...x, name } : x)));
  };
  /* ซ่อนร้านออกจากรายการ (ข้อมูลบนคลาวด์ยังอยู่) + ลบสำเนาในเครื่องนี้ */
  ws.hide = async (id) => {
    if (id === MAIN || id === ws.id()) throw new Error('ลบร้านแรก หรือร้านที่เปิดอยู่ไม่ได้');
    try { await shopsCol().doc(id).set({ deleted: true, updatedAt: Date.now() }, { merge: true }); } catch (e) { throw new Error(friendly(e)); }
    const uid = A.sync.user().uid;
    U.lsSet(LIST_KEY(uid), ws.cached(uid).filter((x) => x.id !== id));
    try { indexedDB.deleteDatabase(ws.dbName(id)); } catch (e) { /* ignore */ }
  };
  /* ล้างสำเนาข้อมูลของทุกร้าน (ยกเว้นร้านที่เปิดอยู่ ซึ่งล้างด้วย A.db.wipeLocal) — ใช้ตอน "ออกจากระบบ + ล้างข้อมูล" */
  ws.wipeOtherLocal = () => {
    const ids = new Set();
    Object.keys(localStorage).filter((k) => k.startsWith('bunny.shop.list.')).forEach((k) => U.lsGet(k, []).forEach((x) => ids.add(x.id)));
    ids.add(MAIN);
    ids.delete(ws.id());
    ids.forEach((id) => { try { indexedDB.deleteDatabase(ws.dbName(id)); } catch (e) { /* ignore */ } });
    Object.keys(localStorage).filter((k) => k.startsWith('bunny.shop.list.')).forEach((k) => localStorage.removeItem(k));
  };

  // ---- หน้าต่างเลือกร้าน ----
  let open = null;
  ws.openPicker = ({ afterLogin = false } = {}) => {
    if (open) return;
    if (!A.sync.user()) { A.ui.toast('เข้าสู่ระบบก่อน แล้วจะเลือก/สร้างร้านได้'); return; }
    const m = A.ui.modal({
      title: afterLogin ? 'เลือกร้านที่จะเปิด' : 'ร้านของฉัน',
      body: `<p class="muted small" style="margin-top:0">ร้านทั้งหมดที่บัญชี <b>${U.esc(A.sync.user().email || '')}</b> สร้างไว้ — ข้อมูลแต่ละร้านแยกกัน</p>
        <div class="shop-list" id="shop-list"><p class="muted">กำลังโหลดรายชื่อร้าน…</p></div>
        <div class="shop-new">
          <div class="field" style="flex:1"><label>สร้างร้านใหม่</label><input class="input" id="shop-name" maxlength="60" placeholder="ชื่อร้าน เช่น ร้านที่ 2"></div>
          <button class="btn blue" id="shop-create">${A.icon('plus')} สร้างร้าน</button>
        </div>`,
      actions: [{ label: afterLogin ? `ใช้ร้านที่เปิดอยู่ (${U.esc(A.settings().shopName)})` : 'ปิด', cls: 'ghost' }],
    });
    open = m;
    const obs = new MutationObserver(() => { if (!document.body.contains(m.root)) { obs.disconnect(); open = null; } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
    const box = m.root.querySelector('#shop-list');
    const draw = (list, err) => {
      if (!box.isConnected) return;
      const cur = ws.id();
      box.innerHTML = `${err ? `<div class="notice warn">${A.icon('alert')}<div>${U.esc(err)}</div></div>` : ''}
        ${list.map((s) => `<div class="shop-item ${s.id === cur ? 'current' : ''}">
          <span class="shop-ic">${A.icon('store')}</span>
          <div class="shop-main"><b>${U.esc(s.id === cur ? A.settings().shopName : s.name)}</b><small>${s.id === MAIN ? 'ร้านแรก' : `สร้างเมื่อ ${U.thDate(U.ymd(new Date(s.createdAt || Date.now())))}`}</small></div>
          ${s.id === cur ? '<span class="badge b-green">เปิดอยู่</span>' : `<button class="btn sm" data-open="${U.esc(s.id)}">เปิดร้านนี้</button>`}
          ${s.id !== MAIN && s.id !== cur ? `<button class="icon-btn" data-hide="${U.esc(s.id)}" title="ลบออกจากรายการ">${A.icon('trash')}</button>` : ''}
        </div>`).join('') || '<p class="muted">ยังไม่มีร้าน</p>'}`;
      box.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { m.close(); ws.switchTo(b.dataset.open); }; });
      box.querySelectorAll('[data-hide]').forEach((b) => {
        b.onclick = async () => {
          const s = list.find((x) => x.id === b.dataset.hide);
          if (!(await A.ui.confirm(`ลบ "${s.name}" ออกจากรายการ?`, 'ร้านนี้จะหายจากรายการร้านและจากเครื่องนี้ (ข้อมูลที่ซิงก์ขึ้นคลาวด์ไว้แล้วยังเก็บอยู่ ไม่ถูกลบ)', 'ลบออกจากรายการ', true))) return;
          try { await ws.hide(s.id); load(); A.ui.toast('ลบร้านออกจากรายการแล้ว'); } catch (e) { A.ui.toast(e.message, 'err'); }
        };
      });
    };
    const load = () => ws.fetchList().then((l) => draw(l)).catch((e) => draw(e.cached && e.cached.length ? e.cached : [{ id: MAIN, name: A.settings().shopName }], e.message));
    load();
    const nameIn = m.root.querySelector('#shop-name');
    const createBtn = m.root.querySelector('#shop-create');
    const create = async () => {
      createBtn.disabled = true;
      try {
        const id = await ws.create(nameIn.value);
        A.ui.toast('สร้างร้านแล้ว กำลังเปิดร้านใหม่…', 'ok');
        m.close();
        ws.switchTo(id);
      } catch (e) { A.ui.toast(e.message, 'err'); createBtn.disabled = false; }
    };
    createBtn.onclick = create;
    nameIn.onkeydown = (e) => { if (e.key === 'Enter') create(); };
    setTimeout(() => { if (document.activeElement === nameIn) nameIn.blur(); }, 60); // ไม่ต้องเด้งแป้นพิมพ์บนมือถือ
  };

  A.workspace = ws;
})(window.App);
