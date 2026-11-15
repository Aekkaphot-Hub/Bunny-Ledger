/* ร้าน & ทีมงาน
   เฟส 1.5 — เจ้าของอีเมลสร้างได้หลายร้าน สลับดูข้อมูลแต่ละร้าน (ข้อมูลแยกกันทั้งหมด)
   เฟส 2   — เจ้าของร้านเชิญคนอื่นด้วยอีเมล ให้ใช้ข้อมูลร้านเดียวกัน สิทธิ์บังคับด้วย firestore.rules
     ผู้จัดการ (manager): เห็น/แก้ทุกอย่าง ยกเว้นจัดการทีม
     พนักงาน (staff):    ออเดอร์ นำเข้าไฟล์ ลูกหนี้ ติดตามพัสดุ — ไม่เห็นรายจ่าย รายรับอื่น กำไร แก้การตั้งค่าร้านไม่ได้
   ที่เก็บข้อมูล
   - ร้านแรก (id 'main'):  Firestore users/{เจ้าของ}/{store}             ในเครื่อง 'bunny-ledger'
   - ร้านที่สร้างเพิ่ม:      Firestore users/{เจ้าของ}/shops/{id}/{store}   ในเครื่อง 'bunny-ledger.{id}'
   - ร้านที่ได้รับเชิญ:     (ที่เดียวกับของเจ้าของ)                        ในเครื่อง 'bunny-ledger.{เจ้าของ}.{id}'
   - รายชื่อร้าน + สมาชิก: users/{เจ้าของ}/shops/{id} = { id, name, members: { อีเมล: role }, ... }
   - คำเชิญ:             invites/{อีเมล}/shops/{เจ้าของ_id} = { ownerUid, ownerEmail, shopId, name, role } */
