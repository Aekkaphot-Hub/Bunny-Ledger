/* หน้า: รายงาน & ส่งออก Excel */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary;
  const state = { preset: 'thisMonth', from: null, to: null, pf: '', sheets: null };

  function presetRange(p) {
    const t = U.today();
    switch (p) {
      case 'today': return [t, t];
      case 'thisWeek': return [U.weekStart(t), t];
      case 'thisMonth': return [U.monthStart(t), t];
      case 'lastMonth': { const m = U.addMonths(t, -1); return [m, U.monthEnd(m)]; }
      case 'last3': return [U.addMonths(t, -2), t];
      case 'thisYear': return [t.slice(0, 4) + '-01-01', t];
      case 'all': {
        const ds = A.db.all('orders').map((o) => A.calc.saleDate(o) || o.orderDate).concat(A.db.all('expenses').map((e) => e.date)).filter(Boolean).sort();
        return [ds[0] || t, t];
      }
      default: return [state.from || t, state.to || t];
    }
  }
  const PRESETS = [['today', 'วันนี้'], ['thisWeek', 'สัปดาห์นี้'], ['thisMonth', 'เดือนนี้'], ['lastMonth', 'เดือนที่แล้ว'], ['last3', '3 เดือนล่าสุด'], ['thisYear', 'ปีนี้'], ['all', 'ทั้งหมด']];

  A.pages.reports = {
    desc: 'เลือกช่วงวันที่ (ยอดขายนับตามวันที่ส่งสินค้า) แล้วสรุปออกเป็นไฟล์ Excel พร้อมชีตรายวัน รายสัปดาห์ รายเดือน และกราฟวงกลม',
    render(el) { draw(el); },
  };

  function draw(el) {
    A.charts.reset();
    if (state.preset !== 'custom') [state.from, state.to] = presetRange(state.preset);
    if (!state.sheets) state.sheets = A.EXCEL_SHEETS.map((s) => s[0]);
    const f = { platform: state.pf || undefined };
    const tot = S.range(state.from, state.to, f);
    const months = S.bucket('month', state.from, state.to, f);
    el.innerHTML = `
      <div class="card">
        <div class="row">
          <div class="tabs">${PRESETS.map(([k, l]) => `<button class="tab ${state.preset === k ? 'active' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
        </div>
        <div class="row mt-s">
          <div class="field"><label>ตั้งแต่</label><input class="input" type="date" id="from" value="${state.from}"></div>
          <div class="field"><label>ถึง</label><input class="input" type="date" id="to" value="${state.to}"></div>
          <div class="field"><label>แพลตฟอร์ม</label>${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}</div>
        </div>
      </div>

      <div class="kpis mt">
        ${ui.kpi({ label: 'ยอดขาย', value: U.money(tot.sales), foot: `${U.num(tot.orders)} ออเดอร์`, icon: 'heart', tone: 'pink' })}
        ${ui.kpi({ label: 'ค่าธรรมเนียม', value: U.money(tot.fees), icon: 'tag', tone: 'butter' })}
        ${ui.kpi({ label: 'เงินเข้าจริง', value: U.money(tot.received), icon: 'wallet', tone: 'mint' })}
        ${ui.kpi({ label: 'รายจ่าย', value: U.money(tot.expenses), icon: 'receipt', tone: 'pink' })}
        ${ui.kpi({ label: 'กำไรเบื้องต้น', value: U.money(tot.profit), icon: 'sparkle', tone: 'blue' })}
      </div>

      <div class="grid g-2-1 mt">
        <div class="card">
          <div class="card-head"><h3>${A.icon('calendar')} สรุปรายเดือนในช่วงที่เลือก</h3></div>
          ${ui.table([
            { h: 'เดือน', v: (r) => U.thMonth(r.from) }, { h: 'ออเดอร์', cls: 'num', v: (r) => U.num(r.orders) }, { h: 'ยอดขาย', cls: 'num', v: (r) => U.money(r.sales) },
            { h: 'ค่าธรรมเนียม', cls: 'num', v: (r) => U.money(r.fees) }, { h: 'เงินเข้า', cls: 'num', v: (r) => U.money(r.received) }, { h: 'รายจ่าย', cls: 'num', v: (r) => U.money(r.expenses) },
            { h: 'กำไรเบื้องต้น', cls: 'num', v: (r) => `<b>${U.money(r.profit)}</b>` },
          ], months, { foot: [{ v: 'รวม' }, { cls: 'num', v: U.num(tot.orders) }, { cls: 'num', v: U.money(tot.sales) }, { cls: 'num', v: U.money(tot.fees) }, { cls: 'num', v: U.money(tot.received) }, { cls: 'num', v: U.money(tot.expenses) }, { cls: 'num', v: U.money(tot.profit) }] })}
        </div>
        <div class="card tone-pink">
          <div class="card-head"><h3>${A.icon('download')} ส่งออก Excel</h3></div>
          <p class="small muted">เลือกชีตที่ต้องการในไฟล์</p>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${A.EXCEL_SHEETS.map(([k, l]) => `<label class="check"><input type="checkbox" data-sheet="${k}" ${state.sheets.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}
          </div>
          <button class="btn mt" id="go" style="width:100%;justify-content:center">${A.icon('download')} ดาวน์โหลดไฟล์ Excel</button>
          <p class="small muted mt-s">${U.thDate(state.from)} – ${U.thDate(state.to)} • ${state.pf ? A.PLATFORMS[state.pf].name : 'ทุกแพลตฟอร์ม'}</p>
        </div>
      </div>`;
    el.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { state.preset = b.dataset.p; draw(el); }; });
    el.querySelector('#from').onchange = (e) => { state.preset = 'custom'; state.from = e.target.value; if (state.to < state.from) state.to = state.from; draw(el); };
    el.querySelector('#to').onchange = (e) => { state.preset = 'custom'; state.to = e.target.value; if (state.to < state.from) state.from = state.to; draw(el); };
    el.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; draw(el); };
    el.querySelectorAll('[data-sheet]').forEach((c) => { c.onchange = () => { state.sheets = [...el.querySelectorAll('[data-sheet]:checked')].map((x) => x.dataset.sheet); }; });
    el.querySelector('#go').onclick = async (e) => {
      if (!state.sheets.length) { ui.toast('เลือกอย่างน้อย 1 ชีตนะ', 'err'); return; }
      e.currentTarget.disabled = true;
      try { await A.exportExcel({ from: state.from, to: state.to, platform: state.pf, sheets: state.sheets }); }
      catch (err) { console.error(err); ui.toast('สร้างไฟล์ไม่สำเร็จ: ' + err.message, 'err'); }
      finally { const b = el.querySelector('#go'); if (b) b.disabled = false; }
    };
  }
})(window.App);
