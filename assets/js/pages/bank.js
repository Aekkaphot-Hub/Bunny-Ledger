/* หน้า: เงินเข้าบัญชีธนาคาร — เช็กว่าเงินที่แพลตฟอร์มบอกว่าโอนแล้ว ถึงบัญชีธนาคารจริง
   - TikTok: ยอดถอนเงินจากชีต "บันทึกการถอน" ในไฟล์รายได้ (เงินพักอยู่ในยอด TikTok จนกว่าจะถอน)
   - Shopee: ยอดโอนรายวัน (ออเดอร์ + เงินปรับปรุงยอด) ตามวันที่โอนเงินสำเร็จ
   - Lazada: ยอดเข้ารายสัปดาห์ (Lazada สรุปยอดแล้วโอนเป็นรอบ)
   การยืนยันเก็บใน store deposits: { id, ok, got, gotDate, note } (id เดียวกับแถว) */
(function (A) {
  const U = A.U, ui = A.ui, C = A.calc;
  const B = {};
  const TOL = 1;

  /* แถวเงินที่ควรเข้าบัญชีในช่วง from–to */
  B.rows = (from, to, pf) => {
    const out = [];
    const conf = (id) => A.db.get('deposits', id);
    A.db.all('deposits').filter((d) => d.kind === 'wd' && d.date >= from && d.date <= to && (!pf || d.platform === pf)).forEach((d) => {
      out.push({ id: d.id, platform: d.platform, date: d.date, amount: d.amount, label: `ถอนเงิน • อ้างอิง ${d.ref}`, sub: d.status && !/transferred|สำเร็จ|success/i.test(d.status) ? d.status : '', rec: d });
    });
    const sums = new Map();
    const add = (p, d, amt, isOrder) => {
      if (p === 'tiktok' || (pf && p !== pf) || !d) return;
      const key = p === 'lazada' ? U.weekStart(d) : d;
      const date = p === 'lazada' ? U.addDays(key, 6) : key; // Lazada: นับรอบสัปดาห์ไว้ที่วันสุดท้ายของสัปดาห์
      if (date < from || date > to) return;
      const id = `${p}:${p === 'lazada' ? 'week' : 'day'}:${key}`;
      const cur = sums.get(id) || { id, platform: p, date, key, amount: 0, n: 0 };
      cur.amount += amt; if (isOrder) cur.n++;
      sums.set(id, cur);
    };
    A.db.all('orders').forEach((o) => C.payoutParts(o).forEach((p) => add(o.platform, p.date, p.amount || 0, true)));
    A.db.all('otherIncome').filter((e) => e.auto && e.platform).forEach((e) => add(e.platform, e.date, e.amount || 0, false));
    sums.forEach((s) => {
      if (Math.abs(s.amount) < 0.005) return;
      out.push({ id: s.id, platform: s.platform, date: s.date, amount: U.round2(s.amount), label: s.platform === 'lazada' ? `ยอดเข้ารายสัปดาห์ ${U.thDate(s.key)} – ${U.thDate(U.addDays(s.key, 6))}` : 'ยอดโอนรายวัน', sub: `${U.num(s.n)} ออเดอร์`, rec: conf(s.id) });
    });
    out.forEach((r) => {
      const c = r.rec && r.rec.ok ? r.rec : null;
      r.ok = !!c; r.got = c ? (c.got != null ? c.got : r.amount) : null; r.gotDate = c ? c.gotDate || r.date : '';
      r.diff = c ? U.round2(r.got - r.amount) : 0;
      r.state = !c ? 'pending' : Math.abs(r.diff) > TOL ? 'diff' : 'ok';
    });
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.platform.localeCompare(b.platform));
  };
  B.badge = () => {
    const to = U.addDays(U.today(), -3), from = U.addDays(U.today(), -30);
    return B.rows(from, to).filter((r) => r.state !== 'ok').length;
  };
  /* เงินที่ยังพักอยู่ในยอด TikTok = เงินเข้ายอด (Earnings) − ถอนเข้าธนาคาร (Withdrawal) ในช่วงที่นำเข้าไฟล์ (ไม่รวมยอดยกมาก่อนหน้า) */
  B.tiktokBalance = () => {
    const rs = A.db.all('deposits').filter((d) => d.platform === 'tiktok' && (d.kind === 'wd' || d.kind === 'earn'));
    if (!rs.some((d) => d.kind === 'wd')) return null;
    const inn = U.sum(rs.filter((d) => d.kind === 'earn'), (d) => d.amount), out = U.sum(rs.filter((d) => d.kind === 'wd'), (d) => d.amount);
    return { since: rs.map((d) => d.date).sort()[0], in: U.round2(inn), out: U.round2(out), bal: U.round2(inn - out) };
  };
  A.bankLib = B;

  const state = { month: null, pf: '', tab: 'all' };
  const TABS = [['all', 'ทั้งหมด', () => true], ['pending', 'รอยืนยัน', (r) => r.state === 'pending'], ['ok', 'ถึงบัญชีแล้ว', (r) => r.state === 'ok'], ['diff', 'ยอดไม่ตรง', (r) => r.state === 'diff']];
  A.pages.bank = {
    desc: 'ติ๊กยืนยันเมื่อเงินถึงบัญชีธนาคารจริง โปรแกรมจะเตือนรอบที่ยังไม่เข้าหรือยอดไม่ตรง',
    render(el) { if (!state.month) state.month = U.monthStart(U.today()); draw(el); },
  };

  const confirm = async (r, got, gotDate, note) => {
    const cur = A.db.get('deposits', r.id) || { id: r.id, kind: 'confirm', platform: r.platform };
    await A.db.put('deposits', { ...cur, ok: true, got: U.round2(got), gotDate, note: note != null ? note : cur.note || '' });
  };

  function draw(el) {
    const from = state.month, to = U.monthEnd(from);
    const blocked = A.sync && A.sync.blocked && A.sync.blocked().includes('deposits');
    const all = B.rows(from, to, state.pf);
    const tab = TABS.find((t) => t[0] === state.tab) || TABS[0];
    const list = all.filter(tab[2]);
    const pend = all.filter((r) => r.state === 'pending'), diff = all.filter((r) => r.state === 'diff');
    const tb = !state.pf || state.pf === 'tiktok' ? B.tiktokBalance() : null;
    const noWd = (!state.pf || state.pf === 'tiktok') && !A.db.all('deposits').some((d) => d.kind === 'wd' && d.platform === 'tiktok') && A.db.all('orders').some((o) => o.platform === 'tiktok' && C.isPaid(o));
    el.innerHTML = `
      ${blocked ? `<div class="notice warn">${A.icon('alert')}<div>ข้อมูลเงินเข้าธนาคารยังไม่ซิงก์ขึ้นคลาวด์ — เจ้าของร้านต้องเผยแพร่ <b>firestore.rules</b> ฉบับใหม่ใน Firebase Console ก่อน</div></div>` : ''}
      ${noWd ? `<div class="notice ${blocked ? 'mt' : ''}">${A.icon('info')}<div>ยังไม่มียอดถอนเงินของ TikTok — นำเข้า<b>ไฟล์รายได้ของ TikTok</b> อีกครั้ง โปรแกรมจะอ่านชีต "บันทึกการถอน" ให้ (เงิน TikTok จะเข้าบัญชีเมื่อถอน ไม่ใช่ตอนออเดอร์สำเร็จ)</div></div>` : ''}
      <div class="kpis ${blocked || noWd ? 'mt' : ''}">
        ${ui.kpi({ label: 'ควรเข้าบัญชีเดือนนี้', value: U.money(U.sum(all, (r) => r.amount)), foot: `${U.num(all.length)} รอบโอน`, icon: 'bank', tone: 'blue' })}
        ${ui.kpi({ label: 'ยืนยันว่าถึงบัญชีแล้ว', value: U.money(U.sum(all.filter((r) => r.ok), (r) => r.got)), foot: `${U.num(all.filter((r) => r.ok).length)} รอบ`, icon: 'check', tone: 'mint' })}
        ${ui.kpi({ label: 'รอยืนยัน', value: U.money(U.sum(pend, (r) => r.amount)), foot: `${U.num(pend.length)} รอบ`, icon: 'clock', tone: 'butter' })}
        ${ui.kpi({ label: 'ยอดไม่ตรง', value: U.money(U.sum(diff, (r) => r.diff)), foot: `${U.num(diff.length)} รอบ (ต่างเกิน ${TOL} บาท)`, icon: 'alert', tone: 'pink' })}
        ${tb ? ui.kpi({ label: 'เงินพักในยอด TikTok (โดยประมาณ)', value: U.money(tb.bal), foot: `เข้ายอด ${U.money0(tb.in)} − ถอน ${U.money0(tb.out)} ตั้งแต่ ${U.thDate(tb.since)}`, icon: 'wallet', tone: 'blue' }) : ''}
      </div>
      <div class="card mt">
        <div class="row">
          <button class="icon-btn" id="m-prev">${A.icon('chevL')}</button>
          <input class="input" type="month" id="m-pick" value="${from.slice(0, 7)}">
          <button class="icon-btn" id="m-next">${A.icon('chevR')}</button>
          ${ui.pfSelect(state.pf, 'ทุกแพลตฟอร์ม', 'id="pf"')}
          <div class="tabs">${TABS.map(([id, l, fn]) => `<button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">${l} <span class="count">${all.filter(fn).length}</span></button>`).join('')}</div>
          <span class="spacer"></span>
          ${pend.length ? `<button class="btn ghost sm" id="all-ok">${A.icon('check')} ยืนยันที่รอทั้งหมด (${pend.length})</button>` : ''}
          <button class="btn ghost sm" id="xl">${A.icon('download')} Excel</button>
        </div>
        <p class="small muted mt-s">เทียบกับสมุดบัญชี/แอปธนาคาร แล้วกด ✓ เมื่อเงินเข้าจริง • ถ้ายอดที่เข้าไม่เท่ากัน คลิกที่แถวเพื่อใส่ยอดจริง</p>
        <div class="mt-s">${ui.table([
          { h: 'วันที่', v: (r) => U.thDate(r.date) },
          { h: 'แพลตฟอร์ม', v: (r) => ui.pf(r.platform) },
          { h: 'รายการ', v: (r) => `${U.esc(r.label)}${r.sub ? `<div class="small muted">${U.esc(r.sub)}</div>` : ''}` },
          { h: 'ควรเข้า', cls: 'num', v: (r) => U.money(r.amount) },
          { h: 'เข้าบัญชีจริง', cls: 'num', v: (r) => (r.ok ? `<b>${U.money(r.got)}</b>${r.gotDate !== r.date ? `<div class="small muted">${U.thDate(r.gotDate)}</div>` : ''}` : '–') },
          { h: 'สถานะ', v: (r) => (r.state === 'ok' ? '<span class="badge b-green">ถึงบัญชีแล้ว</span>' : r.state === 'diff' ? `<span class="badge b-red">ต่าง ${U.money(r.diff)}</span>` : '<span class="badge b-butter">รอยืนยัน</span>') + (r.rec && r.rec.note ? `<div class="small muted">${U.esc(r.rec.note)}</div>` : '') },
          { h: '', v: (r) => (r.ok ? '' : `<button class="btn mint sm" data-ok="${U.esc(r.id)}" title="เงินเข้าครบตามยอด">${A.icon('check')}</button>`) },
        ], list, { onRow: true, empty: 'ไม่มีรอบโอนในเดือนนี้ — นำเข้าไฟล์รายได้ของเดือนนี้ก่อน',
          foot: [{ v: 'รวม' }, { v: '' }, { v: `${U.num(list.length)} รอบ` }, { cls: 'num', v: U.money(U.sum(list, (r) => r.amount)) }, { cls: 'num', v: U.money(U.sum(list.filter((r) => r.ok), (r) => r.got)) }, { v: '' }, { v: '' }] })}</div>
      </div>`;
    el.querySelector('#m-prev').onclick = () => { state.month = U.addMonths(state.month, -1); draw(el); };
    el.querySelector('#m-next').onclick = () => { state.month = U.addMonths(state.month, 1); draw(el); };
    el.querySelector('#m-pick').onchange = (e) => { if (e.target.value) { state.month = e.target.value + '-01'; draw(el); } };
    el.querySelector('#pf').onchange = (e) => { state.pf = e.target.value; draw(el); };
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; draw(el); }; });
    el.querySelectorAll('[data-ok]').forEach((b) => {
      b.onclick = async () => { const r = all.find((x) => x.id === b.dataset.ok); await confirm(r, r.amount, r.date); ui.toast(`ยืนยัน ${U.money(r.amount)} ถึงบัญชีแล้ว`, 'ok'); draw(el); A.renderSidebar(); };
    });
    const ao = el.querySelector('#all-ok');
    if (ao) ao.onclick = async () => {
      if (!(await ui.confirm('ยืนยันทุกรอบที่รอ?', `${pend.length} รอบ รวม ${U.money(U.sum(pend, (r) => r.amount))} — กดเมื่อเช็กกับบัญชีธนาคารแล้วว่าเข้าครบทุกรอบ`))) return;
      for (const r of pend) await confirm(r, r.amount, r.date);
      ui.toast('ยืนยันแล้ว', 'ok'); draw(el); A.renderSidebar();
    };
    ui.bindRows(el.querySelector('.card.mt'), list, (r) => editModal(el, r));
    el.querySelector('#xl').onclick = () => A.exportSheets(`เงินเข้าธนาคาร_${A.settings().shopName}_${from.slice(0, 7)}.xlsx`, [{ name: 'เงินเข้าบัญชีธนาคาร', title: 'เงินเข้าบัญชีธนาคาร', sub: `${U.thMonth(from)}${state.pf ? ' • ' + A.PLATFORMS[state.pf].name : ''}`, tables: [{ cols: [
      { h: 'วันที่', w: 12, t: 'date', v: (r) => r.date },
      { h: 'แพลตฟอร์ม', w: 10, t: 'text', v: (r) => A.PLATFORMS[r.platform].name },
      { h: 'รายการ', w: 40, t: 'text', v: (r) => r.label + (r.sub ? ` (${r.sub})` : '') },
      { h: 'ควรเข้า', t: 'money', v: (r) => r.amount },
      { h: 'เข้าบัญชีจริง', t: 'money', v: (r) => (r.ok ? r.got : null) },
      { h: 'วันที่เข้าจริง', w: 12, t: 'date', v: (r) => r.gotDate || null },
      { h: 'สถานะ', w: 16, t: 'text', v: (r) => ({ ok: 'ถึงบัญชีแล้ว', diff: 'ยอดไม่ตรง', pending: 'รอยืนยัน' })[r.state] },
      { h: 'โน้ต', w: 24, t: 'text', v: (r) => (r.rec && r.rec.note) || '' },
    ], rows: list }] }]);
  }

  function editModal(el, r) {
    ui.modal({
      title: 'เงินเข้าบัญชีธนาคาร',
      body: `<p class="muted small">${ui.pf(r.platform)} ${U.esc(r.label)} • ควรเข้า <b>${U.money(r.amount)}</b> (${U.thDate(r.date)})</p>
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>ยอดที่เข้าบัญชีจริง (บาท)</label><input class="input" type="number" step="0.01" data-got value="${r.ok ? r.got : r.amount}"></div>
          <div class="field"><label>วันที่เข้าบัญชี</label><input class="input" type="date" data-date value="${r.gotDate || r.date}"></div>
          <div class="field" style="grid-column:1/-1"><label>โน้ต</label><input class="input" data-note value="${U.esc((r.rec && r.rec.note) || '')}" placeholder="เช่น เข้ารวมกับรอบถัดไป"></div>
        </div>`,
      actions: [
        ...(r.ok ? [{ label: 'ยกเลิกการยืนยัน', cls: 'ghost', onClick: async () => { await A.db.put('deposits', { ...A.db.get('deposits', r.id), ok: false }); ui.toast('ยกเลิกแล้ว'); draw(el); A.renderSidebar(); } }] : []),
        { label: `${A.icon('check')} บันทึกว่าเข้าบัญชีแล้ว`, cls: 'mint', onClick: async (_c, root) => {
          const got = parseFloat(root.querySelector('[data-got]').value), d = root.querySelector('[data-date]').value;
          if (isNaN(got) || !d) { ui.toast('ใส่ยอดและวันที่ก่อนนะ', 'err'); return false; }
          await confirm(r, got, d, root.querySelector('[data-note]').value.trim());
          ui.toast('บันทึกแล้ว', 'ok'); draw(el); A.renderSidebar();
        } },
      ],
    });
  }
})(window.App);
