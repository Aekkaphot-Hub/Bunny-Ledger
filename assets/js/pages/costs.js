/* หน้า: ต้นทุน & กำไรจริง
   แท็บ กำไร (รายเดือน) • ต้นทุนสินค้า (SKU) • จับคู่สินค้า (ชื่อสินค้า+ตัวเลือก → SKU) */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary, C = A.calc;
  const K = () => A.costing;
  const state = { tab: 'profit', month: null, pf: '', onlyMissing: false, mapFilter: 'todo', q: '', shown: 60 };

  A.pages.costs = {
    desc: 'ตั้งต้นทุนต่อ SKU แล้วโปรแกรมคิดต้นทุนและกำไรของทุกออเดอร์ให้เอง',
    render(el, params) {
      if (params.get('tab')) state.tab = params.get('tab');
      if (params.toString()) history.replaceState(null, '', '#/costs');
      if (!state.month) state.month = U.monthStart(U.today());
      draw(el);
    },
  };

  const skuOptions = (sel, empty) => `<option value="">${empty}</option>${K().skus().map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${U.esc(s.name)} (${U.money0(s.cost)})</option>`).join('')}`;
  const income = (o, st) => (C.isPaid(o) ? U.sum(C.payoutParts(o), (p) => p.amount || 0) : A.isVoid(o.status) ? 0 : C.expected(o, st));

  function draw(el) {
    A.charts.reset();
    const k = K();
    const blocked = A.sync && A.sync.blocked && A.sync.blocked().includes('products');
    const tabs = [['profit', 'กำไรรายออเดอร์', 'sparkle'], ['skus', 'ต้นทุนสินค้า (SKU)', 'box'], ['map', 'จับคู่สินค้า', 'link']];
    el.innerHTML = `
      ${blocked ? `<div class="notice warn">${A.icon('alert')}<div>ข้อมูลต้นทุนยังไม่ซิงก์ขึ้นคลาวด์ — เจ้าของร้านต้องเผยแพร่ <b>firestore.rules</b> ฉบับใหม่ใน Firebase Console ก่อน (ดูคู่มือตั้งค่า Firebase) ระหว่างนี้ข้อมูลเก็บในเครื่องนี้ตามปกติ</div></div>` : ''}
      <div class="card ${blocked ? 'mt' : ''}">
        <div class="row">
          <div class="tabs">${tabs.map(([id, l, ic]) => `<button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">${A.icon(ic)} ${l}</button>`).join('')}</div>
          <span class="spacer"></span>
          <button class="btn ghost sm" id="learn">${A.icon('upload')} เรียนรู้จากไฟล์ Excel ที่จดเอง</button>
          <input type="file" id="learn-in" accept=".xlsx,.xls" class="hidden">
        </div>
      </div>
      <div id="tab-body" class="mt"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; state.shown = 60; draw(el); }; });
    const fi = el.querySelector('#learn-in');
    el.querySelector('#learn').onclick = () => fi.click();
    fi.onchange = () => { if (fi.files[0]) learn(el, fi.files[0]); fi.value = ''; };
    const body = el.querySelector('#tab-body');
    if (!k.active() && state.tab !== 'skus') {
      body.innerHTML = `<div class="card">${ui.empty('ยังไม่ได้ตั้งต้นทุนสินค้า',
        'เริ่มได้ 2 ทาง: <b>เรียนรู้จากไฟล์ Excel ที่จดเอง</b> (โปรแกรมอ่านชีตราคาทุน และชีตที่มีคอลัมน์ สินค้า / ตัวเลือก / sku แล้วจับคู่ให้เอง) หรือ <b>เพิ่ม SKU เอง</b> แล้วจับคู่กับสินค้าที่ขาย<br><span class="small muted">ออเดอร์ต้องนำเข้าจาก<b>ไฟล์คำสั่งซื้อ</b> (มีชื่อสินค้า + ตัวเลือก) ถ้านำเข้าไว้ก่อนอัปเดตนี้ ให้นำเข้าไฟล์คำสั่งซื้อซ้ำอีกครั้ง</span>',
        `<div class="row" style="justify-content:center"><button class="btn" id="e-learn">${A.icon('upload')} เรียนรู้จากไฟล์ที่จดเอง</button><button class="btn ghost" id="e-add">${A.icon('plus')} เพิ่ม SKU เอง</button></div>`)}</div>`;
      body.querySelector('#e-learn').onclick = () => fi.click();
      body.querySelector('#e-add').onclick = () => { state.tab = 'skus'; draw(el); };
      return;
    }
    if (state.tab === 'profit') drawProfit(el, body);
    else if (state.tab === 'skus') drawSkus(el, body);
    else drawMap(el, body);
  }

  /* ---------- กำไรรายออเดอร์ ---------- */
  function drawProfit(el, body) {
    const st = A.settings(), k = K();
    const from = state.month, to = U.monthEnd(from);
    const f = { platform: state.pf || undefined };
    const t = S.range(from, to, f);
    const orders = S.items(from, to, f).orders.map((o) => {
      const c = k.orderCost(o, st);
      const inc = income(o, st);
      return { o, c, inc, profit: inc - c.cost };
    });
    const missing = orders.filter((x) => x.c.counted && x.c.missing);
    const bySku = new Map();
    orders.forEach((x) => {
      if (!x.c.counted) return;
      (x.o.lines || []).forEach((l) => {
        const r = k.lookup(l);
        const key = r && r.sku ? r.sku.id : '';
        const cur = bySku.get(key) || { name: r && r.sku ? r.sku.name : 'ยังไม่จับคู่', unit: r && r.sku ? r.sku.cost : null, qty: 0, cost: 0 };
        cur.qty += l.q || 0; cur.cost += r && r.sku ? (r.sku.cost || 0) * (l.q || 0) : 0;
        bySku.set(key, cur);
      });
    });
    const skuRows = [...bySku.values()].sort((a, b) => b.cost - a.cost);
    const costExp = A.db.all('expenses').filter((e) => e.date >= from && e.date <= to && /ต้นทุน/.test(e.category || ''));
    const list = state.onlyMissing ? missing : orders;
    const margin = t.sales ? t.gross / t.sales : 0;
    body.innerHTML = `
      <div class="card">
        <div class="row">
          <button class="icon-btn" id="m-prev">${A.icon('chevL')}</button>
          <input class="input" type="month" id="m-pick" value="${from.slice(0, 7)}">
          <button class="icon-btn" id="m-next">${A.icon('chevR')}</button>
          ${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}
          <span class="spacer"></span>
          <label class="check"><input type="checkbox" id="on-return" ${st.cost.onReturn ? 'checked' : ''}> นับต้นทุนออเดอร์ที่คืนสินค้าด้วย</label>
          <button class="btn ghost sm" id="xl">${A.icon('download')} ส่งออก Excel</button>
        </div>
      </div>
      ${costExp.length ? `<div class="notice warn mt">${A.icon('alert')}<div>เดือนนี้มีรายจ่ายหมวด "ต้นทุนสินค้า" ${U.money(U.sum(costExp, (e) => e.amount))} — กำไรจะหักต้นทุนซ้ำ ถ้ารายจ่ายนั้นคือค่าซื้อของที่ขายไปแล้ว (โปรแกรมหักต้นทุนตามออเดอร์ให้แล้ว)</div></div>` : ''}
      ${missing.length ? `<div class="notice warn mt">${A.icon('alert')}<div><b>${U.num(missing.length)} ออเดอร์ยังไม่รู้ต้นทุน</b> — ${missing.filter((x) => x.c.noLines).length ? `${U.num(missing.filter((x) => x.c.noLines).length)} ออเดอร์ไม่มีรายการสินค้า (นำเข้าไฟล์คำสั่งซื้อของช่วงนี้) ` : ''}${missing.filter((x) => !x.c.noLines).length ? `${U.num(missing.filter((x) => !x.c.noLines).length)} ออเดอร์มีสินค้าที่ยังไม่จับคู่ SKU <a href="#/costs?tab=map">ไปจับคู่ →</a>` : ''}</div></div>` : ''}
      <div class="kpis mt">
        ${ui.kpi({ label: 'ยอดขาย', value: U.money(t.sales), foot: `${U.num(t.orders)} ออเดอร์ (นับตามวันส่ง)`, icon: 'heart', tone: 'pink' })}
        ${ui.kpi({ label: 'ค่าธรรมเนียมแพลตฟอร์ม', value: U.money(t.fees), foot: t.sales ? `${U.pct(t.fees / t.sales)} ของยอดขาย` : '', icon: 'tag', tone: 'butter' })}
        ${ui.kpi({ label: 'ต้นทุนสินค้า', value: U.money(t.cogs), foot: t.sales ? `${U.pct(t.cogs / t.sales)} ของยอดขาย${t.cogsMissing ? ` • ขาด ${U.num(t.cogsMissing)} ออเดอร์` : ''}` : '', icon: 'box', tone: 'blue' })}
        ${ui.kpi({ label: 'กำไรขั้นต้น (ขาย − ค่าธรรมเนียม − ต้นทุน)', value: U.money(t.gross), foot: `อัตรากำไร ${U.pct(margin)}`, icon: 'sparkle', tone: 'mint' })}
        ${ui.kpi({ label: 'กำไรสุทธิ (หักรายจ่าย + รายรับอื่น)', value: U.money(t.profit), foot: `รายจ่าย ${U.money0(t.expenses)} • รายรับอื่น ${U.money0(t.otherIncome)}`, icon: 'wallet', tone: 'mint' })}
      </div>
      <div class="grid g-1-2 mt">
        <div class="card">
          <div class="card-head"><h3>${A.icon('box')} ต้นทุนตาม SKU</h3><span class="sub">${U.thMonth(from)}</span></div>
          ${ui.table([
            { h: 'SKU', v: (r) => (r.unit == null ? `<span class="badge b-red">${r.name}</span>` : U.esc(r.name)) },
            { h: 'ชิ้น', cls: 'num', v: (r) => U.num(r.qty) },
            { h: 'ต้นทุนรวม', cls: 'num', v: (r) => (r.unit == null ? '–' : U.money(r.cost)) },
          ], skuRows, { empty: 'ยังไม่มีออเดอร์ที่มีรายการสินค้าในเดือนนี้', foot: [{ v: 'รวม' }, { cls: 'num', v: U.num(U.sum(skuRows, (r) => r.qty)) }, { cls: 'num', v: U.money(U.sum(skuRows, (r) => r.cost)) }] })}
        </div>
        <div class="card">
          <div class="card-head">
            <h3>${A.icon('file')} กำไรรายออเดอร์</h3>
            <label class="check"><input type="checkbox" id="only-miss" ${state.onlyMissing ? 'checked' : ''}> เฉพาะที่ยังไม่รู้ต้นทุน</label>
          </div>
          ${ui.table([
            { h: 'วันที่ส่ง', v: (x) => U.thDate(S.dayOf(x.o)) },
            { h: 'แพลตฟอร์ม', v: (x) => ui.pf(x.o.platform) },
            { h: 'เลขคำสั่งซื้อ', v: (x) => U.esc(x.o.orderNo) + (A.isVoid(x.o.status) ? ` ${ui.status(x.o.status)}` : '') },
            { h: 'ชิ้น', cls: 'num', v: (x) => U.num(U.sum(x.o.lines || [], (l) => l.q || 0) || x.o.qty || 0) },
            { h: 'เงินเข้า', cls: 'num', v: (x) => U.money(x.inc) + (C.isPaid(x.o) ? '' : ' <span class="badge b-butter">รอ</span>') },
            { h: 'ต้นทุน', cls: 'num', v: (x) => (!x.c.counted ? '<span class="muted small">ไม่นับ</span>' : x.c.missing ? `<span class="badge b-red">${x.c.noLines ? 'ไม่มีรายการสินค้า' : 'ยังไม่จับคู่'}</span>` : U.money(x.c.cost)) },
            { h: 'กำไร', cls: 'num', v: (x) => (x.c.counted && x.c.missing ? '–' : `<b class="${x.profit < 0 ? 'delta-down' : ''}">${U.money(x.profit)}</b>`) },
          ], list, { onRow: true, max: 400, empty: state.onlyMissing ? 'ทุกออเดอร์รู้ต้นทุนแล้ว 🎉' : 'ไม่มีออเดอร์ในเดือนนี้',
            foot: [{ v: 'รวม' }, { v: '' }, { v: `${U.num(list.length)} ออเดอร์` }, { v: '' }, { cls: 'num', v: U.money(U.sum(list, (x) => x.inc)) }, { cls: 'num', v: U.money(U.sum(list, (x) => (x.c.counted ? x.c.cost : 0))) }, { cls: 'num', v: U.money(U.sum(list.filter((x) => !(x.c.counted && x.c.missing)), (x) => x.profit)) }] })}
        </div>
      </div>`;
    body.querySelector('#m-prev').onclick = () => { state.month = U.addMonths(state.month, -1); draw(el); };
    body.querySelector('#m-next').onclick = () => { state.month = U.addMonths(state.month, 1); draw(el); };
    body.querySelector('#m-pick').onchange = (e) => { if (e.target.value) { state.month = e.target.value + '-01'; draw(el); } };
    body.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; draw(el); };
    body.querySelector('#only-miss').onchange = (e) => { state.onlyMissing = e.target.checked; draw(el); };
    body.querySelector('#on-return').onchange = async (e) => { await A.saveSettings({ cost: { ...st.cost, onReturn: e.target.checked } }); draw(el); };
    body.querySelector('#xl').onclick = () => exportProfit(from, to, orders, skuRows, t);
    const card = body.querySelectorAll('.card')[2];
    ui.bindRows(card, list, (x) => linesModal(el, x.o));
  }

  /* หน้าต่างรายการสินค้าในออเดอร์ — จับคู่ SKU ได้ทันที */
  function linesModal(el, o) {
    const k = K();
    const lines = o.lines || [];
    const body = lines.length ? `
      <p class="muted small">${ui.pf(o.platform)} ${U.esc(o.orderNo)} • ${ui.status(o.status)}</p>
      ${lines.map((l, i) => {
        const r = k.lookup(l);
        return `<div class="card mt-s" style="padding:12px">
          <div><b>${U.esc(l.n)}</b></div>
          <div class="small muted">ตัวเลือก: ${U.esc(l.v || '–')} • จำนวน ${U.num(l.q)}${l.s ? ` • SKU ผู้ขาย ${U.esc(l.s)}` : ''}</div>
          <div class="row mt-s">
            <select class="input" data-line="${i}">${skuOptions(r && r.sku ? r.sku.id : '', '— เลือก SKU —')}</select>
            <label class="check small"><input type="checkbox" data-whole="${i}" ${r && r.how === 'product' ? 'checked' : ''}> ใช้กับทุกตัวเลือกของสินค้านี้</label>
          </div>
        </div>`;
      }).join('')}` : '<p>ออเดอร์นี้ยังไม่มีรายการสินค้า — นำเข้า<b>ไฟล์คำสั่งซื้อ</b>ที่มีออเดอร์นี้ แล้วโปรแกรมจะรู้ชื่อสินค้าและตัวเลือก</p>';
    ui.modal({
      title: 'รายการสินค้า & ต้นทุน', body, wide: true,
      actions: [
        { label: 'รายละเอียดออเดอร์', cls: 'ghost', onClick: () => { ui.orderModal(o.id); } },
        ...(lines.length ? [{ label: `${A.icon('check')} บันทึกการจับคู่`, onClick: async (_c, root) => {
          for (let i = 0; i < lines.length; i++) {
            const sku = root.querySelector(`[data-line="${i}"]`).value;
            const whole = root.querySelector(`[data-whole="${i}"]`).checked;
            if (!sku) continue;
            if (whole) { await k.setMap(lines[i].n, '*', sku); await k.setMap(lines[i].n, lines[i].v || '', ''); } else await k.setMap(lines[i].n, lines[i].v || '', sku);
          }
          ui.toast('บันทึกการจับคู่แล้ว', 'ok');
          draw(el);
        } }] : []),
      ],
    });
  }

  function exportProfit(from, to, orders, skuRows, t) {
    const st = A.settings();
    A.exportSheets(`ต้นทุนกำไร_${st.shopName}_${from.slice(0, 7)}.xlsx`, [
      { name: 'สรุปกำไร', title: `ต้นทุน & กำไร — ${st.shopName}`, sub: `${U.thMonth(from)}${state.pf ? ' • ' + A.PLATFORMS[state.pf].name : ''} • นับตามวันที่ส่งสินค้า`, tables: [
        { cols: [{ h: 'รายการ', w: 40, t: 'text', v: (r) => r[0] }, { h: 'จำนวนเงิน', w: 18, t: 'money', v: (r) => U.round2(r[1]) }], totals: false, rows: [
          ['ยอดขาย', t.sales], ['ค่าธรรมเนียมแพลตฟอร์ม', t.fees], ['ต้นทุนสินค้า', t.cogs], ['กำไรขั้นต้น', t.gross], ['รายจ่าย', t.expenses], ['รายรับอื่นๆ', t.otherIncome], ['กำไรสุทธิ', t.profit]] },
        { title: 'ต้นทุนตาม SKU', fill: 'blue', cols: [{ h: 'SKU', w: 40, t: 'text', v: (r) => r.name }, { h: 'ต้นทุนต่อชิ้น', w: 18, t: 'money', v: (r) => r.unit }, { h: 'ชิ้น', w: 10, t: 'int', v: (r) => r.qty }, { h: 'ต้นทุนรวม', w: 18, t: 'money', v: (r) => U.round2(r.cost) }], rows: skuRows },
      ] },
      { name: 'กำไรรายออเดอร์', title: 'กำไรรายออเดอร์', sub: U.thMonth(from), tables: [{ cols: [
        { h: 'วันที่ส่ง', w: 12, t: 'date', v: (x) => S.dayOf(x.o) },
        { h: 'แพลตฟอร์ม', w: 10, t: 'text', v: (x) => A.PLATFORMS[x.o.platform].name },
        { h: 'เลขคำสั่งซื้อ', w: 22, t: 'text', v: (x) => x.o.orderNo },
        { h: 'สถานะ', w: 14, t: 'text', v: (x) => (A.STATUS[x.o.status] || {}).label || '' },
        { h: 'สินค้า', w: 40, t: 'text', v: (x) => (x.o.lines || []).map((l) => `${l.n}${l.v ? ` (${l.v})` : ''} ×${l.q}`).join(' | ') },
        { h: 'เงินเข้า', t: 'money', v: (x) => U.round2(x.inc) },
        { h: 'ต้นทุน', t: 'money', v: (x) => (x.c.counted ? x.c.cost : 0) },
        { h: 'กำไร', t: 'money', v: (x) => U.round2(x.profit) },
        { h: 'หมายเหตุ', w: 20, t: 'text', v: (x) => (!x.c.counted ? 'ไม่นับต้นทุน' : x.c.noLines ? 'ไม่มีรายการสินค้า' : x.c.missing ? 'มีสินค้ายังไม่จับคู่' : '') },
      ], rows: orders }] },
    ]);
  }

  /* ---------- ต้นทุนสินค้า (SKU) ---------- */
  function drawSkus(el, body) {
    const k = K();
    const combos = k.combos();
    const use = new Map();
    combos.forEach((c) => { if (c.hit && c.hit.sku) { const u = use.get(c.hit.sku.id) || { combos: 0, qty: 0 }; u.combos++; u.qty += c.qty; use.set(c.hit.sku.id, u); } });
    const skus = k.skus();
    body.innerHTML = `
      <div class="grid g-1-2">
        <div class="card tone-blue">
          <div class="card-head"><h3>${A.icon('plus')} เพิ่ม SKU</h3></div>
          <form id="sku-frm" class="form-grid">
            <div class="field"><label>ชื่อ SKU / กลุ่มสินค้า</label><input class="input" name="name" required placeholder="เช่น ชุดไซส์เล็ก"></div>
            <div class="field"><label>ต้นทุนต่อชิ้น (บาท)</label><input class="input" name="cost" type="number" step="0.01" min="0" required placeholder="0.00"></div>
            <button class="btn" type="submit">${A.icon('check')} เพิ่ม</button>
          </form>
          <p class="small muted mt">SKU คือกลุ่มสินค้าที่ต้นทุนเท่ากัน เช่น "ชุดไซส์เล็ก" ใช้กับหลายสินค้าได้ จากนั้นไปที่แท็บ <b>จับคู่สินค้า</b> เพื่อบอกว่าสินค้าไหนเป็น SKU อะไร</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>${A.icon('box')} ต้นทุนสินค้า ${U.num(skus.length)} SKU</h3><span class="sub">แก้ตัวเลขแล้วกด Enter หรือคลิกที่อื่นเพื่อบันทึก</span></div>
          ${ui.table([
            { h: 'SKU', v: (s) => `<input class="input" data-name="${s.id}" value="${U.esc(s.name)}">` },
            { h: 'ต้นทุน/ชิ้น', cls: 'num', v: (s) => `<input class="input num" style="max-width:120px" type="number" step="0.01" min="0" data-cost="${s.id}" value="${s.cost}">` },
            { h: 'จับคู่กับ', cls: 'num', v: (s) => `${U.num((use.get(s.id) || {}).combos || 0)} รายการ` },
            { h: 'ขายไปแล้ว', cls: 'num', v: (s) => `${U.num((use.get(s.id) || {}).qty || 0)} ชิ้น` },
            { h: '', v: (s) => `<button class="icon-btn" data-del="${s.id}" title="ลบ">${A.icon('trash')}</button>` },
          ], skus, { empty: 'ยังไม่มี SKU' })}
        </div>
      </div>`;
    body.querySelector('#sku-frm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await k.saveSku(fd.get('name'), fd.get('cost')); ui.toast('เพิ่ม SKU แล้ว', 'ok'); draw(el); } catch (err) { ui.toast(err.message, 'err'); }
    };
    body.querySelectorAll('[data-cost], [data-name]').forEach((inp) => {
      inp.onchange = async () => {
        const id = inp.dataset.cost || inp.dataset.name;
        const s = A.db.get('products', id);
        const name = body.querySelector(`[data-name="${id}"]`).value.trim();
        const cost = parseFloat(body.querySelector(`[data-cost="${id}"]`).value);
        if (!name || isNaN(cost) || cost < 0) { ui.toast('ใส่ชื่อและต้นทุนให้ถูกต้องนะ', 'err'); return; }
        await A.db.put('products', { ...s, name, cost: U.round2(cost) });
        ui.toast(`บันทึก ${name} = ${U.money(cost)}`, 'ok');
      };
    });
    body.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const s = A.db.get('products', b.dataset.del);
        const maps = A.db.all('products').filter((x) => x.kind === 'map' && x.sku === s.id);
        if (!(await ui.confirm(`ลบ SKU "${s.name}"?`, `สินค้าที่จับคู่กับ SKU นี้ ${maps.length} รายการ จะกลับเป็น "ยังไม่จับคู่"`, 'ลบ', true))) return;
        await A.db.removeMany('products', [s.id, ...maps.map((m) => m.id)]);
        ui.toast('ลบแล้ว'); draw(el);
      };
    });
  }

  /* ---------- จับคู่สินค้า ---------- */
  function drawMap(el, body) {
    const k = K();
    const all = k.combos().filter((c) => !state.pf || c.pf.includes(state.pf));
    const q = k.normN(state.q);
    const groups = new Map();
    all.forEach((c) => {
      const g = k.normN(c.n);
      if (q && !g.includes(q) && !k.normN(c.v).includes(q)) return;
      const cur = groups.get(g) || { n: c.n, items: [], qty: 0, todo: 0, pf: new Set() };
      cur.items.push(c); cur.qty += c.qty; if (!c.hit) cur.todo++; c.pf.forEach((p) => cur.pf.add(p));
      groups.set(g, cur);
    });
    let list = [...groups.values()];
    if (state.mapFilter === 'todo') list = list.filter((g) => g.todo);
    list.sort((a, b) => (b.todo ? 1 : 0) - (a.todo ? 1 : 0) || b.qty - a.qty);
    const totalTodo = all.filter((c) => !c.hit);
    const shown = list.slice(0, state.shown);
    const ix = k.index();
    body.innerHTML = `
      <div class="card">
        <div class="row">
          <div class="tabs"><button class="tab ${state.mapFilter === 'todo' ? 'active' : ''}" data-mf="todo">ยังไม่จับคู่ <span class="count">${U.num(totalTodo.length)}</span></button><button class="tab ${state.mapFilter === 'all' ? 'active' : ''}" data-mf="all">ทั้งหมด <span class="count">${U.num(all.length)}</span></button></div>
          <input class="input" id="q" placeholder="ค้นหาชื่อสินค้า / ตัวเลือก" value="${U.esc(state.q)}" style="min-width:220px">
          ${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}
          <span class="spacer"></span>
          <span class="small muted">ชิ้นที่ยังไม่รู้ต้นทุน ${U.num(U.sum(totalTodo, (c) => c.qty))} จาก ${U.num(U.sum(all, (c) => c.qty))} ชิ้น</span>
        </div>
        <p class="small muted mt-s">เลือก SKU ที่ช่อง <b>ทุกตัวเลือก</b> ถ้าสินค้านั้นต้นทุนเท่ากันทุกสี/ไซส์ • ถ้าบางไซส์ต้นทุนต่าง (เช่น ไซส์ 48–52) ให้เลือก SKU ที่แถวตัวเลือกนั้นแยก</p>
      </div>
      ${!ix.skus.size ? `<div class="notice warn mt">${A.icon('alert')}<div>ยังไม่มี SKU — เพิ่มที่แท็บ "ต้นทุนสินค้า (SKU)" ก่อน</div></div>` : ''}
      ${shown.length ? shown.map((g, gi) => {
        const whole = ix.maps.get(k.key(g.n, '*'));
        const rows = state.mapFilter === 'todo' ? g.items.filter((c) => !c.hit) : g.items;
        return `<div class="card mt-s">
          <div class="row">
            <div style="flex:1;min-width:240px"><b>${U.esc(g.n)}</b><div class="small muted">${[...g.pf].map((p) => A.PLATFORMS[p].name).join(', ')} • ขาย ${U.num(g.qty)} ชิ้น • ${U.num(g.items.length)} ตัวเลือก${g.todo ? ` • <span class="delta-down">ยังไม่จับคู่ ${g.todo}</span>` : ''}</div></div>
            <label class="small muted">ทุกตัวเลือก</label>
            <select class="input" data-whole="${gi}" style="max-width:260px">${skuOptions(whole ? whole.sku : '', '— ไม่ได้ตั้ง —')}</select>
          </div>
          <div class="table-wrap mt-s"><table class="tbl"><tbody>
            ${rows.slice(0, 40).map((c, ci) => {
              const ex = ix.maps.get(k.key(c.n, c.v));
              return `<tr><td>${U.esc(c.v || '(ไม่มีตัวเลือก)')}${c.s ? ` <span class="small muted">SKU ${U.esc(c.s)}</span>` : ''}</td><td class="num small muted">${U.num(c.qty)} ชิ้น</td>
                <td style="width:280px"><select class="input" data-var="${gi}:${g.items.indexOf(c)}">${skuOptions(ex ? ex.sku : '', whole ? '— ใช้ตามทุกตัวเลือก —' : c.hit && c.hit.how === 'sellerSku' ? `— ตาม SKU ผู้ขาย (${U.esc(c.hit.sku.name)}) —` : '— ยังไม่จับคู่ —')}</select></td></tr>`;
            }).join('')}
            ${rows.length > 40 ? `<tr><td colspan="3" class="small muted">… อีก ${rows.length - 40} ตัวเลือก (ตั้งที่ช่อง "ทุกตัวเลือก" หรือค้นหาให้แคบลง)</td></tr>` : ''}
          </tbody></table></div>
        </div>`;
      }).join('') : `<div class="card mt-s">${ui.empty(state.mapFilter === 'todo' ? 'จับคู่ครบทุกสินค้าแล้ว 🎉' : 'ยังไม่มีรายการสินค้า', state.mapFilter === 'todo' ? 'ทุกออเดอร์ที่มีรายการสินค้ารู้ต้นทุนแล้ว' : 'นำเข้าไฟล์คำสั่งซื้อจาก Seller Center ก่อน โปรแกรมจะเก็บชื่อสินค้าและตัวเลือกไว้ให้จับคู่')}</div>`}
      ${list.length > shown.length ? `<div class="row mt" style="justify-content:center"><button class="btn ghost" id="more">แสดงเพิ่ม (${U.num(list.length - shown.length)} สินค้า)</button></div>` : ''}`;
    body.querySelectorAll('[data-mf]').forEach((b) => { b.onclick = () => { state.mapFilter = b.dataset.mf; state.shown = 60; draw(el); }; });
    body.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; draw(el); };
    const qi = body.querySelector('#q');
    qi.oninput = U.debounce(() => { state.q = qi.value; state.shown = 60; draw(el); const n = el.querySelector('#q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 350);
    const more = body.querySelector('#more');
    if (more) more.onclick = () => { state.shown += 60; draw(el); };
    body.querySelectorAll('[data-whole]').forEach((s) => {
      s.onchange = async () => { const g = shown[+s.dataset.whole]; await k.setMap(g.n, '*', s.value); ui.toast('บันทึกแล้ว', 'ok'); draw(el); };
    });
    body.querySelectorAll('[data-var]').forEach((s) => {
      s.onchange = async () => { const [gi, ci] = s.dataset.var.split(':').map(Number); const c = shown[gi].items[ci]; await k.setMap(c.n, c.v, s.value); ui.toast('บันทึกแล้ว', 'ok'); draw(el); };
    });
  }

  /* ---------- เรียนรู้จากไฟล์ที่จดเอง ---------- */
  async function learn(el, file) {
    let res;
    try { res = await K().learn(file); } catch (e) { ui.toast(e.message || String(e), 'err'); return; }
    if (!res.sheets.length) { ui.toast('ไม่พบชีตที่มีคอลัมน์ SKU / สินค้า / ตัวเลือก ในไฟล์นี้', 'err'); return; }
    const ix = K().index();
    const newSku = res.costs.filter((c) => !ix.bySkuName.has(K().normSku(c.name)));
    const claimsN = res.claims.length;
    ui.modal({
      title: 'เรียนรู้จากไฟล์ที่จดเอง', wide: true,
      body: `
        <p class="small muted">${U.esc(file.name)} • อ่านเฉพาะคอลัมน์ชื่อสินค้า ตัวเลือก SKU ต้นทุน และเรื่องเคลม (ไม่อ่านข้อมูลลูกค้า)</p>
        <ul class="small">${res.sheets.map((s) => `<li>ชีต <b>${U.esc(s.name)}</b> — ${s.kind === 'costs' ? `ต้นทุน ${s.n} SKU` : s.kind === 'claims' ? `สินค้ามีปัญหา ${s.n} รายการ` : `รายการขาย ${U.num(s.n)} แถว`}</li>`).join('')}</ul>
        <div class="kpis mt-s">
          ${ui.kpi({ label: 'SKU + ต้นทุน', value: U.num(res.costs.length), foot: `ใหม่ ${newSku.length}${res.costs.some((c) => c.guessed) ? ` • เดาจากชีตขาย ${res.costs.filter((c) => c.guessed).length}` : ''}`, icon: 'box', tone: 'blue' })}
          ${ui.kpi({ label: 'จับคู่ชื่อสินค้า + ตัวเลือก', value: U.num(res.maps.length), foot: res.conflicts ? `${res.conflicts} รายการเคยจดไว้หลาย SKU → ใช้อันที่จดบ่อยสุด` : 'ไม่มีขัดแย้ง', icon: 'link', tone: 'mint' })}
          ${claimsN ? ui.kpi({ label: 'เรื่องเคลม', value: U.num(claimsN), foot: 'ไปที่หน้า ออเดอร์มีปัญหา & เคลม', icon: 'alert', tone: 'pink' }) : ''}
        </div>
        <div class="table-wrap mt-s tbl-scroll" style="max-height:220px"><table class="tbl"><thead><tr><th>SKU</th><th class="num">ต้นทุน/ชิ้น</th></tr></thead><tbody>
          ${res.costs.map((c) => `<tr><td>${U.esc(c.name)}${c.guessed ? ' <span class="badge b-butter">เดาจากชีตขาย</span>' : ''}${ix.bySkuName.has(K().normSku(c.name)) ? ' <span class="badge b-grey">มีแล้ว</span>' : ''}</td><td class="num">${U.money(c.cost)}</td></tr>`).join('')}
        </tbody></table></div>
        <label class="check mt"><input type="checkbox" data-over> เขียนทับต้นทุนและการจับคู่ที่ตั้งไว้แล้ว</label>
        ${claimsN ? `<label class="check"><input type="checkbox" data-claims checked> นำเข้าเรื่องเคลม ${claimsN} รายการด้วย</label>` : ''}`,
      actions: [
        { label: 'ยกเลิก', cls: 'ghost' },
        { label: `${A.icon('check')} บันทึก`, onClick: async (_c, root) => {
          const r = await K().applyLearn(res, { overwrite: root.querySelector('[data-over]').checked });
          let msg = `บันทึก SKU ${r.skus} • จับคู่ ${U.num(r.maps)} รายการ`;
          const cb = root.querySelector('[data-claims]');
          if (cb && cb.checked && A.claimsLib) { const n = await A.claimsLib.importRows(res.claims); msg += ` • เคลม ${n} รายการ`; }
          ui.toast(msg, 'ok');
          draw(el);
        } },
      ],
    });
  }
})(window.App);
