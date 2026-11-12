/* หน้า: 2. ติดตามออเดอร์ — พัสดุถึงมือลูกค้าหรือยัง */
(function (A) {
  const U = A.U, ui = A.ui, C = A.calc;
  const state = { tab: 'notReceived', pf: '', q: '' };
  const TABS = [
    ['pendingShip', 'รอจัดส่ง', 'parcel'],
    ['shipping', 'กำลังจัดส่ง', 'truck'],
    ['notReceived', 'เกินกำหนดยังไม่ได้รับ', 'alert'],
    ['received', 'ได้รับแล้ว (30 วัน)', 'check'],
    ['voided', 'คืนสินค้า / ยกเลิก', 'refresh'],
  ];

  A.pages.tracking = {
    desc: 'เช็กว่าพัสดุชิ้นไหนลูกค้ายังไม่ได้รับ ค้างส่ง หรือถูกตีกลับ',
    render(el, params) {
      if (params.get('tab')) { state.tab = params.get('tab'); history.replaceState(null, '', '#/tracking'); }
      draw(el);
    },
  };

  function draw(el) {
    const st = A.settings();
    const data = C.tracking({ platform: state.pf || undefined });
    el.innerHTML = `
      <div class="kpis">
        ${ui.kpi({ label: 'รอจัดส่ง', value: U.num(data.pendingShip.length), foot: `ค้างเกิน ${st.shipLateDays} วัน: ${data.pendingShip.filter((x) => x.late).length}`, icon: 'parcel', tone: 'butter' })}
        ${ui.kpi({ label: 'กำลังจัดส่ง (ยังไม่เกินกำหนด)', value: U.num(data.shipping.length), icon: 'truck', tone: 'blue' })}
        ${ui.kpi({ label: `ส่งเกิน ${st.deliveryDays} วัน ยังไม่ได้รับ`, value: U.num(data.notReceived.length), foot: data.notReceived.length ? '<span class="delta-down">ควรตามกับขนส่ง/ลูกค้า</span>' : 'ไม่มี', icon: 'alert', tone: 'pink' })}
        ${ui.kpi({ label: 'คืนสินค้า / ยกเลิก (60 วัน)', value: U.num(data.voided.length), icon: 'refresh', tone: 'mint' })}
      </div>
      <div class="card mt">
        <div class="row">
          <div class="tabs">${TABS.map(([k, l]) => `<button class="tab ${state.tab === k ? 'active' : ''} ${k === 'notReceived' && data[k].length ? 'warn' : ''}" data-tab="${k}">${l} <span class="count">${data[k].length}</span></button>`).join('')}</div>
          <span class="spacer"></span>
          ${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}
          <input class="input" id="q" placeholder="ค้นหาเลขออเดอร์ / เลขพัสดุ / สินค้า" value="${U.esc(state.q)}" style="width:250px">
        </div>
        <div id="list" class="mt-s"></div>
      </div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; draw(el); }; });
    el.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; draw(el); };
    const q = el.querySelector('#q');
    q.oninput = U.debounce(() => { state.q = q.value.trim().toLowerCase(); drawList(); }, 200);

    function drawList() {
      const box = el.querySelector('#list');
      const match = (o) => !state.q || [o.orderNo, o.trackingNo, o.items, o.note].some((x) => String(x || '').toLowerCase().includes(state.q));
      const rows = data[state.tab].filter((x) => match(x.o));
      const dayLabel = { pendingShip: 'สั่งมาแล้ว', shipping: 'ส่งมาแล้ว', notReceived: 'ส่งมาแล้ว', received: 'ได้รับเมื่อ', voided: 'สั่งเมื่อ' }[state.tab];
      const cols = [
        { h: 'แพลตฟอร์ม', v: (x) => ui.pf(x.o.platform) },
        { h: 'เลขคำสั่งซื้อ', v: (x) => `<b>${U.esc(x.o.orderNo)}</b>${x.o.note ? `<div class="small muted">📝 ${U.esc(x.o.note)}</div>` : ''}` },
        { h: 'สินค้า', cls: 'ell', v: (x) => U.esc(x.o.items || '–') },
        { h: 'วันที่สั่ง', v: (x) => U.thDate(x.o.orderDate) },
        { h: 'วันที่ส่ง', v: (x) => U.thDate(x.o.shipDate) },
        { h: dayLabel, v: (x) => (x.late ? `<span class="badge b-red">${x.age} วัน</span>` : `<span class="badge b-grey">${x.age} วัน${state.tab === 'received' ? 'ก่อน' : ''}</span>`) },
        { h: 'เลขพัสดุ', v: (x) => (x.o.trackingNo ? `<span class="nowrap">${U.esc(x.o.trackingNo)} <button class="icon-btn" data-copy="${U.esc(x.o.trackingNo)}" title="คัดลอก">${A.icon('copy')}</button></span><div class="small muted">${U.esc(x.o.carrier || '')}</div>` : '–') },
        { h: 'สถานะ', v: (x) => ui.status(x.o.status) },
      ];
      if (state.tab === 'shipping' || state.tab === 'notReceived' || state.tab === 'pendingShip') {
        cols.push({ h: '', v: (x) => `<div class="row nowrap" style="gap:4px">
          ${state.tab !== 'pendingShip' ? `<button class="btn blue sm" data-recv="${U.esc(x.o.id)}">${A.icon('check')} ได้รับแล้ว</button>` : `<button class="btn ghost sm" data-ship="${U.esc(x.o.id)}">${A.icon('truck')} ส่งแล้ว</button>`}
          <button class="icon-btn" data-note="${U.esc(x.o.id)}" title="เขียนโน้ต">${A.icon('note')}</button></div>` });
      }
      box.innerHTML = (state.tab === 'notReceived' && rows.length ? `<div class="notice pink" style="margin-bottom:10px">${A.icon('info')}<div>พัสดุที่ส่งเกิน ${st.deliveryDays} วันแล้วยังไม่มีข้อมูลว่าลูกค้าได้รับ — คัดลอกเลขพัสดุไปเช็กกับขนส่ง หรือนำเข้าไฟล์ออเดอร์ล่าสุดเพื่ออัปเดตสถานะ</div></div>` : '')
        + ui.table(cols, rows, { onRow: true, empty: state.tab === 'notReceived' ? '🎉 ไม่มีพัสดุตกค้าง' : 'ไม่มีรายการ' });
      ui.bindRows(box, rows, (x) => ui.orderModal(x.o.id));
      box.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => ui.copy(b.dataset.copy); });
      box.querySelectorAll('[data-recv]').forEach((b) => {
        b.onclick = async () => { const o = A.db.get('orders', b.dataset.recv); await A.db.put('orders', { ...o, status: 'delivered', deliveredDate: U.today() }); ui.toast('บันทึกว่าลูกค้าได้รับแล้ว — ย้ายไปรอเงินเข้าที่ลูกหนี้แพลตฟอร์ม', 'ok'); draw(el); };
      });
      box.querySelectorAll('[data-ship]').forEach((b) => {
        b.onclick = async () => { const o = A.db.get('orders', b.dataset.ship); await A.db.put('orders', { ...o, status: 'shipped', shipDate: o.shipDate || U.today() }); ui.toast('ย้ายไปกำลังจัดส่งแล้ว', 'ok'); draw(el); };
      });
      box.querySelectorAll('[data-note]').forEach((b) => { b.onclick = () => ui.orderModal(b.dataset.note); });
    }
    drawList();
  }
})(window.App);
