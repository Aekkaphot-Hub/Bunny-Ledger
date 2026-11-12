/* หน้า: เก็บข้อมูลลงไฟล์ / สำรอง / กู้คืน */
(function (A) {
  const U = A.U, ui = A.ui;

  A.pages.backup = {
    desc: 'บันทึกข้อมูลลงไฟล์บนคอมอัตโนมัติ และสำรอง/กู้คืนข้อมูล กันข้อมูลหาย',
    render(el) { draw(el); },
  };

  function draw(el) {
    const FS = A.filestore;
    const fst = FS.status();
    const last = U.lsGet('bunny.lastBackupAt', 0);
    const counts = `ออเดอร์ ${U.num(A.db.count('orders'))} • รายจ่าย ${U.num(A.db.count('expenses'))} • รายรับอื่น ${U.num(A.db.count('otherIncome'))} รายการ`;
    const stateBadge = {
      off: '<span class="badge b-grey">ยังไม่ได้ตั้งค่า</span>',
      ok: '<span class="badge b-green">บันทึกอัตโนมัติอยู่</span>',
      saving: '<span class="badge b-blue">กำลังบันทึก…</span>',
      needPermission: '<span class="badge b-butter">รอกดอนุญาต</span>',
      error: '<span class="badge b-red">มีปัญหา</span>',
    }[fst.state];

    el.innerHTML = `
      <div class="grid g2">
        <div class="card tone-pink">
          <div class="card-head"><h3>${A.icon('archive')} บันทึกลงไฟล์บนคอมอัตโนมัติ</h3>${FS.supported() ? stateBadge : ''}</div>
          ${!FS.supported() ? `<div class="notice warn">${A.icon('info')}<div>อุปกรณ์/เบราว์เซอร์นี้บันทึกลงไฟล์อัตโนมัติไม่ได้ (รองรับเฉพาะ Edge / Chrome บนคอมพิวเตอร์) — บนมือถือให้ใช้ <a href="#/sync">ซิงก์ Firebase</a> แทน หรือดาวน์โหลดไฟล์สำรองด้านขวา</div></div>`
          : fst.state === 'off' ? `
            <p>ทุกครั้งที่ข้อมูลเปลี่ยน แอปจะบันทึกลงไฟล์ <code>BunnyLedger-data.json</code> ในเครื่องให้เอง (แนะนำเก็บในโฟลเดอร์ Documents หรือโฟลเดอร์ที่ซิงก์กับ OneDrive / Google Drive)</p>
            <ul class="small muted" style="margin:0 0 12px;padding-left:18px">
              <li>ล้างประวัติเบราว์เซอร์ / ถอนแอป ข้อมูลก็ยังอยู่ในไฟล์</li>
              <li>ย้ายเครื่อง: ก๊อปไฟล์ไป แล้วกด "ใช้ไฟล์ข้อมูลที่มีอยู่"</li>
            </ul>
            <div class="row"><button class="btn" id="fs-new">${A.icon('archive')} สร้างไฟล์ข้อมูล</button><button class="btn ghost" id="fs-open">${A.icon('upload')} ใช้ไฟล์ข้อมูลที่มีอยู่</button></div>`
          : `
            <dl class="kv">
              <dt>ไฟล์</dt><dd><b>${U.esc(fst.name || '–')}</b></dd>
              <dt>บันทึกล่าสุด</dt><dd>${fst.at ? U.thDateTime(fst.at) : '–'}</dd>
              <dt>ข้อมูล</dt><dd>${counts}</dd>
              ${fst.msg ? `<dt>หมายเหตุ</dt><dd class="small">${U.esc(fst.msg)}</dd>` : ''}
            </dl>
            ${fst.state === 'needPermission' ? `<div class="notice warn mt-s">${A.icon('info')}<div>เพื่อความปลอดภัย เบราว์เซอร์ขอให้กดอนุญาตอีกครั้งหลังเปิดแอปใหม่</div></div>` : ''}
            <div class="row mt">
              ${fst.state === 'needPermission' ? `<button class="btn" id="fs-grant">${A.icon('check')} อนุญาตบันทึกลงไฟล์</button>` : `<button class="btn" id="fs-save">${A.icon('archive')} บันทึกตอนนี้</button>`}
              <button class="btn ghost sm" id="fs-open">${A.icon('upload')} เปลี่ยนไปใช้ไฟล์อื่น</button>
              <button class="btn ghost sm" id="fs-stop">${A.icon('x')} หยุดบันทึกลงไฟล์</button>
            </div>`}
        </div>
        <div>
          <div class="card tone-blue">
            <div class="card-head"><h3>${A.icon('download')} ดาวน์โหลดไฟล์สำรอง</h3></div>
            <p class="small muted">${counts}<br>สำรองล่าสุด: ${last ? U.thDateTime(last) : 'ยังไม่เคย'}</p>
            <button class="btn blue" id="bk">${A.icon('download')} ดาวน์โหลดไฟล์สำรอง (.json)</button>
          </div>
          <div class="card tone-blue">
            <div class="card-head"><h3>${A.icon('upload')} กู้คืนจากไฟล์</h3></div>
            <p class="muted small">รวมข้อมูลจากไฟล์สำรองเข้ากับข้อมูลปัจจุบัน — รายการเดียวกันจะใช้ฉบับที่แก้ไขล่าสุด (ไม่ลบของที่มีอยู่)</p>
            <label class="btn ghost">${A.icon('upload')} เลือกไฟล์สำรอง<input type="file" id="rs" accept=".json" hidden></label>
          </div>
        </div>
      </div>
      <div class="notice mt">${A.icon('info')}<div><b>ข้อมูลเก็บไว้ 3 ชั้น:</b> ① ในแอป (ใช้งานได้ทันที แม้ไม่มีเน็ต) ② ไฟล์บนคอม (บันทึกอัตโนมัติ) ③ <a href="#/sync">Firebase</a> (ใช้ข้อมูลชุดเดียวกันได้ทั้งคอมและมือถือ)</div></div>`;

    const $ = (q) => el.querySelector(q);
    const run = (fn, ok) => async () => {
      try { const r = await fn(); if (ok) ui.toast(typeof ok === 'function' ? ok(r) : ok, 'ok'); }
      catch (e) { if (e && e.name !== 'AbortError') ui.toast(e.message || String(e), 'err'); }
      draw(el);
    };
    if ($('#fs-new')) $('#fs-new').onclick = run(FS.createNew, (n) => `ตั้งค่าบันทึกลงไฟล์แล้ว${n ? ` (รวมข้อมูลจากไฟล์ ${U.num(n)} รายการ)` : ''}`);
    if ($('#fs-open')) $('#fs-open').onclick = run(FS.openExisting, (n) => `ใช้ไฟล์นี้แล้ว — รวมข้อมูลเข้ามา ${U.num(n || 0)} รายการ`);
    if ($('#fs-grant')) $('#fs-grant').onclick = run(FS.grant, 'บันทึกลงไฟล์ต่อแล้ว');
    if ($('#fs-save')) $('#fs-save').onclick = run(FS.saveNow, 'บันทึกลงไฟล์แล้ว');
    if ($('#fs-stop')) $('#fs-stop').onclick = async () => {
      if (await ui.confirm('หยุดบันทึกลงไฟล์?', 'ไฟล์เดิมยังอยู่ในเครื่อง แต่จะไม่ถูกอัปเดตอีก', 'หยุด', true)) { await FS.forget(); draw(el); }
    };
    $('#bk').onclick = () => {
      U.download(new Blob([JSON.stringify(A.db.exportAll())], { type: 'application/json' }), `BunnyLedger-backup-${U.today()}.json`);
      U.lsSet('bunny.lastBackupAt', Date.now());
      ui.toast('ดาวน์โหลดไฟล์สำรองแล้ว', 'ok');
      draw(el);
    };
    $('#rs').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const n = await A.db.importAll(JSON.parse(await f.text()));
        ui.toast(`กู้คืนแล้ว ${U.num(n)} รายการ`, 'ok');
        A.rerender();
      } catch (err) { ui.toast('กู้คืนไม่ได้: ' + err.message, 'err'); }
    };
  }
})(window.App);
