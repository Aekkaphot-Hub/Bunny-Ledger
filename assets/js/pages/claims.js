/* หน้า: ออเดอร์มีปัญหา & เคลม
   หาให้อัตโนมัติจากไฟล์รายได้:
   - ร้านโดนเก็บค่าส่งเอง (TikTok: ยอดรวมค่าจัดส่งที่ร้านค้าจ่ายจริง • Shopee: ค่าส่งที่ Shopee ชำระโดยชื่อของคุณ − ส่วนที่ผู้ซื้อ/Shopee ออกให้)
     น้ำหนักที่เรียกเก็บ > น้ำหนักโดยประมาณ = "น้ำหนักเกิน"
   - ออเดอร์คืนสินค้าที่โดนหักค่าส่ง (เงินเข้าติดลบ)
   เงินคืนจากแพลตฟอร์ม (เงินชดเชย / เคลมค่าจัดส่ง ที่ผูกกับออเดอร์) ปิดเรื่องเป็น "ได้เงินคืน" ให้เอง
   สถานะที่ผู้ใช้ตั้ง เก็บใน order.claim = { status, type, lost, gotManual, evidence, note, at } */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary;
  const L = {};
  L.STATUS = {
    new: { label: 'ต้องตรวจ', cls: 'b-butter' },
    todo: { label: 'รอยื่นเรื่อง', cls: 'b-pink' },
    filed: { label: 'ยื่นแล้ว รอผล', cls: 'b-blue' },
    won: { label: 'ได้เงินคืนแล้ว', cls: 'b-green' },
    closed: { label: 'ปิดเรื่อง / ไม่เคลม', cls: 'b-grey' },
  };
  L.TYPES = { weight: 'น้ำหนักเกิน', ship: 'ร้านโดนเก็บค่าส่ง', return: 'ค่าส่งคืน / ตีกลับ', lost: 'พัสดุหาย / เสียหาย', other: 'อื่นๆ' };

  L.MIN = 5; // ค่าส่งที่โดนเก็บต่ำกว่านี้ไม่แจ้งเตือนอัตโนมัติ (มักเป็นเศษปรับยอด ไม่คุ้มยื่นเคลม)
  L.info = (o) => {
    const c = o.claim || null;
    let type = null, lost = 0;
    if (o.shipPaid >= L.MIN) { type = A.isVoid(o.status) ? 'return' : o.weightBilled > o.weightEst ? 'weight' : 'ship'; lost = o.shipPaid; }
    else if (A.isVoid(o.status) && o.actualPayout < 0) { type = 'return'; lost = -o.actualPayout; }
    if (!type && !c && !(o.compGot > 0)) return null;
    if (c && c.type) type = c.type;
    if (c && c.lost != null) lost = c.lost;
    const got = U.round2((o.compGot || 0) + (c && c.gotManual ? c.gotManual : 0));
    const status = c && c.status ? c.status : got > 0 ? 'won' : 'new';
    return { o, type: type || 'other', lost: U.round2(lost), got, status, auto: !c, note: c ? c.note || '' : '', evidence: !!(c && c.evidence) };
  };
  L.list = () => A.db.all('orders').map(L.info).filter(Boolean);
  L.badge = () => {
    const since = U.addDays(U.today(), -45);
    return A.db.all('orders').filter((o) => (o.shipPaid >= L.MIN || (A.isVoid(o.status) && o.actualPayout < 0)) && !o.claim && !(o.compGot > 0) && (S.dayOf(o) || '') >= since).length;
  };

  /* นำเข้าเรื่องเคลมจากชีต "สินค้ามีปัญหา" ในไฟล์ที่จดเอง */
  L.importRows = async (rows) => {
    const recs = [];
    rows.forEach((r) => {
      const pfs = r.platform ? [r.platform] : A.PF_KEYS;
      let o = null;
      for (const p of pfs) { o = A.db.get('orders', A.importers.makeId(p, r.orderNo)) || A.db.get('orders', A.importers.makeId(p, r.orderNo.toLowerCase())); if (o) break; }
      if (!o) return;
      const cur = o.claim || {};
      const type = cur.type || (/น้ำหนัก/.test(r.note) ? 'weight' : /คืน|ตีกลับ/.test(r.note) ? 'return' : /หาย|เสียหาย|แตก/.test(r.note) ? 'lost' : undefined);
      const gotManual = r.got > 0 && !(o.compGot > 0) ? r.got : cur.gotManual;
      recs.push({ ...o, claim: { ...cur, type, status: r.got > 0 ? 'won' : r.filed ? 'filed' : cur.status || 'todo', gotManual, evidence: cur.evidence || r.evidence, note: [cur.note, r.note].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' • '), at: Date.now() } });
    });
    if (recs.length) await A.db.putMany('orders', recs);
    return recs.length;
  };
  A.claimsLib = L;

  const state = { tab: 'open', pf: '', q: '' };
  const TABS = [['open', 'ต้องจัดการ', (x) => ['new', 'todo', 'filed'].includes(x.status)], ['new', 'ต้องตรวจ', (x) => x.status === 'new'], ['todo', 'รอยื่น', (x) => x.status === 'todo'], ['filed', 'ยื่นแล้ว', (x) => x.status === 'filed'], ['won', 'ได้เงินคืน', (x) => x.status === 'won'], ['closed', 'ปิดเรื่อง', (x) => x.status === 'closed'], ['all', 'ทั้งหมด', () => true]];

  A.pages.claims = {
    desc: 'ออเดอร์ที่ร้านโดนเก็บค่าส่งเกิน น้ำหนักเกิน หรือตีกลับ — ติดตามการยื่นเคลมจนได้เงินคืน',
    render(el) { draw(el); },
  };

  const weightTxt = (o) => (o.weightBilled > o.weightEst ? `น้ำหนัก ${U.num(o.weightEst)} → ${U.num(o.weightBilled)} ก.` : '');
  const statusBadge = (s) => `<span class="badge ${L.STATUS[s].cls}">${L.STATUS[s].label}</span>`;

  function draw(el) {
    const q = state.q.trim().toLowerCase();
    const all = L.list().filter((x) => (!state.pf || x.o.platform === state.pf) && (!q || x.o.orderNo.toLowerCase().includes(q) || (x.note || '').toLowerCase().includes(q)))
      .sort((a, b) => (S.dayOf(b.o) || '').localeCompare(S.dayOf(a.o) || ''));
    const tab = TABS.find((t) => t[0] === state.tab) || TABS[0];
    const list = all.filter(tab[2]);
    const open = all.filter((x) => ['new', 'todo', 'filed'].includes(x.status));
    el.innerHTML = `
      <div class="kpis">
        ${ui.kpi({ label: 'เสียไปทั้งหมด', value: U.money(U.sum(all, (x) => x.lost)), foot: `${U.num(all.length)} ออเดอร์`, icon: 'alert', tone: 'pink' })}
        ${ui.kpi({ label: 'ได้เงินคืนแล้ว', value: U.money(U.sum(all, (x) => x.got)), foot: `${U.num(all.filter((x) => x.got > 0).length)} ออเดอร์`, icon: 'wallet', tone: 'mint' })}
        ${ui.kpi({ label: 'ยังต้องจัดการ', value: U.money(U.sum(open, (x) => x.lost)), foot: `ต้องตรวจ ${U.num(open.filter((x) => x.status === 'new').length)} • รอยื่น ${U.num(open.filter((x) => x.status === 'todo').length)} • รอผล ${U.num(open.filter((x) => x.status === 'filed').length)}`, icon: 'clock', tone: 'butter' })}
      </div>
      <div class="card mt">
        <div class="row">
          <div class="tabs">${TABS.map(([id, l, fn]) => `<button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">${l} <span class="count">${all.filter(fn).length}</span></button>`).join('')}</div>
        </div>
        <div class="row mt-s">
          <input class="input" id="q" placeholder="ค้นหาเลขคำสั่งซื้อ / โน้ต" value="${U.esc(state.q)}">
          ${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}
          <span class="spacer"></span>
          <input class="input" id="add-no" placeholder="เลขคำสั่งซื้อ" style="max-width:200px">
          <button class="btn ghost sm" id="add">${A.icon('plus')} เพิ่มเรื่องเอง</button>
          <button class="btn ghost sm" id="imp">${A.icon('upload')} นำเข้าจากไฟล์ที่จดเอง</button>
          <input type="file" id="imp-in" accept=".xlsx,.xls" class="hidden">
          <button class="btn ghost sm" id="xl">${A.icon('download')} Excel</button>
        </div>
        <p class="small muted mt-s">โปรแกรมหาให้จากไฟล์รายได้: ร้านโดนเก็บค่าส่ง/น้ำหนักเกิน (TikTok, Shopee) และออเดอร์ตีกลับที่โดนหักค่าส่ง • เงินชดเชย/เคลมค่าจัดส่งที่แพลตฟอร์มโอนคืนจะขึ้นเป็น "ได้เงินคืน" เอง</p>
        <div class="mt-s">${ui.table([
          { h: 'วันที่ส่ง', v: (x) => U.thDate(S.dayOf(x.o)) },
          { h: 'แพลตฟอร์ม', v: (x) => ui.pf(x.o.platform) },
          { h: 'เลขคำสั่งซื้อ', v: (x) => `${U.esc(x.o.orderNo)} <button class="icon-btn" data-copy="${U.esc(x.o.orderNo)}" title="คัดลอก">${A.icon('copy')}</button>` },
          { h: 'ปัญหา', v: (x) => `${L.TYPES[x.type]}${weightTxt(x.o) ? `<div class="small muted">${weightTxt(x.o)}</div>` : ''}` },
          { h: 'เสียไป', cls: 'num', v: (x) => U.money(x.lost) },
          { h: 'ได้คืน', cls: 'num', v: (x) => (x.got ? `<b>${U.money(x.got)}</b>` : '–') },
          { h: 'สถานะ', v: (x) => statusBadge(x.status) + (x.evidence ? ' <span class="badge b-grey">มีหลักฐาน</span>' : '') },
          { h: 'โน้ต', cls: 'ell', v: (x) => U.esc(x.note) },
        ], list, { onRow: true, max: 400, empty: state.tab === 'open' ? 'ไม่มีเรื่องค้าง 🎉' : 'ไม่มีรายการ',
          foot: [{ v: 'รวม' }, { v: '' }, { v: `${U.num(list.length)} ออเดอร์` }, { v: '' }, { cls: 'num', v: U.money(U.sum(list, (x) => x.lost)) }, { cls: 'num', v: U.money(U.sum(list, (x) => x.got)) }, { v: '' }, { v: '' }] })}</div>
      </div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; draw(el); }; });
    el.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; draw(el); };
    const qi = el.querySelector('#q');
    qi.oninput = U.debounce(() => { state.q = qi.value; draw(el); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300);
    el.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => ui.copy(b.dataset.copy); });
    ui.bindRows(el.querySelector('.card.mt'), list, (x) => claimModal(el, x.o));
    el.querySelector('#add').onclick = () => {
      const no = el.querySelector('#add-no').value.trim();
      if (!no) { ui.toast('ใส่เลขคำสั่งซื้อก่อนนะ', 'err'); return; }
      const o = A.db.all('orders').find((x) => x.orderNo.toLowerCase() === no.toLowerCase());
      if (!o) { ui.toast('ไม่พบออเดอร์นี้ในโปรแกรม', 'err'); return; }
      claimModal(el, o, true);
    };
    const fi = el.querySelector('#imp-in');
    el.querySelector('#imp').onclick = () => fi.click();
    fi.onchange = async () => {
      const f = fi.files[0]; fi.value = '';
      if (!f) return;
      try {
        const res = await A.costing.learn(f);
        if (!res.claims.length) { ui.toast('ไม่พบชีตสินค้ามีปัญหา (คอลัมน์ "ได้รับเงิน") ในไฟล์นี้', 'err'); return; }
        const n = await L.importRows(res.claims);
        ui.toast(`นำเข้าเรื่องเคลม ${n} จาก ${res.claims.length} รายการ${n < res.claims.length ? ` (ไม่พบออเดอร์ ${res.claims.length - n} รายการ — นำเข้าไฟล์ของช่วงนั้นก่อน)` : ''}`, 'ok');
        state.tab = 'all'; draw(el);
      } catch (e) { ui.toast(e.message || String(e), 'err'); }
    };
    el.querySelector('#xl').onclick = () => A.exportSheets(`เคลม_${A.settings().shopName}_${U.today()}.xlsx`, [{ name: 'ออเดอร์มีปัญหา', title: 'ออเดอร์มีปัญหา & เคลม', sub: `${tab[1]} • ${U.thDate(U.today())}`, tables: [{ cols: [
      { h: 'วันที่ส่ง', w: 12, t: 'date', v: (x) => S.dayOf(x.o) },
      { h: 'แพลตฟอร์ม', w: 10, t: 'text', v: (x) => A.PLATFORMS[x.o.platform].name },
      { h: 'เลขคำสั่งซื้อ', w: 22, t: 'text', v: (x) => x.o.orderNo },
      { h: 'ปัญหา', w: 18, t: 'text', v: (x) => L.TYPES[x.type] },
      { h: 'น้ำหนัก (ก.)', w: 16, t: 'text', v: (x) => (x.o.weightBilled ? `${x.o.weightEst} → ${x.o.weightBilled}` : '') },
      { h: 'เสียไป', t: 'money', v: (x) => x.lost },
      { h: 'ได้คืน', t: 'money', v: (x) => x.got },
      { h: 'สถานะ', w: 16, t: 'text', v: (x) => L.STATUS[x.status].label },
      { h: 'โน้ต', w: 30, t: 'text', v: (x) => x.note },
    ], rows: list }] }]);
  }

  function claimModal(el, o, manual) {
    const x = L.info(o) || { o, type: 'other', lost: 0, got: o.compGot || 0, status: 'todo', note: '', evidence: false };
    const c = o.claim || {};
    const C = A.calc;
    ui.modal({
      title: 'เรื่องเคลม', wide: true,
      body: `
        <dl class="kv">
          <dt>ออเดอร์</dt><dd>${ui.pf(o.platform)} <b>${U.esc(o.orderNo)}</b> ${ui.status(o.status)}</dd>
          <dt>วันที่ส่ง</dt><dd>${U.thDate(S.dayOf(o))}</dd>
          ${o.shipPaid ? `<dt>ค่าส่งที่ร้านโดนเก็บ</dt><dd><b>${U.money(o.shipPaid)}</b> ${weightTxt(o) ? `<span class="muted small">${weightTxt(o)}</span>` : ''}</dd>` : ''}
          <dt>เงินเข้า</dt><dd>${C.isPaid(o) ? C.payoutParts(o).map((p) => `${U.thDate(p.date)} ${U.money(p.amount)}`).join(' • ') : 'ยังไม่เข้า'}</dd>
          ${o.compGot ? `<dt>เงินคืนจากแพลตฟอร์ม</dt><dd><b>${U.money(o.compGot)}</b> <span class="muted small">(จากไฟล์รายได้)</span></dd>` : ''}
        </dl>
        <div class="form-grid mt" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>ปัญหา</label><select class="input" data-f="type">${Object.entries(L.TYPES).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>สถานะ</label><select class="input" data-f="status">${Object.entries(L.STATUS).map(([k, v]) => `<option value="${k}" ${(manual ? 'todo' : x.status) === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
          <div class="field"><label>ยอดที่เสียไป (บาท)</label><input class="input" type="number" step="0.01" data-f="lost" value="${x.lost || ''}"></div>
          <div class="field"><label>ได้เงินคืน (บันทึกเอง ถ้าไฟล์ไม่มี)</label><input class="input" type="number" step="0.01" data-f="got" value="${c.gotManual || ''}" placeholder="${o.compGot ? 'ไฟล์มีแล้ว ' + U.money(o.compGot) : '0.00'}"></div>
          <label class="check" style="grid-column:1/-1"><input type="checkbox" data-f="evidence" ${x.evidence ? 'checked' : ''}> มีหลักฐานแล้ว (รูปชั่งน้ำหนัก / วิดีโอแพ็กของ)</label>
          <div class="field" style="grid-column:1/-1"><label>โน้ต</label><input class="input" data-f="note" value="${U.esc(x.note)}" placeholder="เช่น ยื่นเคสเลขที่ … / รอ 7 วัน"></div>
        </div>`,
      actions: [
        { label: 'รายละเอียดออเดอร์', cls: 'ghost', onClick: () => { ui.orderModal(o.id); } },
        ...(o.claim ? [{ label: 'ล้างสถานะที่ตั้งเอง', cls: 'ghost', onClick: async () => { const { claim, ...rest } = A.db.get('orders', o.id); await A.db.put('orders', rest); ui.toast('กลับเป็นค่าที่โปรแกรมหาให้'); draw(el); } }] : []),
        { label: `${A.icon('check')} บันทึก`, onClick: async (_c, root) => {
          const v = (k) => root.querySelector(`[data-f="${k}"]`);
          const lost = parseFloat(v('lost').value), got = parseFloat(v('got').value);
          const claim = { ...c, type: v('type').value, status: v('status').value, lost: isNaN(lost) ? undefined : U.round2(lost), gotManual: isNaN(got) ? undefined : U.round2(got), evidence: v('evidence').checked, note: v('note').value.trim(), at: Date.now() };
          Object.keys(claim).forEach((k) => claim[k] === undefined && delete claim[k]);
          await A.db.put('orders', { ...A.db.get('orders', o.id), claim });
          ui.toast('บันทึกแล้ว', 'ok');
          draw(el);
        } },
      ],
    });
  }
})(window.App);