(function (A) {
  const U = A.U;
  const ACTIVE_KEY = 'bunny.shop.active';           // { uid, id, owner, role, ownerEmail } ร้านที่เปิดอยู่ในเครื่องนี้
  const LIST_KEY = (uid) => `bunny.shop.list.${uid}`; // รายชื่อร้าน (แคชไว้ใช้ตอนออฟไลน์)
  const MAIN = 'main';
  const MAIN_OWNER = 'bunny.main.owner'; // บัญชีเจ้าของข้อมูลในฐานข้อมูล 'bunny-ledger' ของเครื่องนี้
  const ROLES = { owner: 'เจ้าของร้าน', manager: 'ผู้จัดการ', staff: 'พนักงาน' };
  const ROLE_DESC = { manager: 'เห็นและแก้ไขข้อมูลร้านได้ทุกอย่าง (ยกเว้นจัดการทีม)', staff: 'นำเข้าไฟล์ ดูออเดอร์ ลูกหนี้ และติดตามพัสดุ — ไม่เห็นรายจ่าย รายรับอื่น และกำไร' };
  // ข้อมูลที่แต่ละบทบาทซิงก์ได้ (ต้องตรงกับ firestore.rules)
  const STAFF_READ = ['orders', 'imports', 'templates', 'settings'];
  const STAFF_WRITE = ['orders', 'imports', 'templates', 'otherIncome'];
  const STAFF_PAGES = ['dashboard', 'import', 'verify', 'shops', 'receivables', 'tracking', 'claims', 'settings', 'sync'];
  const ws = { ROLES, ROLE_DESC };

  ws.active = () => {
    const a = U.lsGet(ACTIVE_KEY, null);
    if (!a || !a.id) return { uid: null, id: MAIN, owner: null, role: 'owner' };
    return { ...a, owner: a.owner || a.uid, role: a.role || 'owner' };
  };
  ws.id = () => ws.active().id;
  ws.isShared = () => { const a = ws.active(); return !!(a.uid && a.owner && a.owner !== a.uid); };
  ws.isMain = () => ws.id() === MAIN && !ws.isShared();
  ws.role = () => (ws.isShared() ? ws.active().role : 'owner');
  ws.roleLabel = (r = ws.role()) => ROLES[r] || r;
  ws.ownerUid = (uid) => (ws.isShared() ? ws.active().owner : uid);
  /* สิทธิ์ฝั่งหน้าจอ (ฝั่งเซิร์ฟเวอร์บังคับด้วย firestore.rules อีกชั้น) */
  ws.can = (what) => {
    const r = ws.role();
    if (what === 'team') return r === 'owner';
    if (what === 'finance' || what === 'settings' || what === 'demo') return r !== 'staff' && (what !== 'demo' || !ws.isShared());
    return true;
  };
  ws.canPage = (page) => ws.role() !== 'staff' || STAFF_PAGES.includes(page);
  ws.readStores = (all) => (ws.role() === 'staff' ? all.filter((s) => STAFF_READ.includes(s)) : all);
  ws.writeStores = (all) => (ws.role() === 'staff' ? all.filter((s) => STAFF_WRITE.includes(s)) : all);

  ws.dbName = () => {
    const a = ws.active();
    if (ws.isShared()) return `bunny-ledger.${a.owner}.${a.id}`;
    if (a.id !== MAIN) return `bunny-ledger.${a.id}`;
    // คนอื่นเข้าสู่ระบบบนเครื่องนี้ (เช่น พนักงานใช้คอมของเจ้าของ) → ใช้ฐานข้อมูลแยก ไม่รวมข้อมูลของเจ้าของเครื่องขึ้นบัญชีตัวเอง
    const mo = U.lsGet(MAIN_OWNER, null);
    return a.uid && mo && mo !== a.uid ? `bunny-ledger.u.${a.uid}` : 'bunny-ledger';
  };
  ws.cursorSuffix = () => { const a = ws.active(); return ws.isShared() ? `.${a.owner}.${a.id}` : a.id === MAIN ? '' : `.${a.id}`; };
  ws.localDataBelongsToOther = (uid) => { const mo = U.lsGet(MAIN_OWNER, null); return !!(mo && mo !== uid); };
  ws.cached = (uid = ws.active().uid) => (uid ? U.lsGet(LIST_KEY(uid), []) : []);
  const keyOf = (s) => `${s.owner || ''}|${s.id}`;
  /* ชื่อร้านที่จำไว้ (ใช้เมื่อร้านนี้ยังไม่มีการตั้งค่าในเครื่อง เช่น เพิ่งเปิดครั้งแรกบนเครื่องนี้) */
  ws.cachedName = () => {
    const a = ws.active();
    const s = ws.cached().find((x) => x.id === a.id && (x.owner || a.uid) === (a.owner || a.uid));
    return s ? s.name : '';
  };

  /* เรียกจาก sync เมื่อรู้ว่าใครเข้าสู่ระบบ — คืน false ถ้าต้องโหลดแอปใหม่ (ร้านที่เปิดอยู่เป็นของบัญชีอื่น) */
  ws.bindUser = (uid) => {
    const a = ws.active();
    if (a.uid && a.uid !== uid && (a.id !== MAIN || ws.isShared())) { U.lsSet(ACTIVE_KEY, { uid, id: MAIN }); location.reload(); return false; }
    if (a.uid !== uid) U.lsSet(ACTIVE_KEY, { ...a, uid, owner: a.owner && a.owner !== a.uid ? a.owner : uid });
    if (!ws.isShared() && ws.id() === MAIN && !U.lsGet(MAIN_OWNER, null)) U.lsSet(MAIN_OWNER, uid); // ข้อมูลเดิมในเครื่องเป็นของบัญชีแรกที่เข้าสู่ระบบ
    if (A.db.name && A.db.name() !== ws.dbName()) { location.reload(); return false; }
    return true;
  };
  /* ออกจากระบบ → กลับไปร้านแรก (คืน true ถ้าต้องโหลดแอปใหม่) */
  ws.resetToMain = () => {
    U.lsSet(ACTIVE_KEY, { uid: null, id: MAIN });
    return !A.db.name || A.db.name() !== ws.dbName();
  };
  ws.switchTo = (shop) => {
    const uid = A.sync.user() ? A.sync.user().uid : ws.active().uid;
    const owner = shop.owner || uid;
    U.lsSet(ACTIVE_KEY, { uid, id: shop.id, owner, role: owner === uid ? 'owner' : shop.role, ownerEmail: shop.ownerEmail || '' });
    location.hash = '#/dashboard';
    location.reload();
  };

  // ---- Firestore ----
  const me = () => { const u = A.sync.user(); if (!u) throw new Error('ต้องเข้าสู่ระบบก่อน'); return u; };
  const fsdb = () => A.sync.firestore();
  const shopsCol = (uid = me().uid) => fsdb().collection('users').doc(uid).collection('shops');
  const invitesCol = (email) => fsdb().collection('invites').doc(String(email).toLowerCase()).collection('shops');
  const friendly = (e) => (e && e.code === 'permission-denied'
    ? 'Firebase ยังไม่อนุญาต — ต้องอัปเดตกฎ Firestore (firestore.rules ฉบับล่าสุด) ใน Firebase Console ก่อน'
    : (e && e.message) || String(e));
  /* root ของข้อมูลร้านที่เปิดอยู่ (ใช้ใน sync) */
  ws.dataRoot = (fs, uid) => {
    const a = ws.active();
    const owner = ws.isShared() ? a.owner : uid;
    const u = fs.collection('users').doc(owner);
    return a.id === MAIN ? u : u.collection('shops').doc(a.id);
  };

  ws.fetchList = async () => {
    const u = A.sync.user();
    if (!u) return [];
    let own;
    try {
      const snap = await shopsCol(u.uid).get();
      own = snap.docs.map((d) => d.data()).filter((x) => x && x.id && !x.deleted);
    } catch (e) {
      const err = new Error(friendly(e));
      err.cached = ws.cached(u.uid);
      throw err;
    }
    if (!own.some((x) => x.id === MAIN)) own.push({ id: MAIN, name: ws.isMain() ? A.settings().shopName : 'ร้านแรก', createdAt: 0 });
    own.sort((a, b) => (a.id === MAIN ? -1 : b.id === MAIN ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
    own = own.map((x) => ({ id: x.id, name: x.name, createdAt: x.createdAt, owner: u.uid, role: 'owner', members: x.members || {} }));
    // ร้านที่ได้รับเชิญ (ถ้ากฎยังเป็นฉบับเก่าจะอ่านไม่ได้ — ข้ามไป) • ต้องยืนยันอีเมลก่อน
    let shared = [];
    ws.unverified = !!(u.email && !u.emailVerified);
    if (ws.unverified) {
      // ยังยืนยันอีเมลไม่ได้ → ไม่รู้รายชื่อร้านที่เชิญ อย่าลบสำเนาในเครื่อง / อย่าพาออกจากร้าน
      U.lsSet(LIST_KEY(u.uid), [...own, ...ws.cached(u.uid).filter((x) => x.shared)]);
      if (ws.isShared()) A.ui.toast('ร้านนี้ต้องยืนยันอีเมลก่อนจึงจะซิงก์ได้ — เปิดหน้าต่างเปลี่ยนร้านเพื่อส่งอีเมลยืนยัน', 'err');
      return own;
    }
    if (u.email) {
      try {
        const snap = await invitesCol(u.email).get();
        shared = snap.docs.map((d) => d.data()).filter((x) => x && x.shopId && x.ownerUid && x.ownerUid !== u.uid)
          .map((x) => ({ id: x.shopId, name: x.name, owner: x.ownerUid, ownerEmail: x.ownerEmail, role: x.role, createdAt: x.createdAt, shared: true }));
      } catch (e) { console.warn('invites', e); }
    }
    const list = [...own, ...shared];
    // ร้านที่ถูกนำออกจากทีม → ลบสำเนาข้อมูลร้านนั้นออกจากเครื่องนี้
    const still = new Set(shared.map(keyOf));
    ws.cached(u.uid).filter((x) => x.shared && !still.has(keyOf(x))).forEach((x) => dropLocal(`bunny-ledger.${x.owner}.${x.id}`));
    U.lsSet(LIST_KEY(u.uid), list);
    // ร้านที่เปิดอยู่: ชื่อให้ตรงกับหน้าตั้งค่า / ถ้าถูกเชิญออกหรือเปลี่ยนสิทธิ์ ให้รู้ทันที
    const a = ws.active();
    if (ws.isShared()) {
      const cur = shared.find((x) => x.id === a.id && x.owner === a.owner);
      if (!cur) { A.ui.toast('คุณไม่ได้เป็นสมาชิกร้านนี้แล้ว — กลับไปร้านของคุณ', 'err'); setTimeout(() => ws.switchTo({ id: MAIN }), 1500); }
      else if (cur.role !== a.role) { U.lsSet(ACTIVE_KEY, { ...a, role: cur.role }); A.ui.toast(`สิทธิ์ของคุณในร้านนี้เปลี่ยนเป็น "${ws.roleLabel(cur.role)}"`); setTimeout(() => location.reload(), 1500); }
    } else {
      const cur = own.find((x) => x.id === a.id);
      if (cur && A.settings().shopName && cur.name !== A.settings().shopName && A.db.get('settings', 'main')) ws.saveName().catch(() => {});
    }
    return list;
  };
  /* ลบฐานข้อมูลในเครื่อง (ถ้ากำลังเปิดอยู่ จะลบหลังโหลดแอปใหม่) */
  function dropLocal(name) {
    if (A.db.name && A.db.name() === name) { U.lsSet('bunny.dropDbs', [...U.lsGet('bunny.dropDbs', []), name]); return; }
    try { indexedDB.deleteDatabase(name); } catch (e) { /* ignore */ }
  }
  ws.create = async (name) => {
    name = String(name || '').trim();
    if (!name) throw new Error('ตั้งชื่อร้านก่อน');
    const id = 's' + U.uid();
    const now = Date.now();
    // บันทึกชื่อร้านแรกไว้ด้วย (ครั้งแรกที่สร้างร้านเพิ่ม)
    if (ws.isMain()) await shopsCol().doc(MAIN).set({ id: MAIN, name: A.settings().shopName, updatedAt: now, deleted: false }, { merge: true }).catch(() => {});
    try { await shopsCol().doc(id).set({ id, name, createdAt: now, updatedAt: now, deleted: false }); } catch (e) { throw new Error(friendly(e)); }
    const uid = me().uid;
    U.lsSet(LIST_KEY(uid), [...ws.cached(uid), { id, name, createdAt: now, owner: uid, role: 'owner' }]);
    return { id, owner: uid };
  };
  /* ชื่อร้าน (จากหน้าตั้งค่า) → อัปเดตในรายชื่อร้าน และในคำเชิญของสมาชิก */
  ws.saveName = async () => {
    if (ws.isShared()) return;
    const u = me();
    const id = ws.id(), name = A.settings().shopName;
    const ref = shopsCol().doc(id);
    await ref.set({ id, name, updatedAt: Date.now(), deleted: false }, { merge: true });
    U.lsSet(LIST_KEY(u.uid), ws.cached(u.uid).map((x) => (x.id === id && (x.owner || u.uid) === u.uid ? { ...x, name } : x)));
    const snap = await ref.get();
    const members = (snap.exists && snap.data().members) || {};
    await Promise.all(Object.keys(members).map((email) => invitesCol(email).doc(`${u.uid}_${id}`).set({ name }, { merge: true }).catch(() => {})));
  };
  /* ซ่อนร้านออกจากรายการ (ข้อมูลบนคลาวด์ยังอยู่) + ลบสำเนาในเครื่องนี้ */
  ws.hide = async (shop) => {
    const u = me();
    if (shop.owner && shop.owner !== u.uid) throw new Error('ร้านที่ได้รับเชิญ ให้เจ้าของร้านเป็นคนนำคุณออก');
    if (shop.id === MAIN || (shop.id === ws.id() && !ws.isShared())) throw new Error('ลบร้านแรก หรือร้านที่เปิดอยู่ไม่ได้');
    try { await shopsCol().doc(shop.id).set({ deleted: true, updatedAt: Date.now() }, { merge: true }); } catch (e) { throw new Error(friendly(e)); }
    U.lsSet(LIST_KEY(u.uid), ws.cached(u.uid).filter((x) => keyOf(x) !== keyOf({ ...shop, owner: u.uid })));
    try { indexedDB.deleteDatabase(`bunny-ledger.${shop.id}`); } catch (e) { /* ignore */ }
  };
  /* ล้างสำเนาข้อมูลของทุกร้าน (ยกเว้นร้านที่เปิดอยู่ ซึ่งล้างด้วย A.db.wipeLocal) — ใช้ตอน "ออกจากระบบ + ล้างข้อมูล" */
  ws.wipeOtherLocal = async () => {
    const names = new Set(['bunny-ledger', ...U.lsGet('bunny.dbs', [])]);
    try { if (indexedDB.databases) (await indexedDB.databases()).forEach((d) => { if (d.name && d.name.startsWith('bunny-ledger')) names.add(d.name); }); } catch (e) { /* ignore */ }
    Object.keys(localStorage).filter((k) => k.startsWith('bunny.shop.list.')).forEach((k) => {
      const uid = k.slice('bunny.shop.list.'.length);
      U.lsGet(k, []).forEach((x) => names.add(x.owner && x.owner !== uid ? `bunny-ledger.${x.owner}.${x.id}` : x.id === MAIN ? 'bunny-ledger' : `bunny-ledger.${x.id}`));
    });
    names.delete(A.db.name ? A.db.name() : ws.dbName());
    localStorage.removeItem(MAIN_OWNER);
    localStorage.removeItem('bunny.dbs');
    names.forEach((n) => { try { indexedDB.deleteDatabase(n); } catch (e) { /* ignore */ } });
    Object.keys(localStorage).filter((k) => k.startsWith('bunny.shop.list.')).forEach((k) => localStorage.removeItem(k));
  };

  // ---- ทีมงาน (เฉพาะเจ้าของร้าน) ----
  const cleanEmail = (e) => String(e || '').trim().toLowerCase();
  ws.members = async () => {
    const snap = await shopsCol().doc(ws.id()).get().catch((e) => { throw new Error(friendly(e)); });
    const m = (snap.exists && snap.data().members) || {};
    return Object.entries(m).map(([email, role]) => ({ email, role })).sort((a, b) => a.email.localeCompare(b.email));
  };
  ws.setMember = async (email, role) => {
    if (!ws.can('team')) throw new Error('เฉพาะเจ้าของร้านที่จัดการทีมได้');
    email = cleanEmail(email);
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
    const u = me();
    if (email === cleanEmail(u.email)) throw new Error('นี่คืออีเมลของคุณเอง (เจ้าของร้าน)');
    if (!ROLE_DESC[role]) throw new Error('เลือกสิทธิ์ก่อน');
    const id = ws.id(), name = A.settings().shopName;
    const ref = shopsCol().doc(id);
    try {
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : { id, name, createdAt: Date.now(), deleted: false };
      await ref.set({ ...data, id, name, updatedAt: Date.now(), members: { ...(data.members || {}), [email]: role } });
      await invitesCol(email).doc(`${u.uid}_${id}`).set({ ownerUid: u.uid, ownerEmail: u.email || '', shopId: id, name, role, createdAt: Date.now() });
    } catch (e) { throw new Error(friendly(e)); }
  };
  ws.removeMember = async (email) => {
    if (!ws.can('team')) throw new Error('เฉพาะเจ้าของร้านที่จัดการทีมได้');
    email = cleanEmail(email);
    const u = me(), id = ws.id();
    const ref = shopsCol().doc(id);
    try {
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data();
        const members = { ...(data.members || {}) };
        delete members[email];
        await ref.set({ ...data, members, updatedAt: Date.now() });
      }
      await invitesCol(email).doc(`${u.uid}_${id}`).delete();
    } catch (e) { throw new Error(friendly(e)); }
  };

  /* การ์ด "ทีมงาน" ในหน้าตั้งค่า */
  A.teamCard = (box) => {
    const draw = async () => {
      if (!box.isConnected) return;
      const head = `<div class="card-head"><h3>${A.icon('user')} ทีมงานของร้านนี้</h3><span class="badge b-blue">${U.esc(ws.roleLabel())}</span></div>`;
      if (!A.sync.user()) { box.innerHTML = `${head}<p class="muted">เข้าสู่ระบบก่อน แล้วเชิญพนักงานหรือผู้จัดการมาใช้ข้อมูลร้านเดียวกันได้</p>`; return; }
      if (ws.isShared()) {
        box.innerHTML = `${head}<p>คุณใช้ร้านนี้ในฐานะ <b>${U.esc(ws.roleLabel())}</b> — เจ้าของร้าน: <b>${U.esc(ws.active().ownerEmail || '-')}</b></p>
          <p class="small muted">${U.esc(ROLE_DESC[ws.role()] || '')}</p>`;
        return;
      }
      box.innerHTML = `${head}<p class="muted">กำลังโหลด…</p>`;
      let members = [], err = '';
      try { members = await ws.members(); } catch (e) { err = e.message; }
      if (!box.isConnected) return;
      const roleSel = (cur, attr) => `<select class="input" ${attr}>${Object.keys(ROLE_DESC).map((r) => `<option value="${r}" ${cur === r ? 'selected' : ''}>${ROLES[r]}</option>`).join('')}</select>`;
      box.innerHTML = `${head}
        <p class="small muted" style="margin-top:0">เชิญคนอื่นมาใช้ข้อมูลร้าน <b>${U.esc(A.settings().shopName)}</b> ด้วยอีเมล — เขาเข้าสู่ระบบแล้วเลือกร้านนี้จากหน้าต่างเลือกร้าน</p>
        ${err ? `<div class="notice warn">${A.icon('alert')}<div>${U.esc(err)}</div></div>` : ''}
        <div class="shop-list">${members.length ? members.map((m) => `<div class="shop-item">
            <span class="shop-ic">${A.icon('user')}</span>
            <div class="shop-main"><b>${U.esc(m.email)}</b><small>${U.esc(ROLE_DESC[m.role] || '')}</small></div>
            ${roleSel(m.role, `data-role="${U.esc(m.email)}" style="width:auto"`)}
            <button class="icon-btn" data-remove="${U.esc(m.email)}" title="นำออกจากร้าน">${A.icon('trash')}</button>
          </div>`).join('') : '<p class="small muted">ยังไม่มีสมาชิก — ตอนนี้มีแค่คุณ (เจ้าของร้าน)</p>'}</div>
        <div class="shop-new">
          <div class="field" style="flex:2;min-width:180px"><label>อีเมลที่จะเชิญ</label><input class="input" type="email" id="team-email" placeholder="staff@example.com" autocomplete="off"></div>
          <div class="field" style="flex:1;min-width:120px"><label>สิทธิ์</label>${roleSel('staff', 'id="team-role"')}</div>
          <button class="btn blue" id="team-add">${A.icon('plus')} เชิญ</button>
        </div>
        <p class="small muted mt-s">${A.icon('info')} ให้เขาสมัครบัญชีในแอปด้วยอีเมลที่เชิญ แล้วกดลิงก์ยืนยันในอีเมล — ร้านนี้จะขึ้นในหน้าต่างเลือกร้านของเขา</p>`;
      const add = box.querySelector('#team-add');
      add.onclick = async () => {
        add.disabled = true;
        try { await ws.setMember(box.querySelector('#team-email').value, box.querySelector('#team-role').value); A.ui.toast('เชิญแล้ว — ให้เขาเข้าสู่ระบบแล้วเลือกร้านนี้', 'ok'); draw(); }
        catch (e) { A.ui.toast(e.message, 'err'); add.disabled = false; }
      };
      box.querySelectorAll('[data-role]').forEach((s) => {
        s.onchange = async () => { try { await ws.setMember(s.dataset.role, s.value); A.ui.toast('เปลี่ยนสิทธิ์แล้ว', 'ok'); } catch (e) { A.ui.toast(e.message, 'err'); } draw(); };
      });
      box.querySelectorAll('[data-remove]').forEach((b) => {
        b.onclick = async () => {
          if (!(await A.ui.confirm(`นำ ${b.dataset.remove} ออกจากร้าน?`, 'เขาจะเปิดข้อมูลร้านนี้ไม่ได้อีก (ข้อมูลร้านไม่ถูกลบ)', 'นำออก', true))) return;
          try { await ws.removeMember(b.dataset.remove); A.ui.toast('นำออกจากร้านแล้ว'); } catch (e) { A.ui.toast(e.message, 'err'); }
          draw();
        };
      });
    };
    draw();
  };

  // ---- หน้าต่างเลือกร้าน ----
  let open = null;
  ws.openPicker = ({ afterLogin = false } = {}) => {
    if (open) return;
    if (!A.sync.user()) { A.ui.toast('เข้าสู่ระบบก่อน แล้วจะเลือก/สร้างร้านได้'); return; }
    const m = A.ui.modal({
      title: afterLogin ? 'เลือกร้านที่จะเปิด' : 'ร้านของฉัน',
      body: `<p class="muted small" style="margin-top:0">ร้านของบัญชี <b>${U.esc(A.sync.user().email || '')}</b> และร้านที่ได้รับเชิญ — ข้อมูลแต่ละร้านแยกกัน</p>
        <div id="shop-list"><p class="muted">กำลังโหลดรายชื่อร้าน…</p></div>
        <div class="shop-new">
          <div class="field" style="flex:1"><label>สร้างร้านใหม่ (คุณเป็นเจ้าของ)</label><input class="input" id="shop-name" maxlength="60" placeholder="ชื่อร้าน เช่น ร้านที่ 2"></div>
          <button class="btn blue" id="shop-create">${A.icon('plus')} สร้างร้าน</button>
        </div>`,
      actions: [{ label: afterLogin ? `ใช้ร้านที่เปิดอยู่ (${U.esc(A.settings().shopName)})` : 'ปิด', cls: 'ghost' }],
    });
    open = m;
    const obs = new MutationObserver(() => { if (!document.body.contains(m.root)) { obs.disconnect(); open = null; } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
    const box = m.root.querySelector('#shop-list');
    const a = ws.active();
    const uid = A.sync.user().uid;
    const isCur = (s) => s.id === a.id && (s.owner || uid) === (a.owner || uid);
    const item = (s) => `<div class="shop-item ${isCur(s) ? 'current' : ''}">
        <span class="shop-ic">${A.icon(s.shared ? 'user' : 'store')}</span>
        <div class="shop-main"><b>${U.esc(isCur(s) ? A.settings().shopName : s.name)}</b><small>${s.shared
          ? `${U.esc(ws.roleLabel(s.role))} • เจ้าของ ${U.esc(s.ownerEmail || '')}`
          : `${s.id === MAIN ? 'ร้านแรก' : `สร้างเมื่อ ${U.thDate(U.ymd(new Date(s.createdAt || Date.now())))}`}${Object.keys(s.members || {}).length ? ` • ทีม ${Object.keys(s.members).length} คน` : ''}`}</small></div>
        ${isCur(s) ? '<span class="badge b-green">เปิดอยู่</span>' : `<button class="btn sm" data-open="${U.esc(keyOf(s))}">เปิดร้านนี้</button>`}
        ${!s.shared && s.id !== MAIN && !isCur(s) ? `<button class="icon-btn" data-hide="${U.esc(keyOf(s))}" title="ลบออกจากรายการ">${A.icon('trash')}</button>` : ''}
      </div>`;
    const draw = (list, err) => {
      if (!box.isConnected) return;
      const own = list.filter((s) => !s.shared), shared = list.filter((s) => s.shared);
      box.innerHTML = `${err ? `<div class="notice warn">${A.icon('alert')}<div>${U.esc(err)}</div></div>` : ''}
        ${ws.unverified ? `<div class="notice">${A.icon('info')}<div><b>ยืนยันอีเมลก่อน เพื่อเปิดร้านที่ได้รับเชิญ</b> — เปิดอีเมล ${U.esc(A.sync.user().email)} แล้วกดลิงก์ยืนยันจาก Firebase (ดูในจดหมายขยะด้วย) ร้านของคุณเองใช้ได้ตามปกติ<div class="row mt-s"><button class="btn sm" id="v-done">${A.icon('refresh')} ยืนยันแล้ว — โหลดใหม่</button><button class="btn ghost sm" id="v-send">${A.icon('upload')} ส่งอีเมลยืนยันอีกครั้ง</button></div></div></div>` : ''}
        <div class="small muted" style="margin:10px 0 4px">ร้านของฉัน</div>
        <div class="shop-list" style="margin-top:0">${own.map(item).join('') || '<p class="muted">ยังไม่มีร้าน</p>'}</div>
        ${shared.length ? `<div class="small muted" style="margin:10px 0 4px">ร้านที่ได้รับเชิญ</div><div class="shop-list" style="margin-top:0">${shared.map(item).join('')}</div>` : ''}`;
      const vd = box.querySelector('#v-done'), vs = box.querySelector('#v-send');
      if (vd) vd.onclick = async () => { vd.disabled = true; try { const ok = await A.sync.refreshUser(); A.ui.toast(ok ? 'ยืนยันอีเมลแล้ว' : 'ยังไม่ได้ยืนยัน — กดลิงก์ในอีเมลก่อนนะ', ok ? 'ok' : 'err'); load(); } catch (e) { A.ui.toast(e.message, 'err'); vd.disabled = false; } };
      if (vs) vs.onclick = async () => { vs.disabled = true; try { await A.sync.sendVerify(); A.ui.toast('ส่งอีเมลยืนยันแล้ว', 'ok'); } catch (e) { A.ui.toast(e.message, 'err'); vs.disabled = false; } };
      const find = (k) => list.find((x) => keyOf(x) === k);
      box.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { m.close(); ws.switchTo(find(b.dataset.open)); }; });
      box.querySelectorAll('[data-hide]').forEach((b) => {
        b.onclick = async () => {
          const s = find(b.dataset.hide);
          if (!(await A.ui.confirm(`ลบ "${s.name}" ออกจากรายการ?`, 'ร้านนี้จะหายจากรายการร้านและจากเครื่องนี้ (ข้อมูลที่ซิงก์ขึ้นคลาวด์ไว้แล้วยังเก็บอยู่ ไม่ถูกลบ)', 'ลบออกจากรายการ', true))) return;
          try { await ws.hide(s); load(); A.ui.toast('ลบร้านออกจากรายการแล้ว'); } catch (e) { A.ui.toast(e.message, 'err'); }
        };
      });
    };
    const load = () => ws.fetchList().then((l) => draw(l)).catch((e) => draw(e.cached && e.cached.length ? e.cached : [{ id: MAIN, name: A.settings().shopName, owner: uid }], e.message));
    load();
    const nameIn = m.root.querySelector('#shop-name');
    const createBtn = m.root.querySelector('#shop-create');
    const create = async () => {
      createBtn.disabled = true;
      try {
        const s = await ws.create(nameIn.value);
        A.ui.toast('สร้างร้านแล้ว กำลังเปิดร้านใหม่…', 'ok');
        m.close();
        ws.switchTo(s);
      } catch (e) { A.ui.toast(e.message, 'err'); createBtn.disabled = false; }
    };
    createBtn.onclick = create;
    nameIn.onkeydown = (e) => { if (e.key === 'Enter') create(); };
  };

  // ตอนเปิดแอป: ลบฐานข้อมูลของร้านที่ถูกนำออกจากทีม (ที่ค้างไว้ตอนยังเปิดอยู่)
  const pendingDrop = U.lsGet('bunny.dropDbs', []);
  if (pendingDrop.length) {
    localStorage.removeItem('bunny.dropDbs');
    pendingDrop.filter((n) => n !== ws.dbName()).forEach((n) => { try { indexedDB.deleteDatabase(n); } catch (e) { /* ignore */ } });
  }

  A.workspace = ws;
})(window.App);
