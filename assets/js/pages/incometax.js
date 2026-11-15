/* เครื่องมือ: ประมาณภาษีเงินได้บุคคลธรรมดา (ขายของออนไลน์ = เงินได้ 40(8))
   - ภ.ง.ด.94 ครึ่งปี (ม.ค.–มิ.ย.) ยื่นภายใน 30 ก.ย. • ภ.ง.ด.90 ทั้งปี ยื่นภายใน 31 มี.ค. ปีถัดไป (ยื่นออนไลน์มักขยายถึง 8 ต.ค. / 8 เม.ย.)
   - เทียบ หักค่าใช้จ่ายเหมา 60% กับ หักตามจริง (ค่าธรรมเนียมแพลตฟอร์ม + ต้นทุนสินค้า + รายจ่ายที่บันทึก)
   - ภาษีขั้นบันได เทียบกับ ภาษีขั้นต่ำ 0.5% ของเงินได้ (เมื่อเงินได้นอกเงินเดือน ≥ 120,000 บาท/ปี หรือ 60,000 บาท/ครึ่งปี) จ่ายตัวที่สูงกว่า
     ถ้าภาษี 0.5% ไม่เกิน 5,000 บาท ได้รับยกเว้นส่วนนี้
   เป็นการประมาณการจากข้อมูลในโปรแกรม ควรยืนยันกับนักบัญชีหรือกรมสรรพากรก่อนยื่นจริง */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary;
  const IT = {};
  IT.BRACKETS = [[150000, 0], [300000, 0.05], [500000, 0.10], [750000, 0.15], [1000000, 0.20], [2000000, 0.25], [5000000, 0.30], [Infinity, 0.35]];
  IT.PERSONAL = 60000;
  IT.FLAT = 0.6;

  IT.progressive = (net) => {
    let tax = 0, lo = 0;
    const rows = [];
    for (const [hi, r] of IT.BRACKETS) {
      if (net <= lo) break;
      const part = Math.min(net, hi) - lo;
      rows.push({ from: lo, to: hi, rate: r, part, tax: part * r });
      tax += part * r;
      lo = hi;
    }
    return { tax: U.round2(tax), rows };
  };

  /* ตัวเลขของช่วง from–to: รายได้ (ไม่รวม VAT หลังจด) และค่าใช้จ่ายจริง */
  IT.figures = (from, to) => {
    const st = A.settings();
    const t = S.range(from, to);
    let vatOut = 0;
    if (st.vat.registered && A.vat) {
      for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) A.vat.monthly(String(y)).forEach((m) => { if (m.from >= U.monthStart(from) && m.from <= to) vatOut += m.out; });
    }
    const costOn = A.costing && A.costing.active();
    const exps = A.db.all('expenses').filter((e) => e.date >= from && e.date <= to);
    const skipCost = costOn ? exps.filter((e) => /ต้นทุน/.test(e.category || '')) : [];
    const expUsed = U.sum(exps, (e) => e.amount || 0) - U.sum(skipCost, (e) => e.amount || 0);
    const income = Math.max(0, t.sales + t.otherIncome - vatOut);
    return {
      from, to, sales: t.sales, other: t.otherIncome, vatOut: U.round2(vatOut), income: U.round2(income),
      fees: t.fees, cogs: t.cogs, cogsMissing: t.cogsMissing, costOn, exp: U.round2(expUsed), skipCost: U.round2(U.sum(skipCost, (e) => e.amount || 0)),
      actual: U.round2(t.fees + t.cogs + expUsed), months: S.bucket('month', from, to).filter((b) => b.sales || b.otherIncome).length,
    };
  };

  /* คำนวณภาษีทั้ง 2 วิธี  half = ภ.ง.ด.94 (ลดหย่อนครึ่งหนึ่ง เกณฑ์ภาษีขั้นต่ำ 60,000) */
  IT.compute = (f, { half = false } = {}) => {
    const cfg = A.settings().tax;
    const k = half ? 0.5 : 1;
    const allowance = (IT.PERSONAL + (cfg.otherAllowance || 0) + (cfg.socialSecurity || 0)) * k;
    const minBase = half ? 60000 : 120000;
    const way = (expense) => {
      const net = Math.max(0, f.income - expense - allowance);
      const prog = IT.progressive(net);
      let min = f.income >= minBase ? U.round2(f.income * 0.005) : 0;
      if (min <= 5000) min = 0;
      const tax = Math.max(prog.tax, min);
      return { expense: U.round2(expense), allowance, net: U.round2(net), prog, min, tax: U.round2(tax), usedMin: min > prog.tax };
    };
    const flat = way(f.income * IT.FLAT);
    const actual = way(Math.min(f.actual, f.income));
    const best = actual.tax < flat.tax ? 'actual' : 'flat';
    return { flat, actual, best, save: U.round2(Math.abs(flat.tax - actual.tax)) };
  };

  /* คาดการณ์ทั้งปี: เดือนที่ยังไม่ถึงใช้ค่าเฉลี่ยของเดือนที่มีข้อมูล */
  IT.project = (f, monthsTotal) => {
    if (!f.months || f.months >= monthsTotal) return f;
    const k = monthsTotal / f.months;
    const p = { ...f, projected: true };
    ['sales', 'other', 'vatOut', 'income', 'fees', 'cogs', 'exp', 'actual'].forEach((x) => { p[x] = U.round2(f[x] * k); });
    return p;
  };
  A.incomeTax = IT;

  const state = { year: U.today().slice(0, 4) };
  A.pages.incometax = {
    desc: 'ประมาณภาษีเงินได้ ภ.ง.ด.94 (ครึ่งปี) และ ภ.ง.ด.90 (ทั้งปี) — เทียบหักเหมา 60% กับหักตามจริง ว่าแบบไหนจ่ายน้อยกว่า',
    render(el) { draw(el); },
  };

  const methodCol = (r, label, best) => `
    <div class="card ${best ? 'tone-mint' : ''}" style="flex:1;min-width:250px">
      <div class="card-head"><h3>${label}</h3>${best ? '<span class="badge b-green">จ่ายน้อยกว่า</span>' : ''}</div>
      <dl class="kv">
        <dt>หักค่าใช้จ่าย</dt><dd>${U.money(r.expense)}</dd>
        <dt>หักลดหย่อน</dt><dd>${U.money(r.allowance)}</dd>
        <dt>เงินได้สุทธิ</dt><dd><b>${U.money(r.net)}</b></dd>
        <dt>ภาษีขั้นบันได</dt><dd>${U.money(r.prog.tax)}</dd>
        <dt>ภาษีขั้นต่ำ 0.5%</dt><dd>${r.min ? U.money(r.min) : '<span class="muted small">ไม่ต้องคำนวณ / ไม่เกิน 5,000</span>'}</dd>
        <dt>ภาษีที่ต้องจ่าย</dt><dd style="font-family:var(--font-head);font-size:20px">${U.money(r.tax)}${r.usedMin ? ' <span class="badge b-butter">ใช้ 0.5%</span>' : ''}</dd>
      </dl>
    </div>`;

  function formBlock(title, sub, f, res, extra = '') {
    return `<div class="card mt">
      <div class="card-head"><h3>${A.icon('file')} ${title}</h3><span class="sub">${sub}</span></div>
      ${f.projected ? `<div class="notice warn">${A.icon('info')}<div>ข้อมูลมี ${f.months} เดือน — ตัวเลขด้านล่าง <b>คาดการณ์ทั้งปี</b> จากค่าเฉลี่ยรายเดือน</div></div>` : ''}
      ${!f.income ? `<div class="notice warn">${A.icon('alert')}<div>ยังไม่มียอดขายในช่วงนี้ — นำเข้าไฟล์ของเดือนในช่วงนี้ก่อน</div></div>` : ''}
      <div class="kpis mt-s">
        ${ui.kpi({ label: 'เงินได้ (ยอดขาย + รายรับอื่น)', value: U.money(f.income), foot: f.vatOut ? `ไม่รวม VAT ขาย ${U.money0(f.vatOut)}` : `ยอดขาย ${U.money0(f.sales)} • อื่นๆ ${U.money0(f.other)}`, icon: 'heart', tone: 'pink' })}
        ${ui.kpi({ label: 'ค่าใช้จ่ายจริง', value: U.money(f.actual), foot: `ค่าธรรมเนียม ${U.money0(f.fees)} • ต้นทุน ${U.money0(f.cogs)} • รายจ่าย ${U.money0(f.exp)}`, icon: 'receipt', tone: 'blue' })}
        ${ui.kpi({ label: 'ค่าใช้จ่ายจริง คิดเป็น', value: f.income ? U.pct(f.actual / f.income) : '–', foot: 'ถ้าเกิน 60% หักตามจริงมักคุ้มกว่า', icon: 'percent', tone: 'butter' })}
      </div>
      <div class="row mt" style="align-items:stretch">${methodCol(res.flat, 'หักเหมา 60%', res.best === 'flat')}${methodCol(res.actual, 'หักตามจริง', res.best === 'actual')}</div>
      <div class="notice ${res.save ? 'ok' : ''} mt">${A.icon(res.save ? 'check' : 'info')}<div>${res.save ? `<b>${res.best === 'flat' ? 'หักเหมา 60%' : 'หักตามจริง'}</b> จ่ายน้อยกว่า <b>${U.money(res.save)}</b>` : 'ทั้งสองแบบจ่ายเท่ากัน'}${res.best === 'actual' ? ' — ต้องมีหลักฐานค่าใช้จ่ายครบ (ใบเสร็จค่าซื้อของ รายงานค่าธรรมเนียมจากแพลตฟอร์ม) และจัดทำรายงานเงินสดรับ-จ่าย' : ' — ไม่ต้องใช้หลักฐานค่าใช้จ่าย'}${extra}</div></div>
    </div>`;
  }

  function draw(el) {
    const cfg = A.settings().tax;
    const y = state.year, today = U.today();
    const isCur = y === today.slice(0, 4);
    const fH = IT.figures(`${y}-01-01`, `${y}-06-30`);
    const rH = IT.compute(fH, { half: true });
    const fYraw = IT.figures(`${y}-01-01`, `${y}-12-31`);
    const fY = isCur ? IT.project(fYraw, 12) : fYraw;
    const rY = IT.compute(fY);
    const paid94 = cfg.paid94 != null && cfg.paid94 !== '' ? +cfg.paid94 : rH[rH.best].tax;
    const remain = Math.max(0, rY[rY.best].tax - paid94 - (cfg.withheld || 0));
    const firstData = A.db.all('orders').map((o) => S.dayOf(o)).filter(Boolean).sort()[0];
    const years = [...new Set([today.slice(0, 4), String(+today.slice(0, 4) - 1), ...(firstData ? [firstData.slice(0, 4)] : [])])].sort().reverse();
    el.innerHTML = `
      <div class="notice">${A.icon('info')}<div>สำหรับ<b>ร้านที่เป็นบุคคลธรรมดา</b> (เงินได้ 40(8) จากการขายของ) • ประมาณการจากยอดขายในโปรแกรม (นับตามวันที่ส่ง) — ก่อนยื่นจริงควรตรวจกับนักบัญชี หรือคำนวณซ้ำในระบบยื่นภาษีของกรมสรรพากร</div></div>
      ${firstData && firstData > `${y}-01-31` && firstData.slice(0, 4) === y ? `<div class="notice warn mt-s">${A.icon('alert')}<div>ข้อมูลปี ${+y + 543} เริ่ม ${U.thDate(firstData)} — นำเข้าไฟล์ของเดือนก่อนหน้าให้ครบ ไม่อย่างนั้นภาษีจะต่ำกว่าความจริง</div></div>` : ''}
      ${fYraw.cogsMissing ? `<div class="notice warn mt-s">${A.icon('alert')}<div>มี ${U.num(fYraw.cogsMissing)} ออเดอร์ที่ยังไม่รู้ต้นทุน — ค่าใช้จ่ายจริงจะต่ำกว่าความจริง <a href="#/costs?tab=map">ไปจับคู่ต้นทุน →</a></div></div>` : ''}
      ${!fYraw.costOn ? `<div class="notice warn mt-s">${A.icon('alert')}<div>ยังไม่ได้ตั้งต้นทุนสินค้า — ค่าใช้จ่ายจริงยังไม่รวมต้นทุนของที่ขาย <a href="#/costs">ตั้งต้นทุนสินค้า →</a></div></div>` : ''}
      ${fYraw.skipCost ? `<div class="notice mt-s">${A.icon('info')}<div>ไม่นับรายจ่ายหมวด "ต้นทุนสินค้า" ${U.money(fYraw.skipCost)} เพราะหักต้นทุนตามออเดอร์แล้ว (กันนับซ้ำ)</div></div>` : ''}
      <div class="card mt">
        <form id="tax-frm" class="row" style="align-items:flex-end">
          <div class="field"><label>ปีภาษี</label><select class="input" name="year">${years.map((x) => `<option value="${x}" ${x === y ? 'selected' : ''}>${+x + 543}</option>`).join('')}</select></div>
          <div class="field"><label>ค่าลดหย่อนอื่น ทั้งปี (นอกจากส่วนตัว 60,000)</label><input class="input" type="number" min="0" step="1" name="otherAllowance" value="${cfg.otherAllowance || 0}"></div>
          <div class="field"><label>ประกันสังคม ทั้งปี</label><input class="input" type="number" min="0" step="1" name="socialSecurity" value="${cfg.socialSecurity || 0}"></div>
          <div class="field"><label>ภาษีที่จ่ายไปแล้วตอน ภ.ง.ด.94</label><input class="input" type="number" min="0" step="0.01" name="paid94" value="${cfg.paid94 != null ? cfg.paid94 : ''}" placeholder="ใช้ค่าที่คำนวณ"></div>
          <div class="field"><label>ภาษีที่ถูกหัก ณ ที่จ่าย</label><input class="input" type="number" min="0" step="0.01" name="withheld" value="${cfg.withheld || 0}"></div>
          <button class="btn" type="submit">${A.icon('check')} คำนวณ</button>
          <span class="spacer"></span>
          <button class="btn ghost sm" type="button" id="xl">${A.icon('download')} Excel</button>
        </form>
        <p class="small muted mt-s">ค่าลดหย่อนอื่น เช่น คู่สมรสไม่มีรายได้ บุตร เบี้ยประกันชีวิต/สุขภาพ ดอกเบี้ยบ้าน กองทุน SSF/RMF/ThaiESG เงินบริจาค — ใส่ยอดรวมทั้งปี (ภ.ง.ด.94 ใช้ครึ่งหนึ่ง)</p>
      </div>
      ${formBlock(`ภ.ง.ด.94 — ครึ่งปี ${+y + 543}`, `ม.ค.–มิ.ย. • ยื่นภายใน 30 ก.ย. ${+y + 543} (ออนไลน์มักขยายถึง 8 ต.ค.)`, fH, rH)}
      ${formBlock(`ภ.ง.ด.90 — ทั้งปี ${+y + 543}`, `ม.ค.–ธ.ค. • ยื่นภายใน 31 มี.ค. ${+y + 544} (ออนไลน์มักขยายถึง 8 เม.ย.)`, fY, rY,
        ` • หักภาษีที่จ่ายตอน ภ.ง.ด.94 ${U.money(paid94)}${cfg.withheld ? ` และหัก ณ ที่จ่าย ${U.money(cfg.withheld)}` : ''} แล้ว <b>ต้องจ่ายเพิ่มประมาณ ${U.money(remain)}</b>`)}
      <div class="card mt">
        <div class="card-head"><h3>${A.icon('percent')} อัตราภาษีขั้นบันได (ทั้งปี — วิธีที่จ่ายน้อยกว่า)</h3></div>
        ${ui.table([
          { h: 'เงินได้สุทธิ', v: (r) => `${U.money0(r.from + (r.from ? 1 : 0))} – ${r.to === Infinity ? 'ขึ้นไป' : U.money0(r.to)}` },
          { h: 'อัตรา', cls: 'num', v: (r) => (r.rate ? `${Math.round(r.rate * 100)}%` : 'ยกเว้น') },
          { h: 'เงินได้ในขั้นนี้', cls: 'num', v: (r) => U.money(r.part) },
          { h: 'ภาษี', cls: 'num', v: (r) => U.money(r.tax) },
        ], rY[rY.best].prog.rows, { empty: 'เงินได้สุทธิเป็น 0', foot: [{ v: 'รวม' }, { v: '' }, { cls: 'num', v: U.money(rY[rY.best].net) }, { cls: 'num', v: U.money(rY[rY.best].prog.tax) }] })}
      </div>`;
    const frm = el.querySelector('#tax-frm');
    frm.year.onchange = () => { state.year = frm.year.value; draw(el); };
    frm.onsubmit = async (e) => {
      e.preventDefault();
      const n = (k) => Math.max(0, parseFloat(frm[k].value) || 0);
      await A.saveSettings({ tax: { ...A.settings().tax, otherAllowance: n('otherAllowance'), socialSecurity: n('socialSecurity'), withheld: n('withheld'), paid94: frm.paid94.value === '' ? null : n('paid94') } });
      ui.toast('คำนวณใหม่แล้ว', 'ok'); draw(el);
    };
    el.querySelector('#xl').onclick = () => {
      const rows = (f, r) => [['เงินได้ (ยอดขาย + รายรับอื่น)', f.income, f.income], ['หักค่าใช้จ่าย', r.flat.expense, r.actual.expense], ['หักลดหย่อน', r.flat.allowance, r.actual.allowance], ['เงินได้สุทธิ', r.flat.net, r.actual.net], ['ภาษีขั้นบันได', r.flat.prog.tax, r.actual.prog.tax], ['ภาษีขั้นต่ำ 0.5%', r.flat.min, r.actual.min], ['ภาษีที่ต้องจ่าย', r.flat.tax, r.actual.tax]];
      const cols = [{ h: 'รายการ', w: 34, t: 'text', v: (r) => r[0] }, { h: 'หักเหมา 60%', w: 18, t: 'money', v: (r) => U.round2(r[1]) }, { h: 'หักตามจริง', w: 18, t: 'money', v: (r) => U.round2(r[2]) }];
      A.exportSheets(`ภาษีเงินได้_${A.settings().shopName}_${y}.xlsx`, [{ name: 'ภาษีเงินได้', title: `ประมาณภาษีเงินได้ปี ${+y + 543} — ${A.settings().shopName}`, sub: 'ประมาณการจาก Bunny Ledger • ควรตรวจกับนักบัญชีก่อนยื่น', tables: [
        { title: 'ภ.ง.ด.94 (ม.ค.–มิ.ย.)', cols, rows: rows(fH, rH), totals: false },
        { title: `ภ.ง.ด.90 (ทั้งปี${fY.projected ? ' — คาดการณ์' : ''})`, fill: 'blue', cols, rows: rows(fY, rY), totals: false },
        { title: 'ค่าใช้จ่ายจริง (ทั้งปี)', cols: [{ h: 'รายการ', w: 34, t: 'text', v: (r) => r[0] }, { h: 'จำนวนเงิน', w: 18, t: 'money', v: (r) => U.round2(r[1]) }], rows: [['ค่าธรรมเนียมแพลตฟอร์ม', fY.fees], ['ต้นทุนสินค้า', fY.cogs], ['รายจ่ายที่บันทึก', fY.exp]] },
      ] }]);
    };
  }
})(window.App);
