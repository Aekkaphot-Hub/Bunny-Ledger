/* เอกสาร: ใบกำกับภาษี (สำหรับร้านที่จด VAT แล้ว)
   - อย่างย่อ (ม.86/6): ชื่อ/เลขผู้เสียภาษีผู้ขาย เลขที่ วันที่ รายการสินค้า ราคารวม VAT ("ราคารวมภาษีมูลค่าเพิ่มแล้ว")
   - เต็มรูป (ม.86/4): + ที่อยู่ผู้ขาย ชื่อ/ที่อยู่/เลขผู้เสียภาษี/สาขาของผู้ซื้อ มูลค่าสินค้า และ VAT แยกกัน
   - รายงานภาษีขายรายเดือน (ใช้ประกอบ ภ.พ.30)
   store invoices: { id, type: 'abb'|'full', no, seq, date, orderId, platform, orderNo, buyer, lines:[{desc, qty, amount}], total, base, vat, rate, status: 'ok'|'void' }
   ข้อมูลผู้ซื้อ (ใบเต็มรูป) ผู้ใช้กรอกเองเมื่อลูกค้าขอ — ไม่ได้ดึงจากไฟล์ของแพลตฟอร์ม */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary;
  const IV = {};
  const TYPE = { abb: 'อย่างย่อ', full: 'เต็มรูป' };

  IV.bahtText = (n) => {
    const nums = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'], pos = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
    const conv = (s, higher = false) => {
      s = s.replace(/^0+/, '');
      if (!s) return '';
      if (s.length > 6) return conv(s.slice(0, -6), higher) + 'ล้าน' + conv(s.slice(-6), true);
      let out = '';
      const L = s.length;
      for (let i = 0; i < L; i++) {
        const d = +s[i], p = L - i - 1;
        if (!d) continue;
        if (p === 0 && d === 1 && (L > 1 || higher)) out += 'เอ็ด';
        else if (p === 1 && d === 2) out += 'ยี่สิบ';
        else if (p === 1 && d === 1) out += 'สิบ';
        else out += nums[d] + pos[p];
      }
      return out;
    };
    const c = Math.round(Math.abs(n) * 100), baht = Math.floor(c / 100), sat = c % 100;
    return (n < 0 ? 'ลบ' : '') + (baht ? conv(String(baht)) : 'ศูนย์') + 'บาท' + (sat ? conv(String(sat)) + 'สตางค์' : 'ถ้วน');
  };
  const split = (total, rate) => { const base = U.round2(total / (1 + rate)); return { base, vat: U.round2(total - base) }; };
  IV.list = () => A.db.all('invoices');
  IV.byOrder = () => { const m = new Map(); IV.list().filter((x) => x.status !== 'void' && x.orderId).forEach((x) => m.set(x.orderId, x)); return m; };
  IV.nextNo = (type, date) => {
    const cfg = A.settings().invoice, y = date.slice(0, 4);
    const prefix = (type === 'abb' ? cfg.abbPrefix : cfg.fullPrefix) || (type === 'abb' ? 'ABB' : 'INV');
    const seq = 1 + Math.max(0, ...IV.list().filter((x) => x.type === type && x.date.slice(0, 4) === y).map((x) => x.seq || 0));
    return { seq, no: `${prefix}${y}-${String(seq).padStart(5, '0')}` };
  };
  const sellerOk = () => { const c = A.settings().invoice; return !!(c.sellerName && /^\d{13}$/.test(c.taxId || '') && (c.address || '').trim()); };

  /* สร้างใบกำกับ (คืน record ที่บันทึกแล้ว) */
  IV.create = async ({ type, date, order, buyer, lines, total }) => {
    const rate = A.settings().vat.rate;
    const { seq, no } = IV.nextNo(type, date);
    const rec = { id: 'inv:' + U.uid(), type, no, seq, date, lines, total: U.round2(total), rate, ...split(total, rate), status: 'ok' };
    if (order) Object.assign(rec, { orderId: order.id, platform: order.platform, orderNo: order.orderNo });
    if (type === 'full') rec.buyer = buyer;
    return A.db.put('invoices', rec);
  };
  const orderLines = (o) => {
    const ls = (o.lines || []).map((l) => ({ desc: l.n + (l.v ? ` (${l.v})` : ''), qty: l.q || 1 }));
    if (!ls.length) ls.push({ desc: o.items || 'สินค้า', qty: o.qty || 1 });
    const q = U.sum(ls, (l) => l.qty) || 1;
    let left = U.round2(o.grossSales || 0);
    ls.forEach((l, i) => { l.amount = i === ls.length - 1 ? left : U.round2((o.grossSales || 0) * l.qty / q); left = U.round2(left - l.amount); });
    return ls;
  };
  A.invoices = IV;

  /* ---------- พิมพ์ / บันทึกเป็น PDF ---------- */
  const esc = U.esc;
  IV.html = (inv) => {
    const c = A.settings().invoice;
    const full = inv.type === 'full';
    const thDate = (U.thDateLong ? U.thDateLong(inv.date) : U.thDate(inv.date)).replace(/^วัน\S*ที่\s*/, '');
    const rows = inv.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.desc)}</td><td class="n">${U.num(l.qty)}</td><td class="n">${U.money(full ? l.amount / (1 + inv.rate) : l.amount).replace('฿', '')}</td></tr>`).join('');
    return `<div class="inv ${full ? 'full' : 'abb'}">
      ${inv.status === 'void' ? '<div class="void">ยกเลิก</div>' : ''}
      <div class="inv-head">
        <div><b class="seller">${esc(c.sellerName)}</b><div>${esc(c.address || '')}</div><div>เลขประจำตัวผู้เสียภาษี ${esc(c.taxId || '')} • ${esc(c.branch || 'สำนักงานใหญ่')}</div>${c.phone ? `<div>โทร ${esc(c.phone)}</div>` : ''}</div>
        <div class="right"><h1>${full ? 'ใบกำกับภาษี' : 'ใบกำกับภาษีอย่างย่อ'}</h1><div>เลขที่ <b>${esc(inv.no)}</b></div><div>วันที่ ${thDate}</div>${inv.orderNo ? `<div class="muted">อ้างอิงคำสั่งซื้อ ${esc(A.PLATFORMS[inv.platform] ? A.PLATFORMS[inv.platform].name : '')} ${esc(inv.orderNo)}</div>` : ''}</div>
      </div>
      ${full ? `<div class="buyer"><b>ผู้ซื้อ</b> ${esc(inv.buyer.name)}<div>${esc(inv.buyer.address)}</div><div>เลขประจำตัวผู้เสียภาษี ${esc(inv.buyer.taxId || '-')} • ${esc(inv.buyer.branch || 'สำนักงานใหญ่')}</div></div>` : ''}
      <table><thead><tr><th>#</th><th>รายการ</th><th class="n">จำนวน</th><th class="n">${full ? 'มูลค่า (ไม่รวม VAT)' : 'จำนวนเงิน'}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sum">
        ${full ? `<div><span>มูลค่าสินค้า</span><b>${U.money(inv.base)}</b></div><div><span>ภาษีมูลค่าเพิ่ม ${Math.round(inv.rate * 100)}%</span><b>${U.money(inv.vat)}</b></div>` : ''}
        <div class="total"><span>${full ? 'รวมทั้งสิ้น' : 'รวมเงิน (ราคารวมภาษีมูลค่าเพิ่มแล้ว)'}</span><b>${U.money(inv.total)}</b></div>
        <div class="muted">(${IV.bahtText(inv.total)})</div>
      </div>
      ${full ? '<div class="sign"><div>ผู้รับเงิน ______________________</div><div>วันที่ ______________________</div></div>' : '<div class="muted small">VAT included</div>'}
    </div>`;
  };
  IV.print = (invs) => {
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = invs.map(IV.html).join('<div class="page-break"></div>');
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  };

  /* ---------- รายงานภาษีขาย ---------- */
  IV.report = (month) => {
    const from = U.monthStart(month), to = U.monthEnd(month);
    const rows = IV.list().filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
    return { from, to, rows, ok: rows.filter((x) => x.status !== 'void') };
  };

  /* ---------- หน้าจอ ---------- */
  const state = { month: null, tab: 'list', q: '' };
  A.pages.invoices = {
    desc: 'ออกใบกำกับภาษีอย่างย่อ / เต็มรูป จากออเดอร์ พิมพ์หรือบันทึกเป็น PDF และรายงานภาษีขายรายเดือน',
    render(el) { if (!state.month) state.month = U.monthStart(U.today()); draw(el); },
  };

  function draw(el) {
    const st = A.settings(), vat = st.vat, c = st.invoice;
    const blocked = A.sync && A.sync.blocked && A.sync.blocked().includes('invoices');
    const rep = IV.report(state.month);
    const tabs = [['list', 'ใบกำกับภาษี', 'file'], ['report', 'รายงานภาษีขาย', 'pie'], ['seller', 'ข้อมูลผู้ขาย', 'store']];
    if (!sellerOk() && state.tab !== 'seller') state.tab = 'seller';
    el.innerHTML = `
      ${blocked ? `<div class="notice warn">${A.icon('alert')}<div>ใบกำกับภาษียังไม่ซิงก์ขึ้นคลาวด์ — เจ้าของร้านต้องเผยแพร่ <b>firestore.rules</b> ฉบับใหม่ใน Firebase Console ก่อน (ข้อมูลเก็บในเครื่องนี้ตามปกติ)</div></div>` : ''}
      ${!vat.registered ? `<div class="notice warn ${blocked ? 'mt-s' : ''}">${A.icon('alert')}<div>ใบกำกับภาษีออกได้เฉพาะ<b>ผู้ที่จด VAT แล้ว</b> — เมื่อได้เลขทะเบียน (ภ.พ.20) แล้ว ไปที่ <a href="#/vat">คำนวณภาษี VAT</a> ติ๊ก "จด VAT แล้ว" พร้อมวันที่เริ่ม</div></div>` : ''}
      <div class="card ${blocked || !vat.registered ? 'mt' : ''}">
        <div class="row">
          <div class="tabs">${tabs.map(([id, l, ic]) => `<button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">${A.icon(ic)} ${l}</button>`).join('')}</div>
          <span class="spacer"></span>
          ${state.tab !== 'seller' ? `<button class="icon-btn" id="m-prev">${A.icon('chevL')}</button><input class="input" type="month" id="m-pick" value="${state.month.slice(0, 7)}"><button class="icon-btn" id="m-next">${A.icon('chevR')}</button>` : ''}
        </div>
      </div>
      <div id="tab-body" class="mt"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { if (b.dataset.tab !== 'seller' && !sellerOk()) { ui.toast('กรอกข้อมูลผู้ขายให้ครบก่อนนะ', 'err'); return; } state.tab = b.dataset.tab; draw(el); }; });
    const mv = (n) => { state.month = U.addMonths(state.month, n); draw(el); };
    if (el.querySelector('#m-prev')) {
      el.querySelector('#m-prev').onclick = () => mv(-1);
      el.querySelector('#m-next').onclick = () => mv(1);
      el.querySelector('#m-pick').onchange = (e) => { if (e.target.value) { state.month = e.target.value + '-01'; draw(el); } };
    }
    const body = el.querySelector('#tab-body');
    if (state.tab === 'seller') drawSeller(el, body);
    else if (state.tab === 'report') drawReport(el, body, rep);
    else drawList(el, body, rep);
  }

  function drawSeller(el, body) {
    const c = A.settings().invoice;
    body.innerHTML = `<div class="card">
      <div class="card-head"><h3>${A.icon('store')} ข้อมูลผู้ขาย (พิมพ์บนใบกำกับภาษี)</h3></div>
      <form id="seller" class="form-grid" style="grid-template-columns:1fr 1fr">
        <div class="field"><label>ชื่อผู้ประกอบการ / ชื่อร้าน (ตาม ภ.พ.20)</label><input class="input" name="sellerName" required value="${U.esc(c.sellerName || '')}"></div>
        <div class="field"><label>เลขประจำตัวผู้เสียภาษี (13 หลัก)</label><input class="input" name="taxId" required inputmode="numeric" maxlength="17" value="${U.esc(c.taxId || '')}"></div>
        <div class="field" style="grid-column:1/-1"><label>ที่อยู่สถานประกอบการ</label><input class="input" name="address" required value="${U.esc(c.address || '')}"></div>
        <div class="field"><label>สถานประกอบการ</label><input class="input" name="branch" value="${U.esc(c.branch || 'สำนักงานใหญ่')}" placeholder="สำนักงานใหญ่ / สาขาที่ 00001"></div>
        <div class="field"><label>โทรศัพท์ (ไม่บังคับ)</label><input class="input" name="phone" value="${U.esc(c.phone || '')}"></div>
        <div class="field"><label>ตัวนำหน้าเลขที่ อย่างย่อ</label><input class="input" name="abbPrefix" maxlength="8" value="${U.esc(c.abbPrefix || 'ABB')}"></div>
        <div class="field"><label>ตัวนำหน้าเลขที่ เต็มรูป</label><input class="input" name="fullPrefix" maxlength="8" value="${U.esc(c.fullPrefix || 'INV')}"></div>
        <div class="row" style="grid-column:1/-1"><button class="btn" type="submit">${A.icon('check')} บันทึก</button><span class="small muted">เลขที่จะเรียงต่อกันตามปี เช่น ABB2026-00001</span></div>
      </form></div>`;
    body.querySelector('#seller').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const v = Object.fromEntries([...fd.entries()].map(([k, x]) => [k, String(x).trim()]));
      v.taxId = v.taxId.replace(/\D/g, '');
      if (!/^\d{13}$/.test(v.taxId)) { ui.toast('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก', 'err'); return; }
      await A.saveSettings({ invoice: { ...A.settings().invoice, ...v } });
      ui.toast('บันทึกข้อมูลผู้ขายแล้ว', 'ok');
      state.tab = 'list'; draw(el);
    };
  }

  function drawList(el, body, rep) {
    const st = A.settings(), reg = st.vat.registered, since = st.vat.since || '';
    const byOrder = IV.byOrder();
    const q = state.q.trim().toLowerCase();
    const list = rep.rows.slice().reverse().filter((x) => !q || x.no.toLowerCase().includes(q) || (x.orderNo || '').toLowerCase().includes(q) || (x.buyer && x.buyer.name.toLowerCase().includes(q)));
    const day = U.today() < rep.to ? U.today() : rep.to;
    body.innerHTML = `
      <div class="card">
        <div class="row">
          <input class="input" id="ord" placeholder="เลขคำสั่งซื้อ" style="max-width:220px">
          <button class="btn sm" id="from-order" ${reg ? '' : 'disabled'}>${A.icon('plus')} ออกจากออเดอร์</button>
          <button class="btn ghost sm" id="manual" ${reg ? '' : 'disabled'}>${A.icon('edit')} ออกเอง</button>
          <span class="spacer"></span>
          <input class="input" type="date" id="bulk-day" value="${day}" style="max-width:170px">
          <button class="btn ghost sm" id="bulk" ${reg ? '' : 'disabled'}>${A.icon('file')} ออกอย่างย่อทุกออเดอร์ของวันนี้</button>
        </div>
        <p class="small muted mt-s">ออเดอร์จากแพลตฟอร์มเป็นราคารวม VAT • ใบเต็มรูปออกเมื่อลูกค้าขอ (ต้องมีชื่อ ที่อยู่ และเลขผู้เสียภาษีของผู้ซื้อ) • ใบที่ออกผิดให้กด "ยกเลิก" แล้วออกใหม่ เลขที่เดิมจะคงอยู่ในรายงาน</p>
      </div>
      <div class="card mt">
        <div class="card-head"><h3>${A.icon('file')} ใบกำกับภาษี ${U.thMonth(rep.from)}</h3><input class="input" id="q" placeholder="ค้นหาเลขที่ / ออเดอร์ / ผู้ซื้อ" value="${U.esc(state.q)}" style="max-width:240px"></div>
        ${ui.table([
          { h: 'วันที่', v: (x) => U.thDate(x.date) },
          { h: 'เลขที่', v: (x) => `<b>${U.esc(x.no)}</b> <span class="badge ${x.type === 'full' ? 'b-blue' : 'b-grey'}">${TYPE[x.type]}</span>` },
          { h: 'ออเดอร์ / ผู้ซื้อ', v: (x) => (x.orderNo ? `${ui.pf(x.platform)} ${U.esc(x.orderNo)}` : '') + (x.buyer ? `<div class="small">${U.esc(x.buyer.name)}</div>` : '') },
          { h: 'มูลค่า', cls: 'num', v: (x) => U.money(x.base) },
          { h: 'VAT', cls: 'num', v: (x) => U.money(x.vat) },
          { h: 'รวม', cls: 'num', v: (x) => `<b>${U.money(x.total)}</b>` },
          { h: 'สถานะ', v: (x) => (x.status === 'void' ? '<span class="badge b-red">ยกเลิก</span>' : '<span class="badge b-green">ใช้งาน</span>') },
          { h: '', v: (x) => `<span class="nowrap"><button class="icon-btn" data-print="${x.id}" title="พิมพ์ / PDF">${A.icon('download')}</button>${x.status !== 'void' ? `<button class="icon-btn" data-void="${x.id}" title="ยกเลิก">${A.icon('x')}</button>` : ''}</span>` },
        ], list, { empty: 'ยังไม่มีใบกำกับภาษีในเดือนนี้', foot: [{ v: 'รวม (ไม่นับที่ยกเลิก)' }, { v: `${rep.ok.length} ใบ` }, { v: '' }, { cls: 'num', v: U.money(U.sum(rep.ok, (x) => x.base)) }, { cls: 'num', v: U.money(U.sum(rep.ok, (x) => x.vat)) }, { cls: 'num', v: U.money(U.sum(rep.ok, (x) => x.total)) }, { v: '' }, { v: '' }] })}
        ${list.length ? `<div class="row mt-s"><button class="btn ghost sm" id="print-all">${A.icon('download')} พิมพ์ทั้งหมดที่แสดง (${list.length})</button></div>` : ''}
      </div>`;
    const qi = body.querySelector('#q');
    qi.oninput = U.debounce(() => { state.q = qi.value; draw(el); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300);
    body.querySelectorAll('[data-print]').forEach((b) => { b.onclick = () => IV.print([A.db.get('invoices', b.dataset.print)]); });
    const pa = body.querySelector('#print-all'); if (pa) pa.onclick = () => IV.print(list);
    body.querySelectorAll('[data-void]').forEach((b) => {
      b.onclick = async () => {
        const x = A.db.get('invoices', b.dataset.void);
        if (!(await ui.confirm(`ยกเลิกใบกำกับ ${x.no}?`, 'เลขที่นี้จะแสดงเป็น "ยกเลิก" ในรายงานภาษีขาย (ห้ามลบเลขที่ทิ้ง) แล้วออกใบใหม่แทนได้', 'ยกเลิกใบนี้', true))) return;
        await A.db.put('invoices', { ...x, status: 'void', voidAt: U.today() });
        ui.toast('ยกเลิกแล้ว'); draw(el);
      };
    });
    body.querySelector('#from-order').onclick = () => {
      const no = body.querySelector('#ord').value.trim();
      const o = no && A.db.all('orders').find((x) => x.orderNo.toLowerCase() === no.toLowerCase());
      if (!o) { ui.toast('ไม่พบออเดอร์นี้ในโปรแกรม', 'err'); return; }
      if (byOrder.has(o.id) && !confirm(`ออเดอร์นี้มีใบกำกับ ${byOrder.get(o.id).no} แล้ว — ออกเพิ่มอีกใบ?`)) return;
      invoiceModal(el, o);
    };
    body.querySelector('#manual').onclick = () => invoiceModal(el, null);
    body.querySelector('#bulk').onclick = async () => {
      const d = body.querySelector('#bulk-day').value;
      if (!d) return;
      if (since && d < since) { ui.toast(`วันที่นี้ยังไม่ได้จด VAT (จดตั้งแต่ ${U.thDate(since)})`, 'err'); return; }
      const orders = S.items(d, d).orders.filter((o) => !A.isVoid(o.status) && o.grossSales > 0 && !byOrder.has(o.id));
      if (!orders.length) { ui.toast('ไม่มีออเดอร์ที่ส่งวันนั้นที่ยังไม่ได้ออกใบกำกับ'); return; }
      if (!(await ui.confirm(`ออกใบกำกับอย่างย่อ ${orders.length} ใบ?`, `ออเดอร์ที่ส่งวันที่ ${U.thDate(d)} รวม ${U.money(U.sum(orders, (o) => o.grossSales))} — ลงวันที่ในใบกำกับเป็นวันที่ส่งสินค้า`))) return;
      for (const o of orders) await IV.create({ type: 'abb', date: d, order: o, lines: orderLines(o), total: o.grossSales });
      ui.toast(`ออกใบกำกับอย่างย่อ ${orders.length} ใบแล้ว`, 'ok');
      state.month = U.monthStart(d); draw(el);
    };
  }

  function invoiceModal(el, o) {
    const lines = o ? orderLines(o) : [{ desc: '', qty: 1, amount: 0 }];
    const date = o ? S.dayOf(o) || U.today() : U.today();
    const lineRow = (l, i) => `<tr data-row="${i}"><td><input class="input" data-desc value="${U.esc(l.desc)}"></td><td style="width:80px"><input class="input num" type="number" min="0" step="1" data-qty value="${l.qty}"></td><td style="width:140px"><input class="input num" type="number" step="0.01" data-amt value="${l.amount}"></td></tr>`;
    ui.modal({
      title: o ? `ออกใบกำกับภาษี — ${A.PLATFORMS[o.platform].name} ${o.orderNo}` : 'ออกใบกำกับภาษี', wide: true,
      body: `
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>ชนิด</label><select class="input" data-type><option value="abb">อย่างย่อ</option><option value="full">เต็มรูป (ลูกค้าขอ)</option></select></div>
          <div class="field"><label>วันที่ (จุดความรับผิด = วันส่งมอบสินค้า)</label><input class="input" type="date" data-date value="${date}"></div>
        </div>
        <div data-buyer class="form-grid mt-s hidden" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>ชื่อผู้ซื้อ / บริษัท</label><input class="input" data-b="name"></div>
          <div class="field"><label>เลขประจำตัวผู้เสียภาษีผู้ซื้อ (13 หลัก)</label><input class="input" data-b="taxId" inputmode="numeric" maxlength="17"></div>
          <div class="field" style="grid-column:1/-1"><label>ที่อยู่ผู้ซื้อ</label><input class="input" data-b="address"></div>
          <div class="field"><label>สถานประกอบการผู้ซื้อ</label><input class="input" data-b="branch" value="สำนักงานใหญ่"></div>
        </div>
        <table class="tbl mt-s"><thead><tr><th>รายการ</th><th class="num">จำนวน</th><th class="num">จำนวนเงิน (รวม VAT)</th></tr></thead><tbody data-lines>${lines.map(lineRow).join('')}</tbody></table>
        <div class="row mt-s"><button class="btn ghost sm" type="button" data-add>${A.icon('plus')} เพิ่มรายการ</button><span class="spacer"></span><b data-total></b></div>`,
      onOpen: (root) => {
        const tb = root.querySelector('[data-lines]');
        const recalc = () => { const t = U.sum([...tb.querySelectorAll('[data-amt]')], (i) => parseFloat(i.value) || 0); const r = A.settings().vat.rate; const sp = split(t, r); root.querySelector('[data-total]').textContent = `รวม ${U.money(t)} (มูลค่า ${U.money(sp.base)} + VAT ${U.money(sp.vat)})`; };
        tb.oninput = recalc; recalc();
        root.querySelector('[data-add]').onclick = () => { tb.insertAdjacentHTML('beforeend', lineRow({ desc: '', qty: 1, amount: 0 }, tb.children.length)); };
        root.querySelector('[data-type]').onchange = (e) => root.querySelector('[data-buyer]').classList.toggle('hidden', e.target.value !== 'full');
      },
      actions: [
        { label: 'ยกเลิก', cls: 'ghost' },
        { label: `${A.icon('check')} ออกใบกำกับ + พิมพ์`, onClick: async (_c, root) => {
          const type = root.querySelector('[data-type]').value, d = root.querySelector('[data-date]').value;
          const since = A.settings().vat.since;
          if (!d) { ui.toast('ใส่วันที่ก่อนนะ', 'err'); return false; }
          if (since && d < since) { ui.toast(`วันที่ก่อนจด VAT (${U.thDate(since)}) ออกใบกำกับไม่ได้`, 'err'); return false; }
          const ls = [...root.querySelectorAll('[data-lines] tr')].map((tr) => ({ desc: tr.querySelector('[data-desc]').value.trim(), qty: parseFloat(tr.querySelector('[data-qty]').value) || 0, amount: U.round2(parseFloat(tr.querySelector('[data-amt]').value) || 0) })).filter((l) => l.desc && l.amount);
          if (!ls.length) { ui.toast('ใส่รายการสินค้าอย่างน้อย 1 รายการ', 'err'); return false; }
          let buyer = null;
          if (type === 'full') {
            const b = (k) => root.querySelector(`[data-b="${k}"]`).value.trim();
            buyer = { name: b('name'), taxId: b('taxId').replace(/\D/g, ''), address: b('address'), branch: b('branch') || 'สำนักงานใหญ่' };
            if (!buyer.name || !buyer.address) { ui.toast('ใบเต็มรูปต้องมีชื่อและที่อยู่ผู้ซื้อ', 'err'); return false; }
            if (buyer.taxId && !/^\d{13}$/.test(buyer.taxId)) { ui.toast('เลขผู้เสียภาษีผู้ซื้อต้องมี 13 หลัก', 'err'); return false; }
          }
          const inv = await IV.create({ type, date: d, order: o, buyer, lines: ls, total: U.sum(ls, (l) => l.amount) });
          ui.toast(`ออกใบกำกับ ${inv.no} แล้ว`, 'ok');
          state.month = U.monthStart(d); draw(el);
          IV.print([inv]);
        } },
      ],
    });
  }

  function drawReport(el, body, rep) {
    const c = A.settings().invoice;
    const v = A.vat && A.settings().vat.registered ? A.vat.monthly(rep.from.slice(0, 4)).find((m) => m.from === rep.from) : null;
    const inv = U.sum(rep.ok, (x) => x.total);
    body.innerHTML = `
      <div class="kpis">
        ${ui.kpi({ label: 'มูลค่าสินค้าตามใบกำกับ', value: U.money(U.sum(rep.ok, (x) => x.base)), foot: `${rep.ok.length} ใบ${rep.rows.length - rep.ok.length ? ` • ยกเลิก ${rep.rows.length - rep.ok.length}` : ''}`, icon: 'file', tone: 'blue' })}
        ${ui.kpi({ label: 'ภาษีขายตามใบกำกับ', value: U.money(U.sum(rep.ok, (x) => x.vat)), foot: 'ใช้กรอก ภ.พ.30', icon: 'percent', tone: 'pink' })}
        ${v ? ui.kpi({ label: 'ยอดขายที่ยังไม่ได้ออกใบกำกับ', value: U.money(Math.max(0, v.base - inv)), foot: `ยอดขายทั้งเดือน (รวม VAT) ${U.money0(v.base)} — ต้องนำส่งภาษีขายทั้งหมด แม้ไม่ได้ออกใบกำกับ`, icon: 'alert', tone: 'butter', href: '#/vat' }) : ''}
      </div>
      <div class="card mt">
        <div class="card-head"><h3>${A.icon('pie')} รายงานภาษีขาย ${U.thMonth(rep.from)}</h3><button class="btn ghost sm" id="xl">${A.icon('download')} Excel</button></div>
        <p class="small muted">ผู้ประกอบการ ${U.esc(c.sellerName)} • เลขประจำตัวผู้เสียภาษี ${U.esc(c.taxId)} • ${U.esc(c.branch || 'สำนักงานใหญ่')}</p>
        ${ui.table([
          { h: 'ลำดับ', v: (x) => rep.rows.indexOf(x) + 1 },
          { h: 'วันที่', v: (x) => U.thDate(x.date) },
          { h: 'เลขที่', v: (x) => U.esc(x.no) },
          { h: 'ชื่อผู้ซื้อ', v: (x) => (x.status === 'void' ? '<span class="badge b-red">ยกเลิก</span>' : x.buyer ? U.esc(x.buyer.name) : 'ขายปลีก (อย่างย่อ)') },
          { h: 'เลขผู้เสียภาษีผู้ซื้อ', v: (x) => U.esc((x.buyer && x.buyer.taxId) || '-') },
          { h: 'สถานประกอบการ', v: (x) => U.esc((x.buyer && x.buyer.branch) || '-') },
          { h: 'มูลค่าสินค้า', cls: 'num', v: (x) => (x.status === 'void' ? U.money(0) : U.money(x.base)) },
          { h: 'ภาษีมูลค่าเพิ่ม', cls: 'num', v: (x) => (x.status === 'void' ? U.money(0) : U.money(x.vat)) },
        ], rep.rows, { empty: 'ยังไม่มีใบกำกับภาษีในเดือนนี้', max: 2000, foot: [{ v: 'รวม' }, { v: '' }, { v: '' }, { v: '' }, { v: '' }, { v: '' }, { cls: 'num', v: U.money(U.sum(rep.ok, (x) => x.base)) }, { cls: 'num', v: U.money(U.sum(rep.ok, (x) => x.vat)) }] })}
      </div>`;
    body.querySelector('#xl').onclick = () => A.exportSheets(`รายงานภาษีขาย_${c.sellerName}_${rep.from.slice(0, 7)}.xlsx`, [{ name: 'รายงานภาษีขาย', title: `รายงานภาษีขาย เดือน${U.thMonth(rep.from)}`, sub: `ชื่อผู้ประกอบการ ${c.sellerName} • เลขประจำตัวผู้เสียภาษี ${c.taxId} • ${c.branch || 'สำนักงานใหญ่'}`, tables: [{ cols: [
      { h: 'ลำดับ', w: 7, t: 'int', v: (x) => rep.rows.indexOf(x) + 1 },
      { h: 'วัน เดือน ปี', w: 12, t: 'date', v: (x) => x.date },
      { h: 'เลขที่ใบกำกับภาษี', w: 18, t: 'text', v: (x) => x.no },
      { h: 'ชื่อผู้ซื้อสินค้า/ผู้รับบริการ', w: 32, t: 'text', v: (x) => (x.status === 'void' ? 'ยกเลิก' : x.buyer ? x.buyer.name : 'ขายปลีก (ใบกำกับภาษีอย่างย่อ)') },
      { h: 'เลขประจำตัวผู้เสียภาษีของผู้ซื้อ', w: 20, t: 'text', v: (x) => (x.buyer && x.buyer.taxId) || '-' },
      { h: 'สถานประกอบการ', w: 16, t: 'text', v: (x) => (x.buyer && x.buyer.branch) || '-' },
      { h: 'มูลค่าสินค้าหรือบริการ', w: 18, t: 'money', v: (x) => (x.status === 'void' ? 0 : x.base) },
      { h: 'จำนวนเงินภาษีมูลค่าเพิ่ม', w: 18, t: 'money', v: (x) => (x.status === 'void' ? 0 : x.vat) },
    ], rows: rep.rows }] }]);
  }
})(window.App);
