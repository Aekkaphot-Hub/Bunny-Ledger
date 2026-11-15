/* หน้า: ย้อนหลัง & สรุปยอด (รายวัน / รายสัปดาห์ / รายเดือน + กราฟวงกลม) */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary;
  const state = { gran: 'day', anchor: null, pf: '', filter: null, list: 'orders' };

  A.pages.history = {
    desc: 'ยอดขายนับตามวันที่ส่งสินค้า — สรุปเป็นรายวัน รายสัปดาห์ รายเดือน พร้อมกราฟวงกลม',
    render(el, params) {
      if (params.get('gran')) state.gran = params.get('gran');
      if (params.get('d')) state.anchor = params.get('d');
      if (params.has('pf')) state.pf = params.get('pf') || '';
      if (params.toString()) { history.replaceState(null, '', '#/history'); }
      if (!state.anchor) state.anchor = U.today();
      draw(el);
    },
  };

  function draw(el) {
    A.charts.reset();
    const f = { platform: state.pf || undefined };
    const per = S.periodOf(state.gran, state.anchor);
    const prev = S.periodOf(state.gran, S.shift(state.gran, state.anchor, -1));
    const cur = S.range(per.from, per.to, f);
    const pv = S.range(prev.from, prev.to, f);
    const unit = { day: 'วัน', week: 'สัปดาห์', month: 'เดือน' }[state.gran];

    el.innerHTML = `
      <div class="card">
        <div class="row">
          <div class="tabs">${Object.entries(S.GRAN).map(([k, v]) => `<button class="tab ${state.gran === k ? 'active' : ''}" data-gran="${k}">${v}</button>`).join('')}</div>
          <span class="spacer"></span>
          ${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}
          <button class="btn ghost sm" id="to-today">วันนี้</button>
          <input type="date" class="input" id="pick" value="${state.anchor}">
        </div>
        <div class="row mt" style="justify-content:center;gap:16px">
          <button class="icon-btn" id="prev" title="ก่อนหน้า">${A.icon('chevL')}</button>
          <h2 style="font-size:20px;text-align:center">${state.gran === 'day' ? U.thDateLong(state.anchor) : per.label}</h2>
          <button class="icon-btn" id="next" title="ถัดไป">${A.icon('chevR')}</button>
        </div>
      </div>

      <div class="kpis mt">
        ${ui.kpi({ label: 'ยอดขาย', value: U.money(cur.sales), foot: `${U.num(cur.orders)} ออเดอร์ • ${ui.delta(cur.sales, pv.sales)} จาก${unit}ก่อน`, icon: 'heart', tone: 'pink' })}
        ${ui.kpi({ label: 'ค่าธรรมเนียมแพลตฟอร์ม', value: U.money(cur.fees), foot: cur.sales ? `${U.pct(cur.fees / cur.sales)} ของยอดขาย` : '', icon: 'tag', tone: 'butter' })}
        ${ui.kpi({ label: `เงินเข้า 1 • ของออเดอร์ที่ส่ง${unit}นี้`, value: U.money(cur.paid1), foot: `${U.num(cur.paid1Count)} ออเดอร์ • ไม่ว่าเงินจะเข้าวันไหน`, icon: 'wallet', tone: 'mint' })}
        ${ui.kpi({ label: `เงินเข้า 2 • ของออเดอร์ที่ส่ง${unit}อื่น`, value: U.money(cur.paid2), foot: `${U.num(cur.paid2Count)} ออเดอร์ที่เงินเข้า${unit}นี้ • เงินเข้าบัญชีรวม ${U.money0(cur.received)}`, icon: 'wallet', tone: 'blue' })}
        ${ui.kpi({ label: 'ยังรอเงินเข้า (ของยอดขายช่วงนี้)', value: U.money(cur.pending), icon: 'moneybag', tone: 'blue' })}
        ${ui.kpi({ label: 'รายจ่าย', value: U.money(cur.expenses), foot: ui.delta(cur.expenses, pv.expenses), icon: 'receipt', tone: 'pink' })}
        ${ui.kpi({ label: 'กำไรเบื้องต้น', value: U.money(cur.profit), foot: `${ui.delta(cur.profit, pv.profit)}${cur.otherIncome ? ` • รวมรายรับอื่น ${U.money0(cur.otherIncome)}` : ''}`, icon: 'sparkle', tone: 'mint' })}
      </div>

      <div class="card mt" id="trend-card"></div>

      <div class="card mt">
        <div class="card-head"><h3>${A.icon('pie')} กราฟวงกลม — ${per.label}</h3><span class="sub">คลิกชิ้นกราฟเพื่อกรองรายการด้านล่าง</span></div>
        <div class="pie-grid">
          ${pie('p-sales', 'ยอดขายแยกแพลตฟอร์ม')}
          ${pie('p-money', 'เงินเข้าแล้ว vs รอเข้า')}
          ${pie('p-fees', 'ค่าธรรมเนียมแยกแพลตฟอร์ม')}
          ${pie('p-exp', 'รายจ่ายแยกหมวด')}
          ${pie('p-status', 'สถานะออเดอร์')}
        </div>
      </div>

      <div class="card mt" id="detail-card"></div>`;

    el.querySelectorAll('[data-gran]').forEach((b) => { b.onclick = () => { state.gran = b.dataset.gran; state.filter = null; draw(el); }; });
    el.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; state.filter = null; draw(el); };
    el.querySelector('#pick').onchange = (e) => { if (e.target.value) { state.anchor = e.target.value; state.filter = null; draw(el); } };
    el.querySelector('#to-today').onclick = () => { state.anchor = U.today(); state.filter = null; draw(el); };
    el.querySelector('#prev').onclick = () => { state.anchor = S.shift(state.gran, state.anchor, -1); state.filter = null; draw(el); };
    el.querySelector('#next').onclick = () => { state.anchor = S.shift(state.gran, state.anchor, 1); state.filter = null; draw(el); };

    const pies = S.pies(per.from, per.to, f);
    const setF = (type) => (key) => { state.filter = { type, key }; state.list = type === 'expense' ? 'expenses' : 'orders'; drawDetail(el, per, f); el.querySelector('#detail-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    A.charts.donut(el.querySelector('#p-sales'), pies.sales, { money: true, center: 'ยอดขาย', onClick: setF('platform') });
    A.charts.donut(el.querySelector('#p-money'), pies.money, { money: true, center: 'ยอดที่ควรได้', onClick: setF('money') });
    A.charts.donut(el.querySelector('#p-fees'), pies.fees, { money: true, center: 'ค่าธรรมเนียม', onClick: setF('platform') });
    A.charts.donut(el.querySelector('#p-exp'), pies.expenses, { money: true, center: 'รายจ่าย', onClick: setF('expense') });
    A.charts.donut(el.querySelector('#p-status'), pies.status, { unit: ' ออเดอร์', center: 'ออเดอร์', onClick: setF('status') });

    if (state.gran === 'day') drawCalendar(el, f); else drawTrend(el, f);
    drawDetail(el, per, f);
  }

  const pie = (id, title) => `<div class="pie-card"><h4>${title}</h4><div class="chart-box"><canvas id="${id}"></canvas></div></div>`;

  /* ---- ปฏิทินรายเดือน (โหมดรายวัน) ---- */
  function drawCalendar(el, f) {
    const box = el.querySelector('#trend-card');
    const ms = U.monthStart(state.anchor), me = U.monthEnd(state.anchor);
    const gridFrom = U.weekStart(ms);
    const gridTo = U.addDays(U.weekStart(me), 6);
    const days = S.bucket('day', gridFrom, gridTo, f);
    const max = Math.max(1, ...days.map((d) => d.sales));
    const t = U.today();
    const mTotal = S.total(days.filter((d) => d.from >= ms && d.from <= me));
    box.innerHTML = `
      <div class="card-head">
        <h3>${A.icon('calendar')} ปฏิทินยอดขาย — ${U.thMonth(ms)}</h3>
        <span class="sub">ทั้งเดือน ${U.money(mTotal.sales)} • ${U.num(mTotal.orders)} ออเดอร์ • คลิกวันเพื่อดูรายละเอียด</span>
      </div>
      <div class="cal">
        ${['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${days.map((d) => {
          const a = d.sales / max;
          const bg = d.sales ? `background: rgba(246,181,203,${(0.12 + a * 0.6).toFixed(2)})` : '';
          return `<button class="cal-day ${d.from < ms || d.from > me ? 'out' : ''} ${d.from === state.anchor ? 'sel' : ''} ${d.from === t ? 'today' : ''}" data-d="${d.from}" style="${bg}">
            <span class="d">${U.parseYmd(d.from).getDate()}</span>
            ${d.expenses ? '<span class="dots"><i style="background:#9CCBF0" title="มีรายจ่าย"></i></span>' : ''}
            ${d.sales ? `<span class="amt">฿${U.short(d.sales)}</span><span class="cnt">${d.orders} ออเดอร์</span>` : ''}
          </button>`;
        }).join('')}
      </div>`;
    box.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { state.anchor = b.dataset.d; state.filter = null; draw(el); }; });
  }

  /* ---- ตารางแนวโน้ม 12 ช่วงล่าสุด (โหมดสัปดาห์/เดือน) ---- */
  function drawTrend(el, f) {
    const box = el.querySelector('#trend-card');
    const n = 12;
    const from = S.shift(state.gran, state.anchor, -(n - 1));
    const to = S.periodOf(state.gran, state.anchor).to;
    const rows = S.bucket(state.gran, S.periodOf(state.gran, from).from, to, f);
    const lab = (r) => (state.gran === 'month' ? U.thMonthShort(r.from) : `${U.thDate(r.from)}`);
    box.innerHTML = `
      <div class="card-head"><h3>${A.icon('calendar')} สรุป${S.GRAN[state.gran]} ${n} ${state.gran === 'week' ? 'สัปดาห์' : 'เดือน'}ล่าสุด</h3><span class="sub">คลิกแถว/แท่งกราฟเพื่อเลือกช่วงนั้น</span></div>
      <div class="chart-box"><canvas id="trend"></canvas></div>
      <div class="mt-s">${ui.table([
        { h: state.gran === 'week' ? 'สัปดาห์' : 'เดือน', v: (r) => state.gran === 'week' ? r.label : U.thMonth(r.from) },
        { h: 'ออเดอร์', cls: 'num', v: (r) => U.num(r.orders) },
        { h: 'ยอดขาย', cls: 'num', v: (r) => U.money(r.sales) },
        { h: 'ค่าธรรมเนียม', cls: 'num', v: (r) => U.money(r.fees) },
        { h: 'เงินเข้า 1', cls: 'num', v: (r) => U.money(r.paid1) },
        { h: 'เงินเข้า 2', cls: 'num', v: (r) => U.money(r.paid2) },
        { h: 'เงินเข้าบัญชีรวม', cls: 'num', v: (r) => U.money(r.received) },
        { h: 'รอเข้า', cls: 'num', v: (r) => U.money(r.pending) },
        { h: 'รายจ่าย', cls: 'num', v: (r) => U.money(r.expenses) },
        { h: 'กำไรเบื้องต้น', cls: 'num', v: (r) => `<b>${U.money(r.profit)}</b>` },
      ], rows.slice().reverse(), {
        rowCls: (r) => (state.anchor >= r.from && state.anchor <= r.to ? 'sel' : ''),
        onRow: true,
        foot: (() => { const t = S.total(rows); return [{ v: 'รวม' }, { cls: 'num', v: U.num(t.orders) }, { cls: 'num', v: U.money(t.sales) }, { cls: 'num', v: U.money(t.fees) }, { cls: 'num', v: U.money(t.paid1) }, { cls: 'num', v: U.money(t.paid2) }, { cls: 'num', v: U.money(t.received) }, { cls: 'num', v: U.money(t.pending) }, { cls: 'num', v: U.money(t.expenses) }, { cls: 'num', v: U.money(t.profit) }]; })(),
      })}</div>`;
    ui.bindRows(box, rows.slice().reverse(), (r) => { state.anchor = r.from; state.filter = null; draw(el); });
    A.charts.bars(box.querySelector('#trend'), rows.map(lab), [
      { label: 'ยอดขาย', color: '#F6B5CB', data: rows.map((r) => U.round2(r.sales)) },
      { label: 'เงินเข้าจริง', color: '#9CCBF0', data: rows.map((r) => U.round2(r.received)) },
      { label: 'กำไรเบื้องต้น', color: '#4FA88A', type: 'line', data: rows.map((r) => U.round2(r.profit)) },
    ], { onClick: (i) => { state.anchor = rows[i].from; state.filter = null; draw(el); } });
  }

  /* ---- รายการในช่วงที่เลือก ---- */
  // วันที่ส่งสินค้า (ไฟล์ที่ไม่มีวันส่ง เช่น Lazada ใช้วันที่ได้รับ/วันที่สั่งแทน แสดงจางพร้อม *)
  const dayCell = (o) => {
    const d = A.calc.saleDate(o);
    if (!d) return '<span class="muted small">ยังไม่ส่ง</span>';
    return A.calc.saleDateEstimated(o) ? `<span class="muted" title="ไฟล์ไม่มีวันที่ส่ง — ใช้วันที่ได้รับ/วันที่สั่งแทน">${U.thDate(d)}*</span>` : U.thDate(d);
  };
  // เงินเข้าทั้งหมดของออเดอร์ (ทุกรอบโอน) และวันที่เงินเข้า
  const paidAll = (o) => U.sum(A.calc.payoutParts(o), (p) => p.amount || 0);
  const payDays = (o, per) => {
    const ds = [...new Set(A.calc.payoutParts(o).map((p) => p.date).filter(Boolean))].filter((d) => !per || (d >= per.from && d <= per.to)).sort();
    if (!ds.length) return '<span class="muted small">–</span>';
    return ds.map((d) => U.thDate(d)).join(', ');
  };
  function drawDetail(el, per, f) {
    const box = el.querySelector('#detail-card');
    const it = S.items(per.from, per.to, f);
    const fl = state.filter;
    let orders = it.orders, payouts = it.payouts2, expenses = it.expenses;
    let chip = '';
    if (fl) {
      if (fl.type === 'platform') { orders = orders.filter((o) => o.platform === fl.key); payouts = payouts.filter((o) => o.platform === fl.key); chip = A.PLATFORMS[fl.key].name; }
      if (fl.type === 'status') { orders = orders.filter((o) => o.status === fl.key); chip = A.STATUS[fl.key].label; }
      if (fl.type === 'money') { orders = orders.filter((o) => !A.isVoid(o.status) && (fl.key === 'paid') === A.calc.isPaid(o)); chip = fl.key === 'paid' ? 'เงินเข้าแล้ว' : 'รอเงินเข้า'; }
      if (fl.type === 'expense') { expenses = expenses.filter((e) => (e.category || 'อื่นๆ') === fl.key); chip = 'หมวด ' + fl.key; }
    }
    const tabs = [
      ['orders', 'ออเดอร์ • เงินเข้า 1', orders.length], ['payouts', 'เงินเข้า 2', payouts.length], ['expenses', 'รายจ่าย', expenses.length], ['income', 'รายรับอื่น', it.otherIncome.length],
    ];
    let table = '';
    if (state.list === 'orders') {
      table = ui.table([
        { h: 'วันที่ส่ง', v: (o) => dayCell(o) }, { h: 'แพลตฟอร์ม', v: (o) => ui.pf(o.platform) }, { h: 'เลขคำสั่งซื้อ', v: (o) => U.esc(o.orderNo) },
        { h: 'สินค้า', cls: 'ell', v: (o) => U.esc(o.items || '–') }, { h: 'สถานะ', v: (o) => ui.status(o.status) },
        { h: 'ยอดขาย', cls: 'num', v: (o) => U.money(o.grossSales) },
        { h: 'วันที่เงินเข้า', v: (o) => payDays(o) },
        { h: 'เงินเข้า 1', cls: 'num', v: (o) => (A.calc.isPaid(o) ? U.money(paidAll(o)) : '<span class="badge b-pink">รอ</span>') },
      ], orders, { onRow: true, foot: [{ v: 'รวม' }, { v: '' }, { v: '' }, { v: '' }, { v: `${orders.length} ออเดอร์` }, { cls: 'num', v: U.money(U.sum(orders.filter((o) => !A.isVoid(o.status)), (o) => o.grossSales)) }, { v: '' }, { cls: 'num', v: U.money(U.sum(orders, paidAll)) }] });
    } else if (state.list === 'payouts') {
      table = ui.table([
        { h: 'วันที่เงินเข้า', v: (o) => payDays(o, per) }, { h: 'แพลตฟอร์ม', v: (o) => ui.pf(o.platform) }, { h: 'เลขคำสั่งซื้อ', v: (o) => U.esc(o.orderNo) },
        { h: 'วันที่ส่ง', v: (o) => dayCell(o) }, { h: 'ยอดขาย', cls: 'num', v: (o) => U.money(o.grossSales) }, { h: 'เงินเข้า 2', cls: 'num', v: (o) => `<b>${U.money(A.calc.paidIn(o, per.from, per.to))}</b>` },
      ], payouts, { onRow: true, foot: [{ v: 'รวม' }, { v: '' }, { v: `${payouts.length} ออเดอร์` }, { v: '' }, { cls: 'num', v: '' }, { cls: 'num', v: U.money(U.sum(payouts, (o) => A.calc.paidIn(o, per.from, per.to))) }] });
    } else if (state.list === 'expenses') {
      table = ui.table([
        { h: 'วันที่', v: (e) => U.thDate(e.date) }, { h: 'หมวด', v: (e) => `<span class="badge b-pink">${U.esc(e.category || 'อื่นๆ')}</span>` },
        { h: 'แพลตฟอร์ม', v: (e) => (e.platform ? ui.pf(e.platform) : '–') }, { h: 'รายละเอียด', v: (e) => U.esc(e.note || '') }, { h: 'จำนวนเงิน', cls: 'num', v: (e) => U.money(e.amount) },
      ], expenses, { foot: [{ v: 'รวม' }, { v: '' }, { v: '' }, { v: '' }, { cls: 'num', v: U.money(U.sum(expenses, (e) => e.amount)) }] });
    } else {
      table = ui.table([
        { h: 'วันที่', v: (e) => U.thDate(e.date) }, { h: 'หมวด', v: (e) => U.esc(e.category || '') }, { h: 'รายละเอียด', v: (e) => U.esc(e.note || '') }, { h: 'จำนวนเงิน', cls: 'num', v: (e) => U.money(e.amount) },
      ], it.otherIncome, { foot: [{ v: 'รวม' }, { v: '' }, { v: '' }, { cls: 'num', v: U.money(U.sum(it.otherIncome, (e) => e.amount)) }] });
    }
    // ออเดอร์ที่มีแค่ไฟล์รายได้ (ไม่มีไฟล์คำสั่งซื้อ) → ไม่รู้วันที่ส่ง โปรแกรมใช้วันที่สั่งแทน
    const noShip = it.orders.filter((o) => !o.shipDate && o.statusRaw == null);
    const pfNames = [...new Set(noShip.map((o) => A.PLATFORMS[o.platform].name))].join(', ');
    const warn = noShip.length ? `<div class="notice warn" style="margin-bottom:12px">${A.icon('alert')}<div><b>${U.num(noShip.length)} ออเดอร์ในช่วงนี้ยังไม่มีวันที่ส่ง</b> (${U.esc(pfNames)} — มีแค่ไฟล์รายได้ โปรแกรมจึงใช้วันที่สั่งแทน แสดงด้วย *) ยอดจึงอาจไม่ตรงกับที่นับตามวันส่ง
      — นำเข้า<b>ไฟล์คำสั่งซื้อ</b>ที่ครอบคลุมช่วงนี้ (เช่น TikTok "ทั้งหมด คำสั่งซื้อ" เลือกช่วงวันที่สร้างคำสั่งซื้อย้อนไปก่อนหน้า 7 วัน) แล้วออเดอร์จะย้ายไปอยู่วันที่ส่งจริงเอง</div></div>` : '';
    box.innerHTML = `
      ${warn}
      <div class="card-head">
        <h3>${A.icon('file')} รายการ — ${per.label}</h3>
        <div class="row">
          ${chip ? `<span class="chip">กรอง: ${U.esc(chip)} <button id="clear-f" title="ล้างตัวกรอง">${A.icon('x')}</button></span>` : ''}
          <button class="btn ghost sm" id="xl">${A.icon('download')} ส่งออกช่วงนี้เป็น Excel</button>
        </div>
      </div>
      <div class="tabs">${tabs.map(([k, l, n]) => `<button class="tab ${state.list === k ? 'active' : ''}" data-list="${k}">${l} <span class="count">${n}</span></button>`).join('')}</div>
      <div class="mt-s">${table}</div>`;
    box.querySelectorAll('[data-list]').forEach((b) => { b.onclick = () => { state.list = b.dataset.list; drawDetail(el, per, f); }; });
    const cf = box.querySelector('#clear-f');
    if (cf) cf.onclick = () => { state.filter = null; drawDetail(el, per, f); };
    box.querySelector('#xl').onclick = () => A.exportExcel({ from: per.from, to: per.to, platform: state.pf || '', title: per.label });
    if (state.list === 'orders') ui.bindRows(box, orders, (o) => ui.orderModal(o.id));
    if (state.list === 'payouts') ui.bindRows(box, payouts, (o) => ui.orderModal(o.id));
  }
})(window.App);
