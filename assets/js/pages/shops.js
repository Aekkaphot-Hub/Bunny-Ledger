/* หน้า: ร้านค้าของฉัน (การเชื่อมต่อแต่ละแพลตฟอร์ม + วิธีดาวน์โหลดไฟล์) */
(function (A) {
  const U = A.U, ui = A.ui;
  const GUIDE = {
    shopee: {
      orders: 'Seller Centre → คำสั่งซื้อของฉัน → เลือกช่วงวันที่ → ส่งออก (Export) → ดาวน์โหลด',
      income: 'Seller Centre → การเงิน → รายได้ของฉัน → รายงานรายได้ → เลือกช่วงวันที่ → ดาวน์โหลด',
    },
    lazada: {
      orders: 'Seller Center → Orders → Manage Orders → เลือกช่วงวันที่ → Export → ดาวน์โหลดจาก Export Center',
      income: 'Seller Center → Finance → Account Statements / Transaction Overview → Export',
    },
    tiktok: {
      orders: 'Seller Center → Orders → Manage orders → Export → ดาวน์โหลด (CSV/Excel)',
      income: 'Seller Center → Finance → Statements / Settlements → Export',
    },
  };

  A.pages.shops = {
    desc: 'ดูสถานะการเชื่อมต่อแต่ละแพลตฟอร์ม เพิ่มชื่อร้าน และวิธีดาวน์โหลดไฟล์',
    render(el) { draw(el); },
  };

  function draw(el) {
    const st = A.settings();
    const orders = A.db.all('orders');
    const imports = A.db.all('imports');
    el.innerHTML = `
      <div class="grid g3">
        ${A.PF_KEYS.map((k) => {
          const p = A.PLATFORMS[k];
          const os = orders.filter((o) => o.platform === k);
          const last = imports.filter((i) => i.platform === k).sort((a, b) => b.at - a.at)[0];
          const shops = st.shops.filter((s) => s.platform === k);
          return `<div class="pf-card" style="--pf:${p.color}">
            <div class="row"><span class="pf-logo">${p.letter}</span><div><h3>${p.name}</h3><span class="small muted">${U.num(os.length)} ออเดอร์ในระบบ</span></div></div>
            <div class="mt-s todo-list">
              <div class="todo tone-mint" style="cursor:default"><span class="t-ic">${A.icon('import')}</span><div class="t-main"><b>นำเข้าผ่านไฟล์</b><small>${last ? 'ล่าสุด ' + U.thDateTime(last.at) : 'ยังไม่เคยนำเข้า'}</small></div><span class="badge b-green">ใช้งานได้</span></div>
              <div class="todo tone-butter" style="cursor:default"><span class="t-ic">${A.icon('link')}</span><div class="t-main"><b>เชื่อม API อัตโนมัติ</b><small>ต้องสมัคร Developer กับ ${p.name}</small></div><span class="badge b-butter">เร็วๆ นี้</span></div>
            </div>
            <div class="mt">
              <div class="small muted" style="margin-bottom:6px">ร้านของฉันบน ${p.name}</div>
              ${shops.length ? shops.map((s) => `<span class="chip" style="margin:0 6px 6px 0">${U.esc(s.name)} <button data-del-shop="${U.esc(s.id)}" title="ลบ">${A.icon('x')}</button></span>`).join('') : '<p class="small muted">ยังไม่ได้เพิ่ม (ไม่บังคับ — ใช้เมื่อมีหลายร้านบนแพลตฟอร์มเดียว)</p>'}
              <div class="row mt-s"><input class="input" placeholder="ชื่อร้าน" data-shop-in="${k}" style="flex:1"><button class="btn ghost sm" data-add-shop="${k}">เพิ่ม</button></div>
            </div>
            <details class="mt"><summary class="small" style="cursor:pointer">วิธีดาวน์โหลดไฟล์จาก ${p.name}</summary>
              <ol class="steps mt-s"><li><div><b>ไฟล์คำสั่งซื้อ:</b> ${GUIDE[k].orders}</div></li><li><div><b>ไฟล์รายได้:</b> ${GUIDE[k].income}</div></li></ol>
              <p class="small muted">ชื่อเมนูอาจต่างไปตามเวอร์ชันของ Seller Center</p>
            </details>
          </div>`;
        }).join('')}
      </div>
      <div class="card mt">
        <div class="card-head"><h3>${A.icon('link')} เกี่ยวกับการเชื่อม API (เฟสถัดไป)</h3></div>
        <p>ตอนนี้โปรแกรมดึงข้อมูลจาก <b>ไฟล์ที่ดาวน์โหลดจาก Seller Center</b> ซึ่งใช้ได้ทันทีไม่ต้องขออนุมัติ
        ส่วนการดึงข้อมูลอัตโนมัติผ่าน API ต้อง (1) สมัครเป็น Developer ของแต่ละแพลตฟอร์มและรออนุมัติ (2) มีเซิร์ฟเวอร์ตัวกลางเก็บรหัสลับ เช่น Firebase Cloud Functions
        — โครงโปรแกรมเตรียมไว้แล้ว เมื่อพร้อมจะต่อเข้ากับระบบซิงก์ Firebase ได้เลย</p>
      </div>`;
    el.querySelectorAll('[data-add-shop]').forEach((b) => {
      b.onclick = async () => {
        const k = b.dataset.addShop;
        const inp = el.querySelector(`[data-shop-in="${k}"]`);
        const name = inp.value.trim();
        if (!name) return;
        await A.saveSettings({ shops: [...A.settings().shops, { id: U.uid(), platform: k, name }] });
        ui.toast('เพิ่มร้านแล้ว', 'ok'); draw(el);
      };
    });
    el.querySelectorAll('[data-del-shop]').forEach((b) => {
      b.onclick = async () => { await A.saveSettings({ shops: A.settings().shops.filter((s) => s.id !== b.dataset.delShop) }); draw(el); };
    });
  }
})(window.App);
