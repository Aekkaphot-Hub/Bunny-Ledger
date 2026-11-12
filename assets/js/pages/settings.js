/* หน้า: ตั้งค่า */
(function (A) {
  const U = A.U, ui = A.ui;

  A.pages.settings = {
    desc: 'ปรับชื่อร้าน รอบเงินเข้า การแจ้งเตือน และจัดการข้อมูล',
    render(el) {
      const st = A.settings();
      const pfRow = (label, key, suffix, mult = 1, step = 1) => `<div class="field"><label>${label}</label><div class="row" style="gap:6px;flex-wrap:nowrap">
        ${A.PF_KEYS.map((k) => `<div class="field" style="flex:1"><span class="small muted">${A.PLATFORMS[k].name}</span><input class="input" type="number" step="${step}" min="0" data-pf="${key}.${k}" value="${U.round2(st[key][k] * mult)}" style="width:100%"></div>`).join('')}
        <span class="small muted" style="align-self:flex-end;padding-bottom:10px">${suffix}</span></div></div>`;
      el.innerHTML = `
        <div class="grid g2">
          <div class="card">
            <div class="card-head"><h3>${A.icon('store')} ร้านของฉัน</h3></div>
            <div class="field"><label>ชื่อร้าน (แสดงบนเมนูและไฟล์ Excel)</label><input class="input" id="shopName" value="${U.esc(st.shopName)}"></div>
            <h3 class="mt" style="font-size:15px">${A.icon('clock')} การแจ้งเตือน</h3>
            <div class="mt-s">${pfRow('ควรได้เงินภายในกี่วันหลังลูกค้าได้รับของ', 'payoutDays', 'วัน')}</div>
            <div class="form-grid mt-s">
              <div class="field"><label>ส่งแล้วกี่วันควรถึงมือลูกค้า</label><input class="input" type="number" min="1" id="deliveryDays" value="${st.deliveryDays}"></div>
              <div class="field"><label>สั่งแล้วกี่วันควรจัดส่ง</label><input class="input" type="number" min="0" id="shipLateDays" value="${st.shipLateDays}"></div>
              <div class="field"><label>ยอดโอนต่างได้ไม่เกิน (บาท)</label><input class="input" type="number" min="0" step="0.01" id="payoutTolerance" value="${st.payoutTolerance}"></div>
              <div class="field"><label>เตือนเมื่อถูกหักเกิน (%)</label><input class="input" type="number" min="0" max="100" id="maxFeePct" value="${U.round2(st.maxFeePct * 100)}"></div>
            </div>
            <div class="mt-s">${pfRow('อัตราที่ถูกหักโดยประมาณ (ใช้เมื่อยังมีเงินเข้าจริงไม่ถึง 10 ออเดอร์)', 'feeRate', '%', 100, 0.1)}</div>
            <p class="small muted">อัตราที่เรียนรู้จากเงินเข้าจริงตอนนี้: ${A.PF_KEYS.map((k) => { const l = A.calc.learnedRates()[k]; return `${A.PLATFORMS[k].name} ${l ? `<b>${U.pct(l.rate)}</b> (${l.n} ออเดอร์)` : '– ยังไม่พอ'}`; }).join(' • ')}</p>
            <div class="row mt"><span class="spacer"></span><button class="btn" id="save">${A.icon('check')} บันทึกการตั้งค่า</button></div>
          </div>
          <div>
            <div class="card">
              <div class="card-head"><h3>${A.icon('sparkle')} ข้อมูลตัวอย่าง</h3></div>
              <p class="muted">ใส่ข้อมูลสมมติ 60 วันย้อนหลังเพื่อทดลองใช้ทุกหน้า แล้วลบออกได้ทีหลังโดยไม่กระทบข้อมูลจริง</p>
              <div class="row"><button class="btn blue" id="demo-add" ${A.demo.has() ? 'disabled' : ''}>${A.icon('sparkle')} ใส่ข้อมูลตัวอย่าง</button>
              <button class="btn ghost" id="demo-del" ${A.demo.has() ? '' : 'disabled'}>${A.icon('trash')} ลบข้อมูลตัวอย่าง</button></div>
            </div>
            <div class="card">
              <div class="card-head"><h3>${A.icon('tag')} หมวดหมู่</h3></div>
              <div class="field"><label>หมวดรายจ่าย (คั่นด้วยเครื่องหมายจุลภาค ,)</label><textarea class="input" rows="2" id="expCats" style="font-family:inherit">${U.esc(st.expenseCategories.join(', '))}</textarea></div>
              <div class="field mt-s"><label>หมวดรายรับอื่นๆ</label><textarea class="input" rows="2" id="incCats" style="font-family:inherit">${U.esc(st.incomeCategories.join(', '))}</textarea></div>
              <div class="row mt-s"><span class="spacer"></span><button class="btn ghost sm" id="save-cats">บันทึกหมวดหมู่</button></div>
            </div>
            <div class="card">
              <div class="card-head"><h3>${A.icon('alert')} ล้างข้อมูลในเครื่องนี้</h3></div>
              <p class="muted small">ลบข้อมูลทั้งหมดใน <b>แอปบนเครื่องนี้</b> — ไฟล์ข้อมูลบนคอมและข้อมูลบน Firebase ไม่ถูกลบ (ถ้าเปิดซิงก์ไว้จะดึงกลับมาใหม่) ควรสำรองเป็นไฟล์ก่อน</p>
              <button class="btn danger" id="wipe">${A.icon('trash')} ล้างข้อมูลในเครื่อง</button>
            </div>
          </div>
        </div>`;
      el.querySelector('#save').onclick = async () => {
        const num = (id) => parseFloat(el.querySelector('#' + id).value);
        const patch = {
          shopName: el.querySelector('#shopName').value.trim() || 'ร้านของฉัน',
          deliveryDays: num('deliveryDays') || 5, shipLateDays: isNaN(num('shipLateDays')) ? 2 : num('shipLateDays'),
          payoutTolerance: num('payoutTolerance') || 0, maxFeePct: (num('maxFeePct') || 25) / 100,
          payoutDays: { ...st.payoutDays }, feeRate: { ...st.feeRate },
        };
        el.querySelectorAll('[data-pf]').forEach((i) => {
          const [key, k] = i.dataset.pf.split('.');
          const v = parseFloat(i.value);
          if (!isNaN(v)) patch[key][k] = key === 'feeRate' ? v / 100 : v;
        });
        await A.saveSettings(patch);
        ui.toast('บันทึกการตั้งค่าแล้ว', 'ok');
        A.rerender();
      };
      el.querySelector('#save-cats').onclick = async () => {
        const split = (id) => el.querySelector('#' + id).value.split(',').map((s) => s.trim()).filter(Boolean);
        await A.saveSettings({ expenseCategories: split('expCats'), incomeCategories: split('incCats') });
        ui.toast('บันทึกหมวดหมู่แล้ว', 'ok');
      };
      el.querySelector('#demo-add').onclick = async () => { const n = await A.demo.load(); ui.toast(`เพิ่มข้อมูลตัวอย่าง ${n} ออเดอร์แล้ว`, 'ok'); A.rerender(); };
      el.querySelector('#demo-del').onclick = async () => {
        if (!(await ui.confirm('ลบข้อมูลตัวอย่าง?', 'ลบเฉพาะข้อมูลสมมติ ข้อมูลจริงที่นำเข้าเองจะไม่ถูกลบ', 'ลบ', true))) return;
        const n = await A.demo.remove(); ui.toast(`ลบข้อมูลตัวอย่าง ${n} รายการแล้ว`, 'ok'); A.rerender();
      };
      el.querySelector('#wipe').onclick = async () => {
        if (!(await ui.confirm('ล้างข้อมูลทั้งหมดในเครื่องนี้?', 'ข้อมูลออเดอร์ รายจ่าย รายรับ และการตั้งค่าในเครื่องนี้จะหายทั้งหมด กู้คืนได้จากไฟล์สำรองหรือ Firebase เท่านั้น', 'ล้างข้อมูล', true))) return;
        if (A.sync) A.sync.resetCursor();
        if (A.filestore && A.filestore.isOn()) A.filestore.pause(true); // ไม่เขียนข้อมูลว่างทับไฟล์บนคอม
        await A.db.wipeLocal();
        ui.toast('ล้างข้อมูลในเครื่องแล้ว');
        A.go('dashboard');
      };
    },
  };
})(window.App);
