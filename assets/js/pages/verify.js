/* เครื่องมือ: อ้างอิงข้อมูล — เทียบข้อมูลในโปรแกรมกับไฟล์จริงจาก Seller Center (อ่านอย่างเดียว ไม่บันทึก)
   - เทียบรายออเดอร์: ตรง / ยอดต่าง / ไม่มีในโปรแกรม / มีในโปรแกรมแต่ไม่มีในไฟล์
   - เทียบยอดรวมกับหน้าสรุปของแพลตฟอร์ม (Shopee: Summary • TikTok: รายงาน)
   - ดูรายละเอียดทีละบรรทัดของไฟล์ (เช่น 1 ออเดอร์มี 2 สินค้า) และส่งออกผลเทียบเป็น Excel */
(function (A) {
  const U = A.U, ui = A.ui, I = A.importers, C = A.calc;
  const V = {};
  const EPS = 0.009;
  const cleanId = (v) => String(v == null ? '' : v).trim().replace(/^'+/, '').replace(/\.0+$/, '');
  const STATUS = {
    ok: ['ตรงกัน', 'b-green'],
    diff: ['ยอดไม่ตรง', 'b-red'],
    missing: ['ไม่มีในโปรแกรม', 'b-butter'],
    unpaid: ['โปรแกรมยังไม่มีเงินเข้า', 'b-butter'],
    extra: ['มีในโปรแกรม แต่ไม่มีในไฟล์นี้', 'b-blue'],
  };

  /* บรรทัดในไฟล์ของแต่ละออเดอร์ (ไว้ดูรายละเอียด) */
  function fileLines(parsed, report, mapping) {
    const by = new Map();
    const m = mapping;
    const amountCol = m.amount != null ? m.amount : report === 'income' ? m.actualPayout : (m.itemSubtotal != null ? m.itemSubtotal : m.grossSales);
    const dateCol = report === 'income' ? m.payoutDate : (m.shipDate != null ? m.shipDate : m.orderDate);
    const typeCol = m.feeName != null ? m.feeName : m.rowType != null ? m.rowType : m.status;
    const itemCol = m.orderItem != null ? m.orderItem : m.items != null ? m.items : m.sku;
    parsed.rows.slice(parsed.headerIdx + 1).forEach((r) => {
      const id = cleanId(r[m.orderNo]);
      if (!id) return;
      if (!by.has(id)) by.set(id, []);
      by.get(id).push({
        date: dateCol != null ? U.parseDate(r[dateCol]) : null,
        type: typeCol != null ? String(r[typeCol] || '') : '',
        item: itemCol != null ? String(r[itemCol] || '') : '',
        amount: amountCol != null ? U.parseNumber(r[amountCol]) : null,
      });
    });
    return by;
  }

  /* เทียบไฟล์ที่อ่านแล้วกับข้อมูลในโปรแกรม (ไม่บันทึกอะไร) */
  V.compare = (parsed, platform, report, mapping) => {
    const built = I.build(parsed, platform, report, mapping);
    const rows = [];
    const orphan = []; // เงินชดเชยของออเดอร์ที่ยังไม่มีในโปรแกรม (ตอนนำเข้าจะเก็บเป็นรายรับอื่นๆ)
    const recs = built.records.filter((r) => {
      if (r._compOnly && !A.db.get('orders', I.makeId(platform, r.orderNo))) { orphan.push(r._compOnly); return false; }
      return true;
    });
    recs.forEach((r) => {
      const o = A.db.get('orders', I.makeId(platform, r.orderNo));
      const row = { orderNo: r.orderNo, items: r.itemLines || null, o, file: {}, app: {} };
      if (report === 'income') {
        const days = Object.keys(r.parts || {});
        row.file.pay = r.actualPayout;
        row.file.sales = r.grossSales != null ? r.grossSales : null;
        row.days = days;
        if (o && o.actualPayout != null) {
          const parts = o.payoutParts;
          const has = parts ? days.some((d) => parts[d]) : true;
          row.app.pay = parts ? U.round2(U.sum(days, (d) => (parts[d] ? parts[d].pay || 0 : 0))) : o.actualPayout;
          row.status = !has ? 'unpaid' : Math.abs(row.file.pay - row.app.pay) > EPS ? 'diff' : 'ok';
        } else row.status = o ? 'unpaid' : 'missing';
        row.app.sales = o ? o.grossSales : null;
        row.diff = row.app.pay != null ? U.round2(row.app.pay - row.file.pay) : -row.file.pay;
      } else {
        row.file.sales = r.grossSales != null ? r.grossSales : null;
        row.file.status = r.status;
        row.app.sales = o ? o.grossSales : null;
        row.app.status = o ? o.status : null;
        if (!o) row.status = 'missing';
        else if (o.salesFromIncome) { row.status = 'ok'; row.note = 'โปรแกรมใช้ยอดขายจากไฟล์รายได้ (ยอดที่แพลตฟอร์มสรุปจริง)'; }
        else row.status = row.file.sales != null && row.app.sales != null && Math.abs(row.file.sales - row.app.sales) > EPS ? 'diff' : 'ok';
        row.diff = row.app.sales != null && row.file.sales != null ? U.round2(row.app.sales - row.file.sales) : null;
      }
      rows.push(row);
    });
    // มีในโปรแกรม (ช่วงวันเดียวกัน) แต่ไม่มีในไฟล์
    const inFile = new Set(recs.map((r) => r.orderNo));
    let from = null, to = null, extra = [];
    if (report === 'income') {
      const ds = recs.flatMap((r) => Object.keys(r.parts || {})).filter((d) => /^\d{4}-/.test(d)).sort();
      from = ds[0]; to = ds[ds.length - 1];
      if (from) extra = A.db.all('orders').filter((o) => o.platform === platform && !inFile.has(o.orderNo) && C.payoutParts(o).some((p) => p.date >= from && p.date <= to));
    } else {
      const ds = recs.map((r) => r.orderDate).filter(Boolean).sort();
      from = ds[0]; to = ds[ds.length - 1];
      if (from) extra = A.db.all('orders').filter((o) => o.platform === platform && !inFile.has(o.orderNo) && o.orderDate >= from && o.orderDate <= to && o.statusRaw != null);
    }
    extra.forEach((o) => rows.push({
      orderNo: o.orderNo, o, status: 'extra', file: {}, items: o.itemLines || null,
      app: report === 'income' ? { pay: U.round2(U.sum(C.payoutParts(o).filter((p) => p.date >= from && p.date <= to), (p) => p.amount)), sales: o.grossSales } : { sales: o.grossSales, status: o.status },
    }));
    // เงินชดเชยจากแพลตฟอร์ม (บันทึกเป็นรายรับอื่นๆ)
    const adj = (built.adjustments || []).concat(orphan).map((a) => {
      const rec = A.db.get('otherIncome', `adj:${platform}:${a.ref}:${a.date || 'x'}`);
      return { ...a, app: rec ? rec.amount : null, ok: rec && Math.abs(rec.amount - a.amount) <= EPS };
    });
    const sum = (arr, f) => U.round2(U.sum(arr, (x) => f(x) || 0));
    const fileRows = rows.filter((r) => r.status !== 'extra');
    const tot = {
      orders: recs.length, items: built.itemCount, fileLines: built.rowCount,
      filePay: sum(fileRows, (r) => r.file.pay), appPay: sum(rows.filter((r) => r.status !== 'missing'), (r) => r.app.pay),
      fileSales: sum(fileRows, (r) => r.file.sales),
      // ออเดอร์ที่โปรแกรมใช้ยอดขายจากไฟล์รายได้ (แม่นกว่า) นับเป็นตรงกัน แล้วแจ้งส่วนต่างแยกไว้
      appSales: sum(fileRows.filter((r) => r.status !== 'missing'), (r) => (report === 'income' ? null : r.o && r.o.salesFromIncome ? r.file.sales : r.app.sales)),
      incomeSales: fileRows.filter((r) => report !== 'income' && r.o && r.o.salesFromIncome).length,
      incomeSalesDiff: sum(fileRows.filter((r) => report !== 'income' && r.o && r.o.salesFromIncome), (r) => (r.app.sales || 0) - (r.file.sales || 0)),
      fileAdj: sum(adj, (a) => a.amount), appAdj: sum(adj, (a) => a.app),
      // ปรับปรุงยอดที่อยู่ชีตแยก (Shopee: Adjustment) — ยอดสรุปของแพลตฟอร์มไม่รวมส่วนนี้
      extAdj: sum((built.linked || []).concat(adj).filter((a) => a.external), (a) => a.amount),
      count: Object.fromEntries(Object.keys(STATUS).map((k) => [k, rows.filter((r) => r.status === k).length])),
    };
    return { platform, report, built, rows, adj, tot, from, to, summary: parsed.summary, lines: fileLines(parsed, report, mapping) };
  };

  // ---------- หน้าจอ ----------
  const state = { file: null, parsed: null, platform: null, report: null, mapping: null, res: null, tab: 'problem', q: '' };

  A.pages.verify = {
    desc: 'ลากไฟล์จาก Seller Center มาวาง แล้วเทียบกับข้อมูลในโปรแกรมทีละออเดอร์ — ไม่บันทึกทับข้อมูล',
    render(el) { draw(el); },
  };

  async function load(el, file) {
    state.file = file; state.res = null; state.error = null;
    draw(el);
    try {
      state.parsed = await I.readFile(file);
      const tpl = I.findTemplate(state.parsed.headers);
      if (tpl) { state.platform = tpl.platform; state.report = tpl.report; state.mapping = { ...I.autoMap(state.parsed.headers, tpl.report), ...I.templateMapping(tpl, state.parsed.headers) }; }
      else { const d = I.detect(state.parsed.headers, file.name); state.platform = d.platform; state.report = d.report; state.mapping = d.mapping; }
      run();
    } catch (e) { console.error(e); state.error = e.message || String(e); }
    state.tab = 'problem';
    draw(el);
  }
  function run() { state.res = V.compare(state.parsed, state.platform, state.report, state.mapping); }

  function draw(el) {
    const r = state.res;
    el.innerHTML = `
      <div class="grid g-2-1">
        <label class="dropzone" id="dz" style="min-height:0;padding:22px">
          <input type="file" id="file-in" accept=".csv,.xlsx,.xls,.txt" hidden>
          <h3>${A.icon('search')} ${state.file ? `ไฟล์: ${U.esc(state.file.name)} — ลากไฟล์อื่นมาวางเพื่อเทียบใหม่` : 'ลากไฟล์จริงจาก Seller Center มาวาง หรือคลิกเพื่อเลือก'}</h3>
          <p class="muted small">ไฟล์ออเดอร์ หรือไฟล์รายได้/การโอนเงิน ของ Shopee • Lazada • TikTok — โปรแกรมอ่านอย่างเดียว ไม่บันทึกทับข้อมูล และตัดข้อมูลลูกค้าทิ้งเหมือนตอนนำเข้า</p>
        </label>
        <div class="card">
          <div class="card-head"><h3>${A.icon('info')} ใช้ทำอะไร</h3></div>
          <p class="small" style="margin:0">เช็กว่าตัวเลขในโปรแกรมตรงกับไฟล์จริงไหม ถ้าไม่ตรง จะบอกว่าออเดอร์ไหน ต่างกันเท่าไร และกดดูได้ทีละบรรทัดของไฟล์</p>
          <p class="small muted">เลขคำสั่งซื้อแสดงเต็ม เพราะเลขท้ายอาจซ้ำกันได้คนละออเดอร์</p>
        </div>
      </div>
      <div id="out" class="mt">${state.error ? `<div class="notice red">${A.icon('alert')}<div>${U.esc(state.error)}</div></div>` : state.file && !r ? '<p class="muted">กำลังอ่านไฟล์…</p>' : r ? result(r) : ''}</div>`;
    const inp = el.querySelector('#file-in');
    const dz = el.querySelector('#dz');
    inp.onchange = () => { if (inp.files[0]) load(el, inp.files[0]); inp.value = ''; };
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) load(el, e.dataTransfer.files[0]); });
    if (r) bind(el, r);
  }

  const cmp = (label, fileV, appV, { money = true, note = '' } = {}) => {
    const same = fileV != null && appV != null && Math.abs(fileV - appV) <= EPS;
    const fmt = (v) => (v == null ? '–' : money ? U.money(v) : U.num(v));
    return `<div class="kpi tone-${same ? 'mint' : 'pink'}"><span class="k-ic">${A.icon(same ? 'check' : 'alert')}</span>
      <div class="k-label">${label}</div>
      <div class="k-value" style="font-size:20px">${fmt(fileV)}</div>
      <div class="k-foot">ในโปรแกรม <b>${fmt(appV)}</b>${same ? ' • ตรงกัน' : appV != null && fileV != null ? ` • ต่าง <b>${U.money(appV - fileV)}</b>` : ''}${note ? `<br>${note}` : ''}</div></div>`;
  };

  function result(r) {
    const t = r.tot, inc = r.report === 'income';
    const problems = t.count.diff + t.count.missing + t.count.unpaid + t.count.extra;
    const s = r.summary || {};
    const pfTotal = s.payout && inc ? cmp(`ยอดสรุปของ ${A.PLATFORMS[r.platform].name} (${U.esc(s.payout.label)})`, s.payout.value, U.round2(t.appPay + t.appAdj - t.extAdj), { note: `ในไฟล์รวมทุกบรรทัด ${U.money(t.filePay + t.fileAdj - t.extAdj)}${t.fileAdj ? ` (รวมเงินชดเชย ${U.money(t.fileAdj)})` : ''}${t.extAdj ? ` • ไม่รวมเงินปรับปรุงยอด ${U.money(t.extAdj)} จากชีต Adjustment (นับเป็นเงินเข้าของออเดอร์แล้ว)` : ''}` }) : '';
    const list = filtered(r);
    return `
      <div class="card">
        <div class="row">
          <div class="field"><label>แพลตฟอร์ม</label><select class="input" id="v-pf">${A.PF_KEYS.map((k) => `<option value="${k}" ${r.platform === k ? 'selected' : ''}>${A.PLATFORMS[k].name}</option>`).join('')}</select></div>
          <div class="field"><label>ชนิดไฟล์</label><select class="input" id="v-rep"><option value="orders" ${!inc ? 'selected' : ''}>คำสั่งซื้อ (ออเดอร์)</option><option value="income" ${inc ? 'selected' : ''}>รายได้ / การโอนเงิน</option></select></div>
          <span class="spacer"></span>
          <button class="btn ghost" id="v-xl">${A.icon('download')} ส่งออกผลเทียบเป็น Excel</button>
          ${problems && (t.count.missing || t.count.diff || t.count.unpaid) ? `<button class="btn" id="v-import">${A.icon('import')} นำเข้าไฟล์นี้เพื่อแก้ให้ตรง</button>` : ''}
        </div>
        <p class="small muted" style="margin:8px 0 0">${U.num(t.fileLines)} แถวในไฟล์ → ${U.num(t.orders)} ออเดอร์${t.items && t.items !== t.orders ? ` (${U.num(t.items)} รายการสินค้า — 1 ออเดอร์มีได้หลายสินค้า)` : ''}${r.from ? ` • ช่วงวันที่ ${U.thDate(r.from)} – ${U.thDate(r.to)}` : ''}</p>
      </div>
      <div class="notice ${problems ? 'warn' : 'ok'} mt-s">${A.icon(problems ? 'alert' : 'check')}<div>${problems
        ? `พบ ${[t.count.diff && `ยอดไม่ตรง <b>${t.count.diff}</b>`, t.count.missing && `ไม่มีในโปรแกรม <b>${t.count.missing}</b>`, t.count.unpaid && `โปรแกรมยังไม่มีเงินเข้า <b>${t.count.unpaid}</b>`, t.count.extra && `มีในโปรแกรมแต่ไม่มีในไฟล์ <b>${t.count.extra}</b>`].filter(Boolean).join(' • ')} ออเดอร์ — ดูรายละเอียดด้านล่าง`
        : `ตรงกันทุกออเดอร์ (${U.num(t.count.ok)} ออเดอร์)`}</div></div>
      <div class="kpis mt-s">
        ${cmp('จำนวนออเดอร์ในไฟล์', t.orders, t.orders - t.count.missing, { money: false, note: t.items && t.items !== t.orders ? `${U.num(t.items)} รายการสินค้า` : '' })}
        ${inc ? cmp('เงินเข้า (ออเดอร์ในไฟล์นี้)', t.filePay, t.appPay) : cmp('ยอดขาย (ออเดอร์ในไฟล์นี้)', t.fileSales, t.appSales, { note: t.incomeSales ? `${U.num(t.incomeSales)} ออเดอร์ใช้ยอดขายจากไฟล์รายได้แทน (ต่างจากไฟล์ออเดอร์รวม ${U.money(t.incomeSalesDiff)} เช่น คืนเงินบางส่วน)` : '' })}
        ${inc && r.adj.length ? cmp(`เงินชดเชยจากแพลตฟอร์ม (${r.adj.length} รายการ)`, t.fileAdj, t.appAdj, { note: 'บันทึกไว้ที่ รายรับอื่นๆ' }) : ''}
        ${pfTotal}
      </div>
      <div class="card mt">
        <div class="card-head">
          <div class="tabs">${[['problem', 'ต้องตรวจ', problems], ['all', 'ทั้งหมด', r.rows.length], ['ok', 'ตรงกัน', t.count.ok], ['diff', 'ยอดไม่ตรง', t.count.diff], ['missing', 'ไม่มีในโปรแกรม', t.count.missing + t.count.unpaid], ['extra', 'ไม่มีในไฟล์นี้', t.count.extra]]
            .map(([k, l, n]) => `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${l} <span class="count">${n}</span></button>`).join('')}</div>
          <input class="input" id="v-q" placeholder="ค้นหาเลขคำสั่งซื้อ" value="${U.esc(state.q)}" style="max-width:220px">
        </div>
        <div id="v-table">${table(list, inc)}</div>
        <p class="small muted">กดที่แถวเพื่อดูทุกบรรทัดของออเดอร์นั้นในไฟล์</p>
      </div>`;
  }
  function filtered(r) {
    let rows = r.rows;
    if (state.tab === 'problem') rows = rows.filter((x) => x.status !== 'ok');
    else if (state.tab === 'missing') rows = rows.filter((x) => x.status === 'missing' || x.status === 'unpaid');
    else if (state.tab !== 'all') rows = rows.filter((x) => x.status === state.tab);
    if (state.q) rows = rows.filter((x) => x.orderNo.includes(state.q.trim()));
    return rows;
  }
  function table(rows, inc) {
    const k = inc ? 'pay' : 'sales';
    return ui.table([
      { h: 'เลขคำสั่งซื้อ', v: (x) => `<b>${U.esc(x.orderNo)}</b>` },
      { h: 'สินค้า', cls: 'num', v: (x) => (x.items ? `${x.items} รายการ` : '–') },
      { h: inc ? 'เงินเข้า ในไฟล์' : 'ยอดขาย ในไฟล์', cls: 'num', v: (x) => (x.file[k] != null ? U.money(x.file[k]) : '–') },
      { h: 'ในโปรแกรม', cls: 'num', v: (x) => (x.app[k] != null ? U.money(x.app[k]) : '–') },
      { h: 'ส่วนต่าง', cls: 'num', v: (x) => (x.status === 'ok' || x.diff == null ? '' : `<b style="color:#C25A5A">${U.money(x.diff)}</b>`) },
      { h: 'ผลเทียบ', v: (x) => `<span class="badge ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span>${x.note ? `<div class="small muted">${U.esc(x.note)}</div>` : ''}` },
    ], rows, { onRow: true, empty: state.tab === 'problem' ? 'ไม่มีออเดอร์ที่ต้องตรวจ — ตรงกันทั้งหมด' : 'ไม่มีรายการ' });
  }
  function bind(el, r) {
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; draw(el); }; });
    const q = el.querySelector('#v-q');
    q.oninput = U.debounce(() => { state.q = q.value; const box = el.querySelector('#v-table'); box.innerHTML = table(filtered(r), r.report === 'income'); ui.bindRows(box, filtered(r), (x) => lines(r, x)); }, 200);
    ui.bindRows(el.querySelector('#v-table'), filtered(r), (x) => lines(r, x));
    el.querySelector('#v-pf').onchange = (e) => { state.platform = e.target.value; run(); draw(el); };
    el.querySelector('#v-rep').onchange = (e) => { state.report = e.target.value; state.mapping = I.autoMap(state.parsed.headers, state.report); run(); draw(el); };
    el.querySelector('#v-xl').onclick = () => exportXl(r);
    const imp = el.querySelector('#v-import');
    if (imp) imp.onclick = async () => {
      if (!(await ui.confirm('นำเข้าไฟล์นี้?', 'ข้อมูลออเดอร์และเงินเข้าจากไฟล์นี้จะถูกบันทึกทับของเดิม (นำเข้าซ้ำได้ ไม่นับซ้ำ) แล้วเทียบใหม่อีกครั้ง', 'นำเข้า'))) return;
      try {
        const res = await I.commit(r.built, { platform: r.platform, report: r.report, filename: state.file.name });
        ui.toast(`นำเข้าแล้ว: ใหม่ ${U.num(res.created)} • อัปเดต ${U.num(res.updated)} ออเดอร์`, 'ok');
        run(); draw(el);
      } catch (e) { ui.toast('นำเข้าไม่สำเร็จ: ' + e.message, 'err'); }
    };
  }
  function lines(r, x) {
    const ls = r.lines.get(x.orderNo) || [];
    const o = x.o;
    ui.modal({
      title: `ออเดอร์ ${x.orderNo}`,
      wide: true,
      body: `<p style="margin-top:0"><span class="badge ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span> ${x.note ? `<span class="small muted">${U.esc(x.note)}</span>` : ''}</p>
        <h4 style="margin:10px 0 6px">ในไฟล์ (${ls.length} บรรทัด)</h4>
        ${ui.table([
          { h: 'วันที่', v: (l) => (l.date ? U.thDate(l.date) : '–') },
          { h: 'รายการ', v: (l) => U.esc(l.type || '–') },
          { h: 'สินค้า', cls: 'ell', v: (l) => U.esc(l.item || '–') },
          { h: 'จำนวนเงิน', cls: 'num', v: (l) => (l.amount != null ? U.money(l.amount) : '–') },
        ], ls, { empty: 'ไม่มีออเดอร์นี้ในไฟล์', foot: ls.length ? [{ v: 'รวม' }, { v: '' }, { v: '' }, { cls: 'num', v: `<b>${U.money(U.sum(ls, (l) => l.amount || 0))}</b>` }] : null })}
        <h4 style="margin:14px 0 6px">ในโปรแกรม</h4>
        ${o ? `<dl class="kv">
          <dt>สถานะ</dt><dd>${ui.status(o.status)}</dd>
          <dt>ยอดขาย</dt><dd>${U.money(o.grossSales)}</dd>
          <dt>เงินเข้า</dt><dd>${o.actualPayout != null ? `<b>${U.money(o.actualPayout)}</b> ${C.payoutParts(o).map((p) => `<span class="small muted">${U.thDate(p.date)} ${U.money(p.amount)}</span>`).join(' • ')}` : '<span class="badge b-pink">ยังไม่เข้า</span>'}</dd>
          <dt>วันที่ส่ง</dt><dd>${U.thDate(C.saleDate(o))}${C.saleDateEstimated(o) ? ' <span class="small muted">(ไฟล์ไม่มีวันส่ง)</span>' : ''}</dd>
          <dt>ที่มา</dt><dd class="small">${U.esc(o.source || '–')}</dd></dl>` : '<p class="muted">ยังไม่มีออเดอร์นี้ในโปรแกรม — กด "นำเข้าไฟล์นี้เพื่อแก้ให้ตรง"</p>'}`,
    });
  }
  async function exportXl(r) {
    const inc = r.report === 'income';
    const k = inc ? 'pay' : 'sales';
    const name = A.PLATFORMS[r.platform].name;
    const lineRows = [];
    r.lines.forEach((ls, orderNo) => ls.forEach((l) => lineRows.push({ orderNo, ...l })));
    await A.exportSheets(`เทียบข้อมูล_${name}_${state.file.name.replace(/\.[^.]+$/, '')}.xlsx`, [
      { name: 'ผลเทียบรายออเดอร์', title: `เทียบข้อมูล ${name} กับไฟล์ ${state.file.name}`, sub: `สร้างเมื่อ ${U.thDateTime(Date.now())} • ${U.num(r.tot.orders)} ออเดอร์${r.tot.items ? ` (${U.num(r.tot.items)} รายการสินค้า)` : ''}`,
        tables: [{ cols: [
          { h: 'เลขคำสั่งซื้อ', w: 22, t: 'text', v: (x) => x.orderNo },
          { h: 'รายการสินค้า', w: 10, t: 'int', v: (x) => x.items || null },
          { h: inc ? 'เงินเข้า ในไฟล์' : 'ยอดขาย ในไฟล์', w: 16, t: 'money', v: (x) => x.file[k] },
          { h: 'ในโปรแกรม', w: 16, t: 'money', v: (x) => x.app[k] },
          { h: 'ส่วนต่าง', w: 14, t: 'money', v: (x) => (x.status === 'ok' ? 0 : x.diff) },
          { h: 'ผลเทียบ', w: 22, t: 'text', v: (x) => STATUS[x.status][0] },
        ], rows: r.rows }] },
      { name: 'บรรทัดในไฟล์', title: 'ทุกบรรทัดในไฟล์ (ไม่มีข้อมูลลูกค้า)', sub: state.file.name,
        tables: [{ fill: 'blue', cols: [
          { h: 'เลขคำสั่งซื้อ', w: 22, t: 'text', v: (l) => l.orderNo },
          { h: 'วันที่', w: 12, t: 'date', v: (l) => l.date },
          { h: 'รายการ', w: 28, t: 'text', v: (l) => l.type },
          { h: 'สินค้า', w: 24, t: 'text', v: (l) => l.item },
          { h: 'จำนวนเงิน', w: 14, t: 'money', v: (l) => l.amount },
        ], rows: lineRows }] },
    ]);
  }

  A.verify = V;
})(window.App);
