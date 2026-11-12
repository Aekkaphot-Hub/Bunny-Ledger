/* บันทึกข้อมูลลง "ไฟล์บนคอมพิวเตอร์" อัตโนมัติ (File System Access API — Edge / Chrome บนคอม)
   - ผู้ใช้เลือก/สร้างไฟล์ครั้งเดียว เช่น Documents\BunnyLedger-data.json
   - ทุกครั้งที่ข้อมูลเปลี่ยน แอปเขียนไฟล์ใหม่ภายใน ~1.5 วินาที
   - เปิดแอปครั้งต่อไป: อ่านไฟล์แล้วรวมข้อมูลที่ใหม่กว่าเข้าแอป (ย้ายเครื่องก็แค่ก๊อปไฟล์ไป)
   - เบราว์เซอร์จะถามสิทธิ์อีกครั้งหลังปิดแอป → แสดงปุ่ม "อนุญาตบันทึกลงไฟล์" ด้านบน */
(function (A) {
  const U = A.U;
  const KEY = 'fileHandle';
  let handle = null;
  let status = { state: 'off', at: 0, name: '', msg: '' };
  let writing = false, again = false, paused = false;

  const fs = {};
  fs.supported = () => typeof window.showSaveFilePicker === 'function';
  fs.status = () => status;
  fs.isOn = () => status.state === 'ok';

  function set(patch) { status = { ...status, ...patch }; drawPill(); }
  function drawPill() {
    const el = document.getElementById('file-pill');
    if (!el) return;
    const map = {
      off: null,
      ok: ['ok', `บันทึกลงไฟล์แล้ว ${status.at ? new Date(status.at).toTimeString().slice(0, 5) : ''}`],
      saving: ['busy', 'กำลังบันทึกลงไฟล์…'],
      needPermission: ['err', 'กดเพื่ออนุญาตบันทึกลงไฟล์'],
      error: ['err', 'บันทึกลงไฟล์ไม่สำเร็จ'],
    };
    const m = map[status.state];
    el.classList.toggle('hidden', !m);
    if (!m) return;
    el.className = `sync-pill ${m[0]}`;
    el.innerHTML = `<span class="dot"></span>${A.icon('archive')}<span>${m[1]}</span>`;
    el.title = status.name ? `ไฟล์: ${status.name}${status.msg ? ' • ' + status.msg : ''}` : status.msg;
  }

  async function perm(h, ask) {
    const opts = { mode: 'readwrite' };
    if ((await h.queryPermission(opts)) === 'granted') return true;
    if (!ask) return false;
    return (await h.requestPermission(opts)) === 'granted';
  }

  async function loadFromFile() {
    const file = await handle.getFile();
    if (!file.size) return 0;
    let json;
    try { json = JSON.parse(await file.text()); } catch (e) { throw new Error('ไฟล์ข้อมูลเสียหรือไม่ใช่ไฟล์ของ Bunny Ledger'); }
    return A.db.importAll(json);
  }

  fs.saveNow = async () => {
    if (!handle || paused) return;
    if (writing) { again = true; return; }
    writing = true;
    set({ state: 'saving' });
    try {
      // กันพลาด: ถ้าแอปว่างเปล่าแต่ไฟล์มีข้อมูลอยู่ จะไม่เขียนทับ
      if (A.db.totalCount() === 0) {
        const f = await handle.getFile();
        if (f.size > 300) { set({ state: 'ok', msg: 'ข้ามการบันทึก: ข้อมูลในแอปว่าง แต่ไฟล์ยังมีข้อมูล' }); return; }
      }
      const w = await handle.createWritable();
      await w.write(JSON.stringify(A.db.exportAll(), null, 1));
      await w.close();
      set({ state: 'ok', at: Date.now(), msg: '' });
      U.lsSet('bunny.lastBackupAt', Date.now());
    } catch (e) {
      console.error(e);
      set({ state: e && e.name === 'NotAllowedError' ? 'needPermission' : 'error', msg: e.message });
    } finally {
      writing = false;
      if (again) { again = false; setTimeout(fs.saveNow, 200); }
    }
  };
  const saveSoon = U.debounce(() => fs.saveNow(), 1500);

  async function use(h, { load }) {
    handle = h;
    await A.db.metaSet(KEY, h);
    set({ name: h.name });
    let n = 0;
    if (load) n = await loadFromFile();
    await fs.saveNow();
    return n;
  }

  /* สร้างไฟล์ใหม่ (แนะนำเก็บใน Documents) */
  fs.createNew = async () => {
    const h = await window.showSaveFilePicker({
      suggestedName: 'BunnyLedger-data.json', startIn: 'documents',
      types: [{ description: 'ข้อมูล Bunny Ledger', accept: { 'application/json': ['.json'] } }],
    });
    return use(h, { load: true }); // ถ้าเลือกไฟล์เดิมที่มีข้อมูล จะรวมเข้ามาก่อน ไม่ทับทิ้ง
  };
  /* ใช้ไฟล์ข้อมูลที่มีอยู่แล้ว (เช่น ก๊อปมาจากอีกเครื่อง) */
  fs.openExisting = async () => {
    const [h] = await window.showOpenFilePicker({
      startIn: 'documents', types: [{ description: 'ข้อมูล Bunny Ledger', accept: { 'application/json': ['.json'] } }],
    });
    if (!(await perm(h, true))) throw new Error('ไม่ได้รับอนุญาตให้แก้ไขไฟล์');
    return use(h, { load: true });
  };
  /* หลังเปิดแอปใหม่ เบราว์เซอร์ต้องการให้กดอนุญาตอีกครั้ง */
  fs.grant = async () => {
    if (!handle) return;
    if (!(await perm(handle, true))) { set({ state: 'needPermission' }); return; }
    const n = await loadFromFile();
    await fs.saveNow();
    if (n) { A.ui.toast(`รวมข้อมูลจากไฟล์ ${U.num(n)} รายการ`, 'ok'); A.rerender(); }
  };
  fs.forget = async () => {
    handle = null;
    await A.db.metaDel(KEY);
    set({ state: 'off', name: '', at: 0, msg: '' });
  };
  fs.pause = (v) => { paused = v; };

  fs.boot = async () => {
    const pill = document.getElementById('file-pill');
    if (pill) pill.onclick = (e) => { e.preventDefault(); if (status.state === 'needPermission') fs.grant().catch((err) => A.ui.toast(err.message, 'err')); else A.go('backup'); };
    A.db.on(() => { if (handle && status.state !== 'needPermission') saveSoon(); });
    if (!fs.supported()) return;
    let h = null;
    try { h = await A.db.metaGet(KEY); } catch (e) { /* ignore */ }
    if (handle) return; // ผู้ใช้เลือกไฟล์ไปแล้วระหว่างที่แอปกำลังเปิด
    if (!h) { set({ state: 'off' }); return; }
    handle = h;
    set({ name: h.name });
    try {
      if (await perm(h, false)) {
        const n = await loadFromFile();
        set({ state: 'ok', at: Date.now() });
        if (n) { A.ui.toast(`โหลดข้อมูลจากไฟล์ ${U.num(n)} รายการ`, 'ok'); A.rerender(); }
      } else set({ state: 'needPermission' });
    } catch (e) {
      console.error(e);
      set({ state: 'error', msg: e.message });
    }
  };

  A.filestore = fs;
})(window.App);
