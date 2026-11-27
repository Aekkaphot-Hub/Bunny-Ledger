/* ชิ้นส่วนหน้าจอที่ใช้ร่วมกัน: toast, modal, ป้าย, การ์ดตัวเลข, หน้าต่างรายละเอียดออเดอร์ */
(function (A) {
  const U = A.U;
  const ui = {};

  ui.toast = (msg, type = '') => {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 3200);
  };

  /* modal({title, body(html), wide, actions:[{label, cls, onClick(close, root) -> false to keep open}]}) */
  ui.modal = ({ title, body, wide, actions = [], onOpen }) => {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${U.esc(title)}</h3><button class="icon-btn" data-x title="ปิด">${A.icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${actions.length ? '<div class="modal-foot"></div>' : ''}
    </div>`;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.querySelector('[data-x]').onclick = close;
    const foot = back.querySelector('.modal-foot');
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = `btn ${a.cls || ''}`;
      b.innerHTML = a.label;
      b.onclick = async () => {
        if (!a.onClick) return close();
        b.disabled = true;
        try { const r = await a.onClick(close, back); if (r !== false) close(); } catch (e) { ui.toast(e.message || String(e), 'err'); } finally { b.disabled = false; }
      };
      foot.appendChild(b);
    });
    root.appendChild(back);
    if (onOpen) onOpen(back, close);
    const first = back.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return { root: back, close };
  };
  ui.confirm = (title, msg, okLabel = 'ยืนยัน', danger = false) => new Promise((resolve) => {
    let done = false;
    const m = ui.modal({
      title, body: `<p>${msg}</p>`,
      actions: [
        { label: 'ยกเลิก', cls: 'ghost', onClick: () => { done = true; resolve(false); } },
        { label: okLabel, cls: danger ? 'danger' : '', onClick: () => { done = true; resolve(true); } },
      ],
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.root)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
  });

  ui.pf = (key) => {
    const p = A.PLATFORMS[key];
    if (!p) return '<span class="badge b-grey">–</span>';
    return `<span class="badge pf-${key}"><span class="pf-dot" style="background:${p.color}"></span>${p.name}</span>`;
  };
  ui.status = (st) => {
    const s = A.STATUS[st];
    return s ? `<span class="badge st-${st}">${s.label}</span>` : '<span class="badge b-grey">ไม่ทราบ</span>';
  };
  ui.kpi = ({ label, value, foot = '', icon = 'sparkle', tone = 'pink', href }) => {
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi tone-${tone}" ${href ? `href="${href}"` : ''}>
      <span class="k-ic">${A.icon(icon)}</span>
      <div class="k-label">${label}</div>
      <div class="k-value">${value}</div>
      ${foot ? `<div class="k-foot">${foot}</div>` : ''}
    </${tag}>`;
  };
  ui.delta = (cur, prev) => {
    if (!prev) return cur ? '<span class="delta-up">ใหม่</span>' : '';
    const d = (cur - prev) / Math.abs(prev);
    if (Math.abs(d) < 0.0005) return '<span class="muted">เท่าเดิม</span>';
    return d > 0 ? `<span class="delta-up">▲ ${U.pct(d)}</span>` : `<span class="delta-down">▼ ${U.pct(-d)}</span>`;
  };
  ui.empty = (title, text, btns = '') => `<div class="empty"><img src="assets/img/bunny-logo.svg" alt=""><h3>${title}</h3><p>${text}</p>${btns}</div>`;
  ui.pfSelect = (val, allLabel = 'ทุกแพลตฟอร์ม', attrs = '') =>
    `<select class="input" ${attrs}><option value="">${allLabel}</option>${A.PF_KEYS.map((k) => `<option value="${k}" ${val === k ? 'selected' : ''}>${A.PLATFORMS[k].name}</option>`).join('')}</select>`;

  ui.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ui.toast('คัดลอกแล้ว: ' + text, 'ok'); }
    catch (e) { ui.toast('คัดลอกไม่ได้', 'err'); }
  };

  /* หน้าต่างรายละเอียดออเดอร์ (แก้ไขโน้ต / บันทึกรับเงิน / ลูกค้าได้รับแล้ว) */
  ui.orderModal = (id) => {
    const o = A.db.get('orders', id);
    if (!o) return;
    const st = A.settings();
    const C = A.calc;
    const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    const body = `
      <dl class="kv">
        ${row('แพลตฟอร์ม', ui.pf(o.platform) + (o.shop ? ` <span class="muted small">${U.esc(o.shop)}</span>` : ''))}
        ${row('เลขคำสั่งซื้อ', `<b>${U.esc(o.orderNo)}</b> <button class="icon-btn" data-copy="${U.esc(o.orderNo)}">${A.icon('copy')}</button>`)}
        ${row('สถานะ', ui.status(o.status))}
        ${row('สินค้า', U.esc(o.items || '–') + (o.qty ? ` <span class="muted">× ${o.qty}</span>` : ''))}
        ${row('วันที่สั่งซื้อ', U.thDate(o.orderDate))}
        ${row('วันที่จัดส่ง', o.shipDate ? U.thDate(o.shipDate) : `– <span class="muted small">${C.saleDate(o) ? `(ไฟล์ไม่มีวันส่ง — นับยอดขายวันที่ ${U.thDate(C.saleDate(o))})` : '(ยังไม่ส่ง — ยังไม่นับเป็นยอดขาย)'}</span>`)}
        ${row('วันที่ลูกค้าได้รับ', U.thDate(o.deliveredDate || o.completedDate))}
        ${row('เลขพัสดุ', o.trackingNo ? `${U.esc(o.trackingNo)} <button class="icon-btn" data-copy="${U.esc(o.trackingNo)}">${A.icon('copy')}</button> <span class="muted small">${U.esc(o.carrier || '')}</span>` : '–')}
        ${row('ยอดขาย (ของร้าน)', U.money(o.grossSales) + (o.buyerPaid != null && o.buyerPaid !== o.grossSales ? ` <span class="muted small">ลูกค้าจ่าย ${U.money(o.buyerPaid)}</span>` : ''))}
        ${o.refundAmount || o.returnNote ? row('คืนเงิน/คืนสินค้า', `${o.refundAmount ? U.money(o.refundAmount) : ''} <span class="muted small">${U.esc(o.returnNote || '')}</span>`) : ''}
        ${row('ค่าธรรมเนียม', U.money(C.fees(o, st)) + (C.feesEstimated(o) ? ' <span class="badge b-butter">ประมาณการ</span>' : ''))}
        ${row('ยอดที่ควรได้', U.money(C.expected(o, st)))}
        ${row('เงินเข้าจริง', C.isPaid(o) ? `<b>${U.money(o.actualPayout)}</b> <span class="muted small">${C.payoutParts(o).length > 1 ? C.payoutParts(o).map((p) => `${U.thDate(p.date)} ${U.money(p.amount)}`).join(' • ') : U.thDate(o.payoutDate)}${o.manualPaid ? ' (บันทึกเอง)' : ''}</span>` : '<span class="badge b-pink">ยังไม่เข้า</span>')}
        ${row('ที่มา', U.esc(o.source || '–'))}
      </dl>
      <div class="field mt"><label>โน้ตการติดตาม</label><textarea class="input" rows="2" data-note style="font-family:inherit">${U.esc(o.note || '')}</textarea></div>`;
    const actions = [];
    if (!C.isPaid(o)) actions.push({ label: `${A.icon('wallet')} ได้รับเงินแล้ว`, cls: 'mint', onClick: (close) => { close(); ui.markPaid(o.id); return false; } });
    // ย้อนสถานะเงินเข้า: ลบยอดเงินเข้าของออเดอร์ทิ้ง → ต้องถามยืนยันก่อนเสมอ (ปุ่มนี้อยู่ข้างปุ่มอื่นในหน้าต่าง กดพลาดง่าย)
    else actions.push({ label: `${A.icon('refresh')} ยกเลิกสถานะเงินเข้า`, cls: 'ghost', onClick: async (close) => {
      close();
      const msg = o.manualPaid
        ? `ลบยอดเงินเข้า <b>${U.money(o.actualPayout)}</b> ที่บันทึกเองไว้ แล้วกลับเป็น "ยังไม่ได้รับเงิน"`
        : `ยอดเงินเข้า <b>${U.money(o.actualPayout)}</b> ของออเดอร์นี้<b>มาจากไฟล์ที่นำเข้า</b> ถ้ายกเลิก ยอดนี้จะหายจากรายงานเงินเข้า และจะกลับมาเมื่อนำเข้าไฟล์รายได้นั้นอีกครั้ง`;
      if (!(await ui.confirm('ยกเลิกสถานะเงินเข้า?', msg, 'ยกเลิกสถานะเงินเข้า', true))) return false;
      await A.db.put('orders', { ...(A.db.get('orders', o.id) || o), actualPayout: null, payoutDate: null, payoutParts: null, manualPaid: false });
      ui.toast('ย้อนกลับเป็นยังไม่ได้รับเงินแล้ว');
      A.rerender();
      return false;
    } });
    if (o.status === 'shipped' || o.status === 'pending_ship') actions.push({ label: `${A.icon('check')} ลูกค้าได้รับแล้ว`, cls: 'blue', onClick: async () => { await A.db.put('orders', { ...o, status: 'delivered', deliveredDate: o.deliveredDate || U.today() }); ui.toast('บันทึกว่าลูกค้าได้รับของแล้ว', 'ok'); A.rerender(); } });
    actions.push({ label: 'บันทึกโน้ต', onClick: async (_c, root) => { await A.db.put('orders', { ...A.db.get('orders', o.id), note: root.querySelector('[data-note]').value.trim() }); ui.toast('บันทึกแล้ว', 'ok'); A.rerender(); } });
    const m = ui.modal({ title: 'รายละเอียดออเดอร์', body, actions, wide: false });
    m.root.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => ui.copy(b.dataset.copy); });
  };

  ui.markPaid = (id) => {
    const o = A.db.get('orders', id);
    if (!o) return;
    ui.modal({
      title: 'บันทึกว่าได้รับเงินแล้ว',
      body: `<p class="muted small">${A.PLATFORMS[o.platform].name} • ${U.esc(o.orderNo)}</p>
        <div class="form-grid">
          <div class="field"><label>ยอดเงินที่ได้รับ (บาท)</label><input class="input" type="number" step="0.01" data-amt value="${U.round2(A.calc.expected(o))}"></div>
          <div class="field"><label>วันที่เงินเข้า</label><input class="input" type="date" data-date value="${U.today()}"></div>
        </div>`,
      actions: [
        { label: 'ยกเลิก', cls: 'ghost' },
        { label: 'บันทึก', cls: 'mint', onClick: async (_c, root) => {
          const amt = parseFloat(root.querySelector('[data-amt]').value);
          const date = root.querySelector('[data-date]').value;
          if (isNaN(amt) || !date) { ui.toast('กรอกยอดเงินและวันที่ก่อนนะ', 'err'); return false; }
          await A.db.put('orders', { ...o, actualPayout: amt, payoutDate: date, manualPaid: true });
          ui.toast('บันทึกเงินเข้าเรียบร้อย', 'ok');
          A.rerender();
        } },
      ],
    });
  };

  /* simple sortable-ish table builder: cols [{h, cls, v(row) -> html}] */
  ui.table = (cols, rows, { onRow, foot, empty = 'ไม่มีรายการ', max = 500, rowCls } = {}) => {
    if (!rows.length) return `<div class="empty" style="padding:18px"><p>${empty}</p></div>`;
    const shown = rows.slice(0, max);
    return `<div class="table-wrap tbl-scroll"><table class="tbl">
      <thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((r, i) => `<tr class="${onRow ? 'clickable' : ''} ${rowCls ? rowCls(r) : ''}" data-i="${i}">${cols.map((c) => `<td class="${c.cls || ''}">${c.v(r)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${foot ? `<tfoot><tr>${foot.map((f) => `<td class="${f.cls || ''}">${f.v}</td>`).join('')}</tr></tfoot>` : ''}
    </table></div>${rows.length > max ? `<p class="muted small">แสดง ${max} จาก ${U.num(rows.length)} รายการ — ใช้ตัวกรองหรือส่งออก Excel เพื่อดูทั้งหมด</p>` : ''}`;
  };
  ui.bindRows = (container, rows, onRow) => {
    container.querySelectorAll('tbody tr[data-i]').forEach((tr) => {
      tr.addEventListener('click', (e) => { if (e.target.closest('button, a, input')) return; onRow(rows[+tr.dataset.i]); });
    });
  };

  A.ui = ui;
})(window.App);
