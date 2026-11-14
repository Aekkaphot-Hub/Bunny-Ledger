/* หน้า: บันทึกรายจ่าย และ รายรับอื่นๆ (ใช้โครงเดียวกัน) */
(function (A) {
  const U = A.U, ui = A.ui;

  function ledgerPage({ store, catKey, title, tone, icon, withPlatform, desc }) {
    const state = { month: U.monthStart(U.today()), editing: null, cat: '' };
    return {
      desc,
      render(el) { draw(el); },
    };

    function draw(el) {
      A.charts.reset();
      const st = A.settings();
      const cats = st[catKey];
      const from = state.month, to = U.monthEnd(state.month);
      const list = A.db.all(store).filter((x) => x.date >= from && x.date <= to).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0));
      const shown = state.cat ? list.filter((x) => (x.category || 'อื่นๆ') === state.cat) : list;
      const e = state.editing ? A.db.get(store, state.editing) : null;
      const byCat = {};
      list.forEach((x) => { byCat[x.category || 'อื่นๆ'] = (byCat[x.category || 'อื่นๆ'] || 0) + (x.amount || 0); });
      const palette = ['#F6B5CB', '#9CCBF0', '#A8DCC9', '#FBE3A7', '#C9B8F2', '#F5A97F', '#B9D7A8', '#F2A7A7'];
      const slices = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ key: k, label: k, value: v, color: palette[i % palette.length] }));
      const prevTotal = U.sum(A.db.all(store).filter((x) => x.date >= U.addMonths(from, -1) && x.date < from), (x) => x.amount);

      el.innerHTML = `
        <div class="grid g-1-2">
          <div>
            <div class="card tone-${tone}">
              <div class="card-head"><h3>${A.icon(e ? 'edit' : icon)} ${e ? 'แก้ไขรายการ' : 'เพิ่ม' + title}</h3></div>
              <form id="frm" class="form-grid" style="grid-template-columns:1fr 1fr">
                <div class="field"><label>วันที่</label><input class="input" type="date" name="date" required value="${e ? e.date : U.today()}"></div>
                <div class="field"><label>จำนวนเงิน (บาท)</label><input class="input" type="number" step="0.01" min="0" name="amount" required value="${e ? e.amount : ''}" placeholder="0.00"></div>
                <div class="field" style="grid-column:1/-1"><label>หมวดหมู่ (พิมพ์หมวดใหม่ได้)</label>
                  <input class="input" name="category" list="cat-list" required value="${U.esc(e ? e.category : cats[0])}">
                  <datalist id="cat-list">${cats.map((c) => `<option value="${U.esc(c)}">`).join('')}</datalist></div>
                ${withPlatform ? `<div class="field" style="grid-column:1/-1"><label>เกี่ยวกับแพลตฟอร์ม (ถ้ามี)</label>${ui.pfSelect(e ? e.platform : '', '— ไม่เกี่ยว / ใช้ร่วมกัน —', 'name="platform"')}</div>` : ''}
                ${store === 'expenses' ? `<label class="check" style="grid-column:1/-1"><input type="checkbox" name="taxInvoice" ${e && e.taxInvoice ? 'checked' : ''}> มีใบกำกับภาษีเต็มรูป (ใช้เป็นภาษีซื้อ หลังจด VAT)</label>` : ''}
                <div class="field" style="grid-column:1/-1"><label>รายละเอียด</label><input class="input" name="note" value="${U.esc(e ? e.note || '' : '')}" placeholder="เช่น ซื้อกล่อง 100 ใบ"></div>
                <div class="row" style="grid-column:1/-1">
                  <button class="btn" type="submit">${A.icon('check')} ${e ? 'บันทึกการแก้ไข' : 'บันทึก'}</button>
                  ${e ? '<button class="btn ghost" type="button" id="cancel">ยกเลิก</button>' : ''}
                </div>
              </form>
            </div>
            <div class="card">
              <div class="card-head"><h3>${A.icon('pie')} แยกตามหมวด</h3><span class="sub">${U.thMonth(from)}</span></div>
              <div class="chart-box tall"><canvas id="c-cat"></canvas></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head">
              <h3>${A.icon('calendar')} ${title}เดือน ${U.thMonth(from)}</h3>
              <div class="row">
                <button class="icon-btn" id="m-prev">${A.icon('chevL')}</button>
                <input class="input" type="month" id="m-pick" value="${from.slice(0, 7)}">
                <button class="icon-btn" id="m-next">${A.icon('chevR')}</button>
              </div>
            </div>
            <div class="row" style="margin-bottom:10px">
              <div><span class="muted small">รวมทั้งเดือน</span><div style="font-family:var(--font-head);font-size:24px">${U.money(U.sum(list, (x) => x.amount))}</div><span class="small">${ui.delta(U.sum(list, (x) => x.amount), prevTotal)} จากเดือนก่อน</span></div>
              <span class="spacer"></span>
              ${state.cat ? `<span class="chip">หมวด: ${U.esc(state.cat)} <button id="clr">${A.icon('x')}</button></span>` : ''}
            </div>
            ${ui.table([
              { h: 'วันที่', v: (x) => U.thDate(x.date) },
              { h: 'หมวด', v: (x) => `<span class="badge b-${tone}">${U.esc(x.category || 'อื่นๆ')}</span>` },
              ...(withPlatform ? [{ h: 'แพลตฟอร์ม', v: (x) => (x.platform ? ui.pf(x.platform) : '<span class="muted">–</span>') }] : []),
              { h: 'รายละเอียด', cls: 'ell', v: (x) => U.esc(x.note || '') + (x.taxInvoice ? ' <span class="badge b-green">ใบกำกับภาษี</span>' : '') },
              { h: 'จำนวนเงิน', cls: 'num', v: (x) => `<b>${U.money(x.amount)}</b>` },
              { h: '', v: (x) => `<span class="nowrap"><button class="icon-btn" data-edit="${x.id}" title="แก้ไข">${A.icon('edit')}</button><button class="icon-btn" data-del="${x.id}" title="ลบ">${A.icon('trash')}</button></span>` },
            ], shown, { empty: `ยังไม่มี${title}ในเดือนนี้`, foot: [{ v: 'รวม' }, { v: `${shown.length} รายการ` }, ...(withPlatform ? [{ v: '' }] : []), { v: '' }, { cls: 'num', v: U.money(U.sum(shown, (x) => x.amount)) }, { v: '' }] })}
          </div>
        </div>`;

      el.querySelector('#frm').onsubmit = async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const rec = {
          ...(e || {}),
          date: fd.get('date'), amount: parseFloat(fd.get('amount')), category: String(fd.get('category') || '').trim() || 'อื่นๆ',
          note: String(fd.get('note') || '').trim(),
        };
        if (withPlatform) rec.platform = fd.get('platform') || '';
        if (store === 'expenses') rec.taxInvoice = !!fd.get('taxInvoice');
        if (isNaN(rec.amount) || rec.amount <= 0) { ui.toast('กรอกจำนวนเงินให้ถูกต้องนะ', 'err'); return; }
        await A.db.put(store, rec);
        if (!cats.includes(rec.category)) await A.saveSettings({ [catKey]: [...cats, rec.category] });
        ui.toast(e ? 'แก้ไขแล้ว' : 'บันทึกแล้ว', 'ok');
        state.editing = null;
        if (rec.date < from || rec.date > to) state.month = U.monthStart(rec.date);
        draw(el);
      };
      const cancel = el.querySelector('#cancel');
      if (cancel) cancel.onclick = () => { state.editing = null; draw(el); };
      el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => { state.editing = b.dataset.edit; draw(el); window.scrollTo({ top: 0, behavior: 'smooth' }); }; });
      el.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          const x = A.db.get(store, b.dataset.del);
          if (await ui.confirm('ลบรายการนี้?', `${U.thDate(x.date)} • ${U.esc(x.category)} • ${U.money(x.amount)}`, 'ลบ', true)) { await A.db.remove(store, x.id); ui.toast('ลบแล้ว'); draw(el); }
        };
      });
      el.querySelector('#m-prev').onclick = () => { state.month = U.addMonths(state.month, -1); state.cat = ''; draw(el); };
      el.querySelector('#m-next').onclick = () => { state.month = U.addMonths(state.month, 1); state.cat = ''; draw(el); };
      el.querySelector('#m-pick').onchange = (ev) => { if (ev.target.value) { state.month = ev.target.value + '-01'; state.cat = ''; draw(el); } };
      const clr = el.querySelector('#clr');
      if (clr) clr.onclick = () => { state.cat = ''; draw(el); };
      A.charts.donut(el.querySelector('#c-cat'), slices, { money: true, center: title, onClick: (k) => { state.cat = k; draw(el); } });
    }
  }

  A.pages.expenses = ledgerPage({ store: 'expenses', catKey: 'expenseCategories', title: 'รายจ่าย', tone: 'pink', icon: 'receipt', withPlatform: true, desc: 'จดค่าใช้จ่ายของร้าน เช่น ต้นทุนสินค้า ค่าแพ็กของ ค่าโฆษณา' });
  A.pages.income = ledgerPage({ store: 'otherIncome', catKey: 'incomeCategories', title: 'รายรับอื่นๆ', tone: 'blue', icon: 'plusCoin', withPlatform: false, desc: 'รายได้ที่ไม่ได้มาจาก 3 แพลตฟอร์ม เช่น ขายหน้าร้าน ลูกค้าโอนตรง' });
})(window.App);
