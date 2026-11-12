/* หน้า: 1. ลูกหนี้แพลตฟอร์ม — เงินที่แพลตฟอร์มยังไม่โอนให้ */
(function (A) {
  const U = A.U, ui = A.ui, C = A.calc;
  const state = { tab: 'waiting', pf: '', q: '' };

  A.pages.receivables = {
    desc: 'ออเดอร์ที่ลูกค้าได้รับของแล้ว แต่แพลตฟอร์มยังไม่โอนเงินให้ร้าน',
    render(el, params) {
      if (params.get('tab')) { state.tab = params.get('tab'); history.replaceState(null, '', '#/receivables'); }
      draw(el);
    },
  };

  function draw(el) {
    const st = A.settings();
    const f = { platform: state.pf || undefined };
    const all = C.receivables(f);
    const overdue = all.filter((r) => r.overdue);
    const transit = C.inTransit(f);
    const mism = C.mismatches(f);
    const since = U.addDays(U.today(), -30);
    const paid = A.db.all('orders').filter((o) => C.isPaid(o) && o.payoutDate >= since && (!state.pf || o.platform === state.pf)).sort((a, b) => b.payoutDate.localeCompare(a.payoutDate));

    const buckets = [
      { label: '0–7 วัน', tone: 'mint', rows: all.filter((r) => r.age <= 7) },
      { label: '8–14 วัน', tone: 'blue', rows: all.filter((r) => r.age > 7 && r.age <= 14) },
      { label: '15–30 วัน', tone: 'butter', rows: all.filter((r) => r.age > 14 && r.age <= 30) },
      { label: 'เกิน 30 วัน', tone: 'pink', rows: all.filter((r) => r.age > 30) },
    ];
    const total = U.sum(all, (r) => r.amount);

    el.innerHTML = `
      <div class="grid g3">
        ${A.PF_KEYS.map((k) => {
          const rs = C.receivables({ platform: k });
          const od = rs.filter((r) => r.overdue);
          const p = A.PLATFORMS[k];
          return `<div class="pf-card" style="--pf:${p.color}">
            <div class="row"><span class="pf-logo">${p.letter}</span><div><h3>${p.name}</h3><span class="small muted">รอบเงินเข้า ~${st.payoutDays[k]} วันหลังส่งถึง</span></div></div>
            <div class="row mt-s" style="align-items:flex-end">
              <div><div class="small muted">ยังไม่โอน</div><div style="font-family:var(--font-head);font-size:22px">${U.money(U.sum(rs, (r) => r.amount))}</div><div class="small muted">${rs.length} ออเดอร์</div></div>
              <span class="spacer"></span>
              ${od.length ? `<span class="badge b-red">เกินกำหนด ${od.length} • ${U.money0(U.sum(od, (r) => r.amount))}</span>` : '<span class="badge b-green">ไม่มีค้างเกินกำหนด</span>'}
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="card mt">
        <div class="card-head"><h3>${A.icon('clock')} อายุลูกหนี้ (นับจากวันที่ลูกค้าได้รับของ)</h3><span class="sub">รวม ${U.money(total)} • ระหว่างขนส่ง (ยังไม่ถึงรอบ) อีก ${U.money(U.sum(transit, (x) => x.amount))}</span></div>
        <div class="aging">${buckets.map((b) => `<div class="age-tile tone-${b.tone}"><small>${b.label}</small><b>${U.money0(U.sum(b.rows, (r) => r.amount))}</b><small>${b.rows.length} ออเดอร์</small></div>`).join('')}</div>
        <div class="bar-track mt-s">${buckets.map((b, i) => { const v = U.sum(b.rows, (r) => r.amount); return total ? `<i style="width:${(v / total) * 100}%;background:${['#A8DCC9', '#9CCBF0', '#FBE3A7', '#F6B5CB'][i]}"></i>` : ''; }).join('')}</div>
      </div>

      <div class="card mt">
        <div class="row">
          <div class="tabs">
            ${tab('waiting', 'รอเงินเข้าทั้งหมด', all.length)}
            ${tab('overdue', 'เกินกำหนด', overdue.length, true)}
            ${tab('mismatch', 'ยอดโอนไม่ตรง', mism.length, true)}
            ${tab('paid', 'เงินเข้าแล้ว (30 วัน)', paid.length)}
          </div>
          <span class="spacer"></span>
          ${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}
          <input class="input" id="q" placeholder="ค้นหาเลขออเดอร์…" value="${U.esc(state.q)}" style="width:190px">
        </div>
        <div class="mt-s" id="list"></div>
      </div>`;

    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; draw(el); }; });
    el.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; draw(el); };
    const q = el.querySelector('#q');
    q.oninput = U.debounce(() => { state.q = q.value.trim(); drawList(); }, 200);

    function drawList() {
      const box = el.querySelector('#list');
      const match = (o) => !state.q || String(o.orderNo).toLowerCase().includes(state.q.toLowerCase()) || String(o.trackingNo || '').toLowerCase().includes(state.q.toLowerCase());
      if (state.tab === 'waiting' || state.tab === 'overdue') {
        const rows = (state.tab === 'overdue' ? overdue : all).filter((r) => match(r.o));
        box.innerHTML = ui.table([
          { h: 'แพลตฟอร์ม', v: (r) => ui.pf(r.o.platform) },
          { h: 'เลขคำสั่งซื้อ', v: (r) => `<b>${U.esc(r.o.orderNo)}</b>${r.o.note ? `<div class="small muted">📝 ${U.esc(r.o.note)}</div>` : ''}` },
          { h: 'สินค้า', cls: 'ell', v: (r) => U.esc(r.o.items || '–') },
          { h: 'ลูกค้าได้รับ', v: (r) => U.thDate(r.base) },
          { h: 'ควรได้เงินภายใน', v: (r) => U.thDate(r.due) },
          { h: 'สถานะ', v: (r) => (r.overdue ? `<span class="badge b-red">เกิน ${r.overdueDays} วัน</span>` : `<span class="badge b-blue">อีก ${Math.max(0, U.diffDays(U.today(), r.due))} วัน</span>`) },
          { h: 'ยอดที่ควรได้', cls: 'num', v: (r) => U.money(r.amount) + (C.feesEstimated(r.o) ? '<div class="small muted">ประมาณการ</div>' : '') },
          { h: '', v: (r) => `<button class="btn mint sm" data-paid="${U.esc(r.o.id)}">${A.icon('wallet')} ได้รับแล้ว</button>` },
        ], rows, { onRow: true, empty: state.tab === 'overdue' ? '🎉 ไม่มีเงินค้างเกินกำหนด' : 'ไม่มีเงินค้างรับ', foot: [{ v: 'รวม' }, { v: `${rows.length} ออเดอร์` }, { v: '' }, { v: '' }, { v: '' }, { v: '' }, { cls: 'num', v: U.money(U.sum(rows, (r) => r.amount)) }, { v: '' }] });
        ui.bindRows(box, rows, (r) => ui.orderModal(r.o.id));
      } else if (state.tab === 'mismatch') {
        const rows = mism.filter((r) => match(r.o));
        box.innerHTML = `<p class="small muted">ออเดอร์ที่เงินเข้าแล้วแต่ยอดต่างจากที่ควรได้เกิน ${U.money(st.payoutTolerance)} หรือถูกหักเกิน ${U.pct(st.maxFeePct, 0)} ของยอดขาย (ปรับได้ที่ตั้งค่า)</p>` + ui.table([
          { h: 'แพลตฟอร์ม', v: (r) => ui.pf(r.o.platform) },
          { h: 'เลขคำสั่งซื้อ', v: (r) => `<b>${U.esc(r.o.orderNo)}</b>` },
          { h: 'เงินเข้า', v: (r) => U.thDate(r.o.payoutDate) },
          { h: 'ยอดขาย', cls: 'num', v: (r) => U.money(r.o.grossSales) },
          { h: 'ควรได้', cls: 'num', v: (r) => U.money(r.o.expectedPayout) },
          { h: 'ได้จริง', cls: 'num', v: (r) => `<b>${U.money(r.o.actualPayout)}</b>` },
          { h: 'ปัญหา', v: (r) => r.reasons.map((x) => `<span class="badge b-red">${U.esc(x)}</span>`).join(' ') },
          { h: '', v: (r) => `<button class="btn ghost sm" data-ok="${U.esc(r.o.id)}" title="ตรวจแล้ว ไม่ต้องแจ้งเตือนอีก">${A.icon('check')} ตรวจแล้ว</button>` },
        ], rows, { onRow: true, empty: '🎉 ยอดโอนตรงทุกออเดอร์' });
        ui.bindRows(box, rows, (r) => ui.orderModal(r.o.id));
      } else {
        const rows = paid.filter(match);
        box.innerHTML = ui.table([
          { h: 'แพลตฟอร์ม', v: (o) => ui.pf(o.platform) },
          { h: 'เลขคำสั่งซื้อ', v: (o) => U.esc(o.orderNo) },
          { h: 'วันที่เงินเข้า', v: (o) => U.thDate(o.payoutDate) },
          { h: 'ยอดขาย', cls: 'num', v: (o) => U.money(o.grossSales) },
          { h: 'เงินเข้า', cls: 'num', v: (o) => `<b>${U.money(o.actualPayout)}</b>` },
          { h: 'ที่มา', v: (o) => (o.manualPaid ? '<span class="badge b-butter">บันทึกเอง</span>' : '<span class="badge b-green">จากไฟล์</span>') },
        ], rows, { onRow: true, foot: [{ v: 'รวม' }, { v: `${rows.length} ออเดอร์` }, { v: '' }, { cls: 'num', v: U.money(U.sum(rows, (o) => o.grossSales)) }, { cls: 'num', v: U.money(U.sum(rows, (o) => o.actualPayout)) }, { v: '' }] });
        ui.bindRows(box, rows, (o) => ui.orderModal(o.id));
      }
      box.querySelectorAll('[data-paid]').forEach((b) => { b.onclick = () => ui.markPaid(b.dataset.paid); });
      box.querySelectorAll('[data-ok]').forEach((b) => {
        b.onclick = async () => { const o = A.db.get('orders', b.dataset.ok); await A.db.put('orders', { ...o, mismatchOk: true }); ui.toast('ทำเครื่องหมายว่าตรวจแล้ว', 'ok'); draw(el); };
      });
    }
    drawList();
  }

  function tab(k, label, n, warn) {
    return `<button class="tab ${state.tab === k ? 'active' : ''} ${warn && n ? 'warn' : ''}" data-tab="${k}">${label} <span class="count">${n}</span></button>`;
  }
})(window.App);
