/* หน้า: หน้าหลัก (ภาพรวมวันนี้) */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary, C = A.calc;

  A.pages.dashboard = {
    desc: '',
    render(el) {
      const st = A.settings();
      document.getElementById('page-desc').textContent = `สวัสดีค่ะ ${st.shopName} — มาดูยอดวันนี้กันเลย`;
      if (!A.db.count('orders') && !A.db.count('expenses')) {
        el.innerHTML = `<div class="card">${ui.empty('ยินดีต้อนรับสู่ Bunny Ledger!', 'เริ่มจากนำเข้าไฟล์ออเดอร์จาก Shopee / Lazada / TikTok หรือกดลองข้อมูลตัวอย่างเพื่อดูหน้าตาโปรแกรมก่อน',
          `<div class="row" style="justify-content:center"><a class="btn" href="#/import">${A.icon('import')} นำเข้าไฟล์</a><button class="btn blue" id="demo-btn">${A.icon('sparkle')} ลองข้อมูลตัวอย่าง</button></div>`)}</div>`;
        el.querySelector('#demo-btn').onclick = async () => { const n = await A.demo.load(); ui.toast(`เพิ่มข้อมูลตัวอย่าง ${n} ออเดอร์แล้ว`, 'ok'); A.rerender(); };
        return;
      }
      const t = U.today();
      const day = S.range(t, t);
      const yday = S.range(U.addDays(t, -1), U.addDays(t, -1));
      const week = S.range(U.weekStart(t), t);
      const lastWeek = S.range(U.addDays(U.weekStart(t), -7), U.addDays(t, -7));
      const month = S.range(U.monthStart(t), t);
      const rec = C.receivables();
      const overdue = rec.filter((r) => r.overdue);
      const trk = C.tracking();
      const lateShip = trk.pendingShip.filter((x) => x.late);
      const backupAt = U.lsGet('bunny.lastBackupAt', 0);
      const syncing = A.sync && A.sync.isOn();
      const fileOn = A.filestore && A.filestore.status().state !== 'off';
      const needBackup = !syncing && !fileOn && A.db.count('orders') > 0 && Date.now() - backupAt > 7 * 864e5;

      el.innerHTML = `
        ${A.demo.has() ? `<div class="notice pink">${A.icon('sparkle')}<div>ตอนนี้มี <b>ข้อมูลตัวอย่าง</b> อยู่ — ลบได้ที่หน้า <a href="#/settings">ตั้งค่า</a> เมื่อพร้อมใช้ข้อมูลจริง</div></div><div class="mt-s"></div>` : ''}
        ${needBackup ? `<div class="notice warn">${A.icon('alert')}<div>ข้อมูลยังเก็บอยู่ในแอปอย่างเดียว — <a href="#/backup">ตั้งให้บันทึกลงไฟล์บนคอมอัตโนมัติ</a> หรือดาวน์โหลดไฟล์สำรองเก็บไว้ กันข้อมูลหายนะ</div></div><div class="mt-s"></div>` : ''}
        <div class="kpis">
          ${ui.kpi({ label: 'ยอดขายวันนี้', value: U.money(day.sales), foot: `${U.num(day.orders)} ออเดอร์ • ${ui.delta(day.sales, yday.sales)} จากเมื่อวาน`, icon: 'heart', tone: 'pink', href: '#/history?gran=day' })}
          ${ui.kpi({ label: 'ยอดขายสัปดาห์นี้', value: U.money(week.sales), foot: `${U.num(week.orders)} ออเดอร์ • ${ui.delta(week.sales, lastWeek.sales)}`, icon: 'calendar', tone: 'blue', href: '#/history?gran=week' })}
          ${ui.kpi({ label: 'ยอดขายเดือนนี้', value: U.money(month.sales), foot: `${U.num(month.orders)} ออเดอร์`, icon: 'pie', tone: 'mint', href: '#/history?gran=month' })}
          ${ui.kpi({ label: 'กำไรเบื้องต้นเดือนนี้', value: U.money(month.profit), foot: `หักค่าธรรมเนียม ${U.money0(month.fees)} • รายจ่าย ${U.money0(month.expenses)}`, icon: 'sparkle', tone: 'butter', href: '#/reports' })}
          ${ui.kpi({ label: 'เงินรอเข้า (ลูกหนี้แพลตฟอร์ม)', value: U.money(U.sum(rec, (r) => r.amount)), foot: overdue.length ? `<span class="delta-down">เกินกำหนด ${overdue.length} ออเดอร์</span>` : `${rec.length} ออเดอร์ ยังไม่เกินกำหนด`, icon: 'moneybag', tone: 'blue', href: '#/receivables' })}
          ${ui.kpi({ label: 'พัสดุเกินกำหนดยังไม่ได้รับ', value: U.num(trk.notReceived.length) + ' ชิ้น', foot: `กำลังจัดส่ง ${trk.shipping.length} • ค้างส่ง ${lateShip.length}`, icon: 'truck', tone: trk.notReceived.length ? 'pink' : 'mint', href: '#/tracking?tab=notReceived' })}
          ${ui.kpi({ label: 'ออเดอร์รอจัดส่ง', value: U.num(trk.pendingShip.length), foot: lateShip.length ? `<span class="delta-down">เกิน ${st.shipLateDays} วัน ${lateShip.length} ออเดอร์</span>` : 'ไม่มีค้างนาน', icon: 'parcel', tone: 'butter', href: '#/tracking?tab=pendingShip' })}
          ${ui.kpi({ label: 'รายจ่ายเดือนนี้', value: U.money(month.expenses), foot: `เงินเข้าแล้วเดือนนี้ ${U.money0(month.received)}`, icon: 'receipt', tone: 'pink', href: '#/expenses' })}
        </div>

        <div class="grid g-1-2 mt">
          <div class="card">
            <div class="card-head"><h3>${A.icon('pie')} ยอดขายแยกแพลตฟอร์ม</h3><span class="sub">${U.thMonth(t)}</span></div>
            <div class="chart-box tall"><canvas id="c-pf"></canvas></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>${A.icon('calendar')} ยอดขาย 14 วันล่าสุด</h3><a class="small" href="#/history">ดูย้อนหลังทั้งหมด →</a></div>
            <div class="chart-box tall"><canvas id="c-14"></canvas></div>
          </div>
        </div>

        <div class="grid g3 mt">
          ${todoCard('ตามเงินที่ยังไม่เข้า', 'moneybag', 'blue', overdue.slice(0, 6).map((r) => ({ id: r.o.id, pf: r.o.platform, title: r.o.orderNo, sub: `เกินกำหนด ${r.overdueDays} วัน • ${U.money(r.amount)}` })), '#/receivables?tab=overdue', 'ไม่มีเงินค้างเกินกำหนด เยี่ยมมาก!')}
          ${todoCard('ตามพัสดุที่ลูกค้ายังไม่ได้รับ', 'truck', 'pink', trk.notReceived.slice(0, 6).map((x) => ({ id: x.o.id, pf: x.o.platform, title: x.o.orderNo, sub: `ส่งมาแล้ว ${x.age} วัน • ${x.o.trackingNo || 'ไม่มีเลขพัสดุ'}` })), '#/tracking?tab=notReceived', 'พัสดุทุกชิ้นยังอยู่ในเวลาปกติ')}
          ${todoCard('ออเดอร์ค้างส่ง', 'parcel', 'butter', lateShip.slice(0, 6).map((x) => ({ id: x.o.id, pf: x.o.platform, title: x.o.orderNo, sub: `สั่งมาแล้ว ${x.age} วัน • ${x.o.items || ''}` })), '#/tracking?tab=pendingShip', 'ไม่มีออเดอร์ค้างส่งนาน')}
        </div>`;

      el.querySelectorAll('.todo[data-id]').forEach((d) => { d.onclick = () => ui.orderModal(d.dataset.id); });

      const pies = S.pies(U.monthStart(t), t);
      A.charts.donut(el.querySelector('#c-pf'), pies.sales, { money: true, center: 'ยอดขายเดือนนี้', onClick: (k) => A.go(`history?gran=month&pf=${k}`) });
      const from14 = U.addDays(t, -13);
      const labels = S.periods('day', from14, t).map((p) => { const d = U.parseYmd(p.from); return `${d.getDate()} ${U.TH_MONTHS_S[d.getMonth()]}`; });
      const ds = A.PF_KEYS.map((k) => ({ label: A.PLATFORMS[k].name, color: A.PLATFORMS[k].color, data: S.bucket('day', from14, t, { platform: k }).map((b) => U.round2(b.sales)) }));
      A.charts.bars(el.querySelector('#c-14'), labels, ds, { stacked: true, onClick: (i) => A.go(`history?gran=day&d=${U.addDays(from14, i)}`) });
    },
  };

  function todoCard(title, icon, tone, items, href, emptyText) {
    return `<div class="card">
      <div class="card-head"><h3>${A.icon(icon)} ${title}</h3><a class="small" href="${href}">ทั้งหมด →</a></div>
      ${items.length ? `<div class="todo-list">${items.map((x) => `<div class="todo tone-${tone}" data-id="${U.esc(x.id)}">
        <span class="t-ic">${A.icon(icon)}</span>
        <div class="t-main"><b>${U.esc(x.title)}</b><small>${U.esc(x.sub)}</small></div>${ui.pf(x.pf)}</div>`).join('')}</div>`
        : `<div class="empty" style="padding:14px"><p>${A.icon('check')} ${emptyText}</p></div>`}
    </div>`;
  }
})(window.App);
