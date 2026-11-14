/* เครื่องมือ: คำนวณภาษี VAT
   ก. ยังไม่จด VAT — ติดตามรายรับสะสมทั้งปีเทียบเกณฑ์ 1.8 ล้านบาท (เกินแล้วต้องจดภายใน 30 วัน)
   ข. จด VAT แล้ว — ประมาณภาษีขาย / ภาษีซื้อ / VAT ที่ต้องชำระรายเดือน (ภ.พ.30)
   ตัวเลขเป็นประมาณการจากข้อมูลในโปรแกรม (ยอดขายนับตามวันที่ส่งสินค้า) ควรยืนยันกับนักบัญชี */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary;
  const T = {};

  const inclVat = (amount, r) => amount * r / (1 + r); // VAT ที่รวมอยู่ในราคา
  /* รายรับที่ใช้นับเกณฑ์ / ฐานภาษีขาย */
  const revenueOf = (b, cfg) => (b.sales || 0) + (cfg.countOtherIncome ? b.otherIncome || 0 : 0);

  /* ก. เกณฑ์ 1.8 ล้าน: รายรับสะสมทั้งปี วันที่เกิน กำหนดจด และคาดการณ์ */
  T.threshold = (year = U.today().slice(0, 4)) => {
    const cfg = A.settings().vat;
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const today = U.today();
    let cum = 0;
    const months = S.bucket('month', from, to).map((b) => {
      const revenue = revenueOf(b, cfg);
      cum += revenue;
      return { from: b.from, label: U.thMonth(b.from), sales: b.sales, other: b.otherIncome, revenue, cum };
    });
    // วันแรกที่รายรับสะสมเกินเกณฑ์
    let crossDate = null, c = 0;
    if (cum > cfg.threshold) {
      for (const b of S.bucket('day', from, to)) { c += revenueOf(b, cfg); if (c > cfg.threshold) { crossDate = b.from; break; } }
    }
    // คาดการณ์จากค่าเฉลี่ย 3 เดือนล่าสุดที่จบแล้ว
    const doneMonths = months.filter((m) => U.monthEnd(m.from) < today && m.revenue > 0).slice(-3);
    const avg = doneMonths.length ? U.sum(doneMonths, (m) => m.revenue) / doneMonths.length : 0;
    let projected = null;
    if (!crossDate && avg > 0 && year === today.slice(0, 4)) {
      const left = cfg.threshold - cum;
      const m = Math.ceil(left / avg);
      const at = U.addMonths(U.monthStart(today), m);
      if (at.slice(0, 4) === year) projected = at;
    }
    const pct = cfg.threshold ? cum / cfg.threshold : 0;
    return {
      year, cfg, months, total: cum, pct, avg, projected, crossDate,
      deadline: crossDate ? U.addDays(crossDate, 30) : null,
      level: crossDate ? 'over' : pct >= 0.8 ? 'warn' : 'ok',
    };
  };

  /* ข. หลังจด VAT: ประมาณ VAT รายเดือน */
  T.monthly = (year = U.today().slice(0, 4)) => {
    const st = A.settings(), cfg = st.vat, r = cfg.rate;
    if (!cfg.registered) return [];
    const since = cfg.since || `${year}-01-01`;
    const exps = A.db.all('expenses').filter((e) => e.taxInvoice);
    return S.periods('month', `${year}-01-01`, `${year}-12-31`).map((p) => {
      const from = p.from < since ? since : p.from;
      if (from > p.to) return null;
      const b = S.range(from, p.to);
      const base = revenueOf(b, cfg);
      const out = cfg.priceIncludesVat ? inclVat(base, r) : base * r;
      const feeVat = cfg.feesHaveInvoice ? inclVat(b.fees || 0, r) : 0;
      const expList = exps.filter((e) => e.date >= from && e.date <= p.to);
      const expVat = U.sum(expList, (e) => inclVat(e.amount || 0, r));
      const due = U.addDays(U.addMonths(p.from, 1), (cfg.efiling ? 23 : 15) - 1);
      return { from: p.from, label: U.thMonth(p.from), partial: from !== p.from, base, out: U.round2(out), fees: b.fees, feeVat: U.round2(feeVat), exp: U.sum(expList, (e) => e.amount), expVat: U.round2(expVat), net: U.round2(out - feeVat - expVat), due };
    }).filter(Boolean);
  };

  // ---------- หน้าจอ ----------
  const state = { year: U.today().slice(0, 4) };
  A.pages.vat = {
    desc: 'ติดตามรายรับเทียบเกณฑ์จด VAT 1.8 ล้านบาท และประมาณภาษีมูลค่าเพิ่มรายเดือนหลังจดทะเบียน',
    render(el) { draw(el); },
  };

  function draw(el) {
    A.charts.reset();
    const th = T.threshold(state.year);
    const cfg = th.cfg;
    const mon = T.monthly(state.year);
    const thisYear = state.year === U.today().slice(0, 4);
    const left = Math.max(0, cfg.threshold - th.total);
    const daysLeft = th.deadline ? U.diffDays(U.today(), th.deadline) : null;
    const levelNotice = th.level === 'over'
      ? `<div class="notice red">${A.icon('alert')}<div><b>รายรับเกิน ${U.money0(cfg.threshold)} แล้ว เมื่อ ${U.thDate(th.crossDate)}</b> — ต้องยื่นจดทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.01) ภายใน <b>${U.thDate(th.deadline)}</b>${daysLeft != null ? (daysLeft >= 0 ? ` (เหลือ ${daysLeft} วัน)` : ` (<b>เลยกำหนดมาแล้ว ${-daysLeft} วัน</b>)`) : ''}${cfg.registered ? ' • คุณตั้งค่าว่าจดแล้ว' : ''}</div></div>`
      : th.level === 'warn'
        ? `<div class="notice warn">${A.icon('alert')}<div>รายรับถึง <b>${U.pct(th.pct)}</b> ของเกณฑ์แล้ว — เหลืออีก ${U.money(left)}${th.projected ? ` • คาดว่าจะเกินประมาณ <b>${U.thMonth(th.projected)}</b>` : ''} เตรียมเอกสารจด VAT ไว้ได้เลย</div></div>`
        : `<div class="notice ok">${A.icon('check')}<div>ยังไม่ถึงเกณฑ์ — เหลืออีก ${U.money(left)}${th.projected ? ` • ถ้ายอดขายเท่าช่วงนี้ คาดว่าจะเกินประมาณ ${U.thMonth(th.projected)}` : thisYear && th.avg ? ' • ปีนี้น่าจะยังไม่เกินเกณฑ์' : ''}</div></div>`;
    const yearSum = mon.reduce((a, m) => ({ out: a.out + m.out, inp: a.inp + m.feeVat + m.expVat, net: a.net + m.net }), { out: 0, inp: 0, net: 0 });
    const curM = mon.find((m) => m.from === U.monthStart(U.today()));
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <button class="icon-btn" id="y-prev">${A.icon('chevL')}</button>
        <h3 style="margin:0">ปี ${+state.year + 543}</h3>
        <button class="icon-btn" id="y-next">${A.icon('chevR')}</button>
        <span class="spacer"></span>
        <button class="btn ghost sm" id="vat-xl">${A.icon('download')} ส่งออก Excel</button>
      </div>
      <div class="grid g-2-1">
        <div>
          <div class="card">
            <div class="card-head"><h3>${A.icon('percent')} เกณฑ์จด VAT ${U.money0(cfg.threshold)}</h3><span class="sub">รายรับ ม.ค.–ธ.ค. ${+state.year + 543}</span></div>
            <div class="row" style="align-items:flex-end">
              <div><span class="muted small">รายรับสะสม</span><div style="font-family:var(--font-head);font-size:28px">${U.money(th.total)}</div></div>
              <span class="spacer"></span>
              <div class="right"><span class="muted small">ของเกณฑ์</span><div style="font-family:var(--font-head);font-size:22px">${U.pct(th.pct)}</div></div>
            </div>
            <div class="meter ${th.level === 'ok' ? '' : th.level} mt-s"><span style="width:${Math.min(100, th.pct * 100).toFixed(1)}%"></span></div>
            <div class="mt-s">${levelNotice}</div>
            <p class="small muted">นับจาก ยอดขายทุกแพลตฟอร์ม (ตามวันที่ส่งสินค้า)${cfg.countOtherIncome ? ' + รายรับอื่นๆ' : ''} • เฉลี่ย 3 เดือนล่าสุด ${U.money(th.avg)}/เดือน</p>
          </div>
          ${cfg.registered ? `<div class="card">
            <div class="card-head"><h3>${A.icon('receipt')} VAT รายเดือน (ภ.พ.30)</h3><span class="sub">จด VAT ตั้งแต่ ${U.thDate(cfg.since) || '-'} • อัตรา ${U.pct(cfg.rate, 0)}</span></div>
            <div class="kpis">
              ${ui.kpi({ label: 'VAT เดือนนี้ (ประมาณ)', value: curM ? U.money(curM.net) : '–', foot: curM ? `ภาษีขาย ${U.money0(curM.out)} − ภาษีซื้อ ${U.money0(curM.feeVat + curM.expVat)} • ยื่นภายใน ${U.thDate(curM.due)}` : 'ไม่มีข้อมูลเดือนนี้', icon: 'percent', tone: 'pink' })}
              ${ui.kpi({ label: `ทั้งปี ${+state.year + 543}`, value: U.money(yearSum.net), foot: `ภาษีขาย ${U.money0(yearSum.out)} • ภาษีซื้อ ${U.money0(yearSum.inp)}`, icon: 'calendar', tone: 'blue' })}
            </div>
            <div class="mt">${ui.table([
              { h: 'เดือน', v: (m) => m.label + (m.partial ? ' <span class="small muted">(นับตั้งแต่วันที่จด)</span>' : '') },
              { h: cfg.priceIncludesVat ? 'ยอดขาย (รวม VAT)' : 'ยอดขาย (ก่อน VAT)', cls: 'num', v: (m) => U.money(m.base) },
              { h: 'ภาษีขาย', cls: 'num', v: (m) => U.money(m.out) },
              { h: 'ภาษีซื้อ ค่าธรรมเนียม', cls: 'num', v: (m) => U.money(m.feeVat) },
              { h: 'ภาษีซื้อ รายจ่าย', cls: 'num', v: (m) => U.money(m.expVat) },
              { h: 'ต้องชำระ / (ขอคืน)', cls: 'num', v: (m) => `<b style="color:${m.net < 0 ? 'var(--mint-deep)' : 'inherit'}">${m.net < 0 ? `(${U.money(-m.net)})` : U.money(m.net)}</b>` },
              { h: 'ยื่นภายใน', v: (m) => U.thDate(m.due) },
            ], mon, { empty: 'ยังไม่มีข้อมูลหลังวันที่จด VAT ในปีนี้', foot: mon.length ? [{ v: 'รวม' }, { cls: 'num', v: U.money(U.sum(mon, (m) => m.base)) }, { cls: 'num', v: U.money(yearSum.out) }, { cls: 'num', v: U.money(U.sum(mon, (m) => m.feeVat)) }, { cls: 'num', v: U.money(U.sum(mon, (m) => m.expVat)) }, { cls: 'num', v: `<b>${U.money(yearSum.net)}</b>` }, { v: '' }] : null })}</div>
            <p class="small muted">ภาษีซื้อจากรายจ่าย นับเฉพาะรายการที่ติ๊ก "มีใบกำกับภาษี" ในหน้า <a href="#/expenses">บันทึกรายจ่าย</a>${cfg.feesHaveInvoice ? ' • ค่าธรรมเนียมแพลตฟอร์มถือว่ามีใบกำกับภาษีจากแพลตฟอร์ม' : ''}</p>
          </div>` : ''}
          <div class="card">
            <div class="card-head"><h3>${A.icon('calendar')} รายรับรายเดือน</h3></div>
            ${ui.table([
              { h: 'เดือน', v: (m) => m.label + (th.crossDate && th.crossDate.slice(0, 7) === m.from.slice(0, 7) ? ' <span class="badge b-red">เกินเกณฑ์</span>' : '') },
              { h: 'ยอดขาย', cls: 'num', v: (m) => U.money(m.sales) },
              { h: 'รายรับอื่นๆ', cls: 'num', v: (m) => (cfg.countOtherIncome ? U.money(m.other) : '<span class="muted">ไม่นับ</span>') },
              { h: 'รวม', cls: 'num', v: (m) => `<b>${U.money(m.revenue)}</b>` },
              { h: 'สะสม', cls: 'num', v: (m) => U.money(m.cum) },
            ], th.months, { foot: [{ v: 'รวมทั้งปี' }, { cls: 'num', v: U.money(U.sum(th.months, (m) => m.sales)) }, { cls: 'num', v: cfg.countOtherIncome ? U.money(U.sum(th.months, (m) => m.other)) : '' }, { cls: 'num', v: `<b>${U.money(th.total)}</b>` }, { v: '' }] })}
          </div>
        </div>
        <div>
          <div class="card tone-mint">
            <div class="card-head"><h3>${A.icon('gear')} ตั้งค่า VAT</h3></div>
            <form id="vat-frm" class="form-grid vat-form" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
              <label class="check" style="grid-column:1/-1"><input type="checkbox" name="registered" ${cfg.registered ? 'checked' : ''}> ร้านจดทะเบียน VAT แล้ว</label>
              <div class="field" style="grid-column:1/-1"><label>จด VAT ตั้งแต่วันที่</label><input class="input" type="date" name="since" value="${U.esc(cfg.since || '')}"></div>
              <div class="field"><label>อัตรา VAT (%)</label><input class="input" type="number" step="0.1" min="0" name="rate" value="${U.round2(cfg.rate * 100)}"></div>
              <div class="field"><label>เกณฑ์รายรับ (บาท/ปี)</label><input class="input" type="number" step="1000" min="0" name="threshold" value="${cfg.threshold}"></div>
              <label class="check" style="grid-column:1/-1"><input type="checkbox" name="priceIncludesVat" ${cfg.priceIncludesVat ? 'checked' : ''}> ราคาขายรวม VAT แล้ว (ภาษีขาย = ยอดขาย × 7/107)</label>
              <label class="check" style="grid-column:1/-1"><input type="checkbox" name="countOtherIncome" ${cfg.countOtherIncome ? 'checked' : ''}> นับรายรับอื่นๆ รวมเป็นรายรับด้วย</label>
              <label class="check" style="grid-column:1/-1"><input type="checkbox" name="feesHaveInvoice" ${cfg.feesHaveInvoice ? 'checked' : ''}> ค่าธรรมเนียมแพลตฟอร์มมีใบกำกับภาษี (นับเป็นภาษีซื้อ)</label>
              <label class="check" style="grid-column:1/-1"><input type="checkbox" name="efiling" ${cfg.efiling ? 'checked' : ''}> ยื่นออนไลน์ (ภ.พ.30 ภายในวันที่ 23 แทนวันที่ 15)</label>
              <div class="row" style="grid-column:1/-1"><span class="spacer"></span><button class="btn" type="submit" ${A.workspace && !A.workspace.can('settings') ? 'disabled' : ''}>${A.icon('check')} บันทึก</button></div>
            </form>
          </div>
          <div class="card">
            <div class="card-head"><h3>${A.icon('info')} สรุปกฎ VAT ที่ใช้คำนวณ</h3></div>
            <ol class="steps">
              <li><div>รายรับจากการขายเกิน <b>1.8 ล้านบาทต่อปี</b> ต้องยื่นจดทะเบียน VAT (ภ.พ.01) <b>ภายใน 30 วัน</b> นับจากวันที่รายรับเกิน</div></li>
              <li><div>อัตรา VAT <b>7%</b> (ครม. ขยายถึง 30 ก.ย. 2570) — แก้ได้ในตั้งค่าด้านบน</div></li>
              <li><div>หลังจด: ยื่น ภ.พ.30 ทุกเดือน ภายในวันที่ 15 ของเดือนถัดไป (ยื่นออนไลน์ได้ถึงวันที่ 23) แม้เดือนนั้นจะไม่มียอดขาย</div></li>
              <li><div>VAT ที่ต้องชำระ = ภาษีขาย − ภาษีซื้อ (ภาษีซื้อต้องมีใบกำกับภาษีเต็มรูป)</div></li>
            </ol>
            <p class="small muted">ตัวเลขเป็นการประมาณจากข้อมูลในโปรแกรม (ยอดขายนับตามวันที่ส่งสินค้า) — วันที่เกิดภาษีจริงและรายการที่ต้องนับ ควรยืนยันกับนักบัญชีหรือกรมสรรพากรก่อนยื่น</p>
          </div>
        </div>
      </div>`;
    el.querySelector('#y-prev').onclick = () => { state.year = String(+state.year - 1); draw(el); };
    el.querySelector('#y-next').onclick = () => { state.year = String(+state.year + 1); draw(el); };
    el.querySelector('#vat-frm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const rate = parseFloat(fd.get('rate'));
      const threshold = parseFloat(fd.get('threshold'));
      const vat = {
        ...cfg,
        registered: !!fd.get('registered'), since: String(fd.get('since') || ''),
        rate: isNaN(rate) ? cfg.rate : rate / 100, threshold: isNaN(threshold) ? cfg.threshold : threshold,
        priceIncludesVat: !!fd.get('priceIncludesVat'), countOtherIncome: !!fd.get('countOtherIncome'), feesHaveInvoice: !!fd.get('feesHaveInvoice'), efiling: !!fd.get('efiling'),
      };
      if (vat.registered && !vat.since) { ui.toast('ใส่วันที่จด VAT ด้วย', 'err'); return; }
      await A.saveSettings({ vat });
      ui.toast('บันทึกการตั้งค่า VAT แล้ว', 'ok');
      draw(el);
    };
    el.querySelector('#vat-xl').onclick = () => exportXl(th, mon);
  }

  function exportXl(th, mon) {
    const y = +state.year + 543;
    const sheets = [{
      name: 'เกณฑ์ 1.8 ล้าน', title: `รายรับเทียบเกณฑ์จด VAT ปี ${y} — ${A.settings().shopName}`,
      sub: `รายรับสะสม ${U.money(th.total)} (${U.pct(th.pct)} ของเกณฑ์ ${U.money0(th.cfg.threshold)})${th.crossDate ? ` • เกินเกณฑ์ ${U.thDate(th.crossDate)} • ต้องจดภายใน ${U.thDate(th.deadline)}` : ''}`,
      tables: [{ cols: [
        { h: 'เดือน', w: 18, t: 'text', v: (m) => m.label },
        { h: 'ยอดขาย', w: 16, t: 'money', v: (m) => U.round2(m.sales) },
        { h: 'รายรับอื่นๆ', w: 16, t: 'money', v: (m) => (th.cfg.countOtherIncome ? U.round2(m.other) : 0) },
        { h: 'รวม', w: 16, t: 'money', v: (m) => U.round2(m.revenue) },
        { h: 'สะสม', w: 16, t: 'money', v: (m) => U.round2(m.cum), },
      ], rows: th.months }],
    }];
    if (mon.length) sheets.push({
      name: 'VAT รายเดือน', title: `ประมาณการ VAT รายเดือน ปี ${y}`, sub: `อัตรา ${U.pct(th.cfg.rate, 0)} • ${th.cfg.priceIncludesVat ? 'ราคาขายรวม VAT' : 'ราคาขายก่อน VAT'} • ตัวเลขประมาณการ ควรยืนยันกับนักบัญชี`,
      tables: [{ fill: 'blue', cols: [
        { h: 'เดือน', w: 18, t: 'text', v: (m) => m.label },
        { h: 'ฐานภาษีขาย', w: 16, t: 'money', v: (m) => U.round2(m.base) },
        { h: 'ภาษีขาย', w: 14, t: 'money', v: (m) => m.out },
        { h: 'ค่าธรรมเนียมแพลตฟอร์ม', w: 18, t: 'money', v: (m) => U.round2(m.fees) },
        { h: 'ภาษีซื้อ ค่าธรรมเนียม', w: 16, t: 'money', v: (m) => m.feeVat },
        { h: 'รายจ่ายมีใบกำกับ', w: 16, t: 'money', v: (m) => U.round2(m.exp) },
        { h: 'ภาษีซื้อ รายจ่าย', w: 14, t: 'money', v: (m) => m.expVat },
        { h: 'ต้องชำระ (ติดลบ = ขอคืน)', w: 18, t: 'money', v: (m) => m.net },
        { h: 'ยื่นภายใน', w: 12, t: 'date', v: (m) => m.due },
      ], rows: mon }],
    });
    A.exportSheets(`ภาษีVAT_${A.settings().shopName}_${y}.xlsx`, sheets);
  }

  A.vat = T;
})(window.App);
