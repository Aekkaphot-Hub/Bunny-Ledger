/* เครื่องมือ: ปฏิทินภาษี & แจ้งเตือน
   - จด VAT (ภ.พ.01) ภายใน 30 วันหลังรายรับเกิน 1.8 ล้าน (ถ้ายังไม่ได้ตั้งค่าว่าจดแล้ว)
   - ภ.พ.30 ทุกเดือนหลังจด VAT: วันที่ 15 ของเดือนถัดไป (ยื่นออนไลน์ วันที่ 23)
   - ภ.ง.ด.94 ครึ่งปี: 30 ก.ย. (ออนไลน์มักขยายถึง 8 ต.ค.) • ภ.ง.ด.90 ทั้งปี: 31 มี.ค. ปีถัดไป (ออนไลน์มักขยายถึง 8 เม.ย.)
   ถ้าวันครบกำหนดตรงวันหยุด กรมสรรพากรเลื่อนเป็นวันทำการถัดไป — โปรแกรมเตือนตามวันที่ปกติเพื่อให้ยื่นทันแน่นอน
   สถานะ "ยื่นแล้ว" เก็บใน settings.tax.done { [id]: วันที่กดยื่นแล้ว } */
(function (A) {
  const U = A.U, ui = A.ui;
  const TC = {};
  TC.WARN_DAYS = 14;

  TC.events = () => {
    const st = A.settings(), vat = st.vat, done = st.tax.done || {};
    const today = U.today(), y0 = +today.slice(0, 4);
    const ef = vat.efiling;
    const out = [];
    const add = (e) => out.push({ ...e, done: done[e.id] || null });
    // จด VAT
    if (A.vat && !vat.registered) {
      const th = A.vat.threshold(String(y0));
      if (th.crossDate) add({ id: `vatreg-${y0}`, date: th.deadline, kind: 'vat', title: 'ยื่นจดทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.01)', desc: `รายรับเกิน ${U.money0(vat.threshold)} เมื่อ ${U.thDate(th.crossDate)} — ต้องจดภายใน 30 วัน`, href: '#/vat' });
    }
    // ภ.พ.30 รายเดือน (หลังจด VAT)
    if (vat.registered && A.vat) {
      const since = vat.since || `${y0}-01-01`;
      for (let y = +since.slice(0, 4); y <= y0; y++) {
        A.vat.monthly(String(y)).forEach((m) => {
          add({ id: `pp30-${m.from.slice(0, 7)}`, date: m.due, kind: 'vat', title: `ยื่น ภ.พ.30 เดือน${U.thMonth(m.from)}`, desc: `${ef ? 'ยื่นออนไลน์ภายในวันที่ 23' : 'ยื่นภายในวันที่ 15'} • VAT ที่ต้องชำระประมาณ ${U.money(Math.max(0, m.net))}`, amount: Math.max(0, m.net), href: '#/vat' });
        });
      }
      // เดือนปัจจุบัน (ยังไม่จบเดือน) อยู่ใน monthly แล้ว
    }
    // ภาษีเงินได้
    const it = A.incomeTax;
    // ปีที่ไม่มีข้อมูลในโปรแกรมเลย: ไม่แสดงกำหนดที่ผ่านไปแล้ว (มักยื่นไปก่อนเริ่มใช้โปรแกรม)
    const years = new Set(A.db.all('orders').map((o) => (A.summary.dayOf(o) || '').slice(0, 4)).filter(Boolean));
    for (const y of [y0 - 1, y0]) {
      if (!years.has(String(y)) && y < y0) continue;
      const est94 = it ? (() => { const f = it.figures(`${y}-01-01`, `${y}-06-30`); if (!f.income) return null; const r = it.compute(f, { half: true }); return r[r.best].tax; })() : null;
      add({ id: `pnd94-${y}`, date: `${y}-${ef ? '10-08' : '09-30'}`, kind: 'pit', title: `ยื่น ภ.ง.ด.94 ครึ่งปี ${y + 543}`, desc: `เงินได้ ม.ค.–มิ.ย. ${y + 543} • ภายใน 30 ก.ย.${ef ? ' (ออนไลน์มักขยายถึง 8 ต.ค.)' : ''}${est94 != null ? ` • ภาษีประมาณ ${U.money(est94)}` : ''}`, amount: est94, href: '#/incometax' });
      add({ id: `pnd90-${y}`, date: `${y + 1}-${ef ? '04-08' : '03-31'}`, kind: 'pit', title: `ยื่น ภ.ง.ด.90 ทั้งปี ${y + 543}`, desc: `เงินได้ทั้งปี ${y + 543} • ภายใน 31 มี.ค. ${y + 544}${ef ? ' (ออนไลน์มักขยายถึง 8 เม.ย.)' : ''}`, href: '#/incometax' });
    }
    out.forEach((e) => {
      e.days = U.diffDays(today, e.date);
      e.state = e.done ? 'done' : e.days < 0 ? 'overdue' : e.days <= TC.WARN_DAYS ? 'soon' : 'later';
    });
    // ไม่แสดงรายการเก่าที่ยื่นแล้วเกิน 60 วัน หรือเก่ากว่า 1 ปี
    return out.filter((e) => !(e.done && e.days < -60) && e.days > -366).sort((a, b) => a.date.localeCompare(b.date));
  };
  /* รายการที่ต้องเตือนบนหน้าหลัก: เลยกำหนด หรือใกล้ถึง (ภาษีเงินได้ที่ยังไม่มีข้อมูล ไม่เตือนเลยกำหนด) */
  TC.alerts = () => TC.events().filter((e) => e.state === 'soon' || (e.state === 'overdue' && (e.kind === 'vat' || e.amount)));
  TC.badge = () => { try { return TC.alerts().length; } catch (e) { return 0; } };
  TC.setDone = async (id, on) => {
    const tax = A.settings().tax;
    const done = { ...(tax.done || {}) };
    if (on) done[id] = U.today(); else delete done[id];
    await A.saveSettings({ tax: { ...tax, done } });
  };
  A.taxCal = TC;

  A.pages.taxcal = {
    desc: 'วันยื่นภาษีของร้าน — ภ.พ.30 รายเดือน ภ.ง.ด.94 / ภ.ง.ด.90 และจด VAT พร้อมเตือนล่วงหน้าบนหน้าหลัก',
    render(el) { draw(el); },
  };

  const badge = (e) => ({
    done: `<span class="badge b-green">ยื่นแล้ว ${U.thDate(e.done)}</span>`,
    overdue: `<span class="badge b-red">เลยกำหนด ${-e.days} วัน</span>`,
    soon: `<span class="badge b-butter">${e.days === 0 ? 'วันนี้' : `อีก ${e.days} วัน`}</span>`,
    later: `<span class="badge b-grey">อีก ${e.days} วัน</span>`,
  })[e.state];

  function draw(el) {
    const st = A.settings();
    const ev = TC.events();
    const next = ev.find((e) => !e.done && e.days >= 0);
    const over = ev.filter((e) => e.state === 'overdue');
    el.innerHTML = `
      <div class="kpis">
        ${ui.kpi({ label: 'กำหนดยื่นถัดไป', value: next ? U.thDate(next.date) : '–', foot: next ? `${U.esc(next.title)} • อีก ${next.days} วัน` : 'ไม่มี', icon: 'calendar', tone: 'blue' })}
        ${ui.kpi({ label: 'เลยกำหนด / ยังไม่กดยื่นแล้ว', value: U.num(over.length), foot: over.length ? 'ตรวจว่ายื่นแล้วหรือยัง แล้วกด "ยื่นแล้ว"' : 'ไม่มี', icon: 'alert', tone: over.length ? 'pink' : 'mint' })}
        ${ui.kpi({ label: 'สถานะ VAT', value: st.vat.registered ? 'จดแล้ว' : 'ยังไม่จด', foot: st.vat.registered ? `ตั้งแต่ ${U.thDate(st.vat.since)} • ${st.vat.efiling ? 'ยื่นออนไลน์ (วันที่ 23)' : 'ยื่นกระดาษ (วันที่ 15)'}` : 'ตั้งค่าได้ที่ คำนวณภาษี VAT', icon: 'percent', tone: 'butter', href: '#/vat' })}
      </div>
      <div class="card mt">
        <div class="card-head"><h3>${A.icon('calendar')} ปฏิทินภาษี</h3><span class="sub">เตือนบนหน้าหลักล่วงหน้า ${TC.WARN_DAYS} วัน</span></div>
        ${ui.table([
          { h: 'ครบกำหนด', v: (e) => `<b>${U.thDate(e.date)}</b>` },
          { h: 'รายการ', v: (e) => `<a href="${e.href}">${U.esc(e.title)}</a><div class="small muted">${U.esc(e.desc)}</div>` },
          { h: 'สถานะ', v: badge },
          { h: '', v: (e) => (e.done ? `<button class="btn ghost sm" data-undo="${e.id}">ยกเลิก</button>` : `<button class="btn mint sm" data-done="${e.id}">${A.icon('check')} ยื่นแล้ว</button>`) },
        ], ev, { rowCls: (e) => (e.state === 'overdue' ? 'sel' : ''), empty: 'ยังไม่มีกำหนดยื่นภาษี' })}
        <p class="small muted mt-s">ถ้าวันครบกำหนดตรงวันเสาร์-อาทิตย์หรือวันหยุดราชการ กรมสรรพากรเลื่อนให้เป็นวันทำการถัดไป • วันขยายเวลายื่นออนไลน์ประกาศเป็นรายปี ตรวจที่ rd.go.th อีกครั้ง • ยื่นออนไลน์ที่ efiling.rd.go.th</p>
      </div>`;
    el.querySelectorAll('[data-done]').forEach((b) => { b.onclick = async () => { await TC.setDone(b.dataset.done, true); ui.toast('บันทึกว่ายื่นแล้ว', 'ok'); draw(el); A.renderSidebar(); }; });
    el.querySelectorAll('[data-undo]').forEach((b) => { b.onclick = async () => { await TC.setDone(b.dataset.undo, false); draw(el); A.renderSidebar(); }; });
  }
})(window.App);
