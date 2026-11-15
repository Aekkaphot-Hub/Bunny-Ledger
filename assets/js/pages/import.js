/* หน้า: นำเข้าข้อมูล */
(function (A) {
  const U = A.U, ui = A.ui, I = A.importers;
  let queue = []; // [{file, parsed, platform, report, mapping, shop, error, fromTpl}]

  A.pages.import = {
    desc: 'ลากไฟล์ออเดอร์ / รายได้ จาก Seller Center มาวาง — นำเข้าซ้ำได้ ไม่ซ้ำซ้อน',
    render(el) {
      el.innerHTML = `
        <div class="grid g-2-1">
          <div>
            <label class="dropzone" id="dz">
              <input type="file" id="file-in" multiple accept=".csv,.xlsx,.xls,.txt" hidden>
              <img src="assets/img/bunny-logo.svg" alt="">
              <h3>ลากไฟล์มาวางตรงนี้ หรือคลิกเพื่อเลือก</h3>
              <p class="muted">รองรับ .xlsx .xls .csv จาก Shopee • Lazada • TikTok (เลือกได้หลายไฟล์พร้อมกัน)</p>
            </label>
            <div id="queue" class="mt"></div>
          </div>
          <div>
            <div class="card">
              <div class="card-head"><h3>${A.icon('info')} ไฟล์ที่ควรนำเข้า</h3></div>
              <ol class="steps">
                <li><div><b>ไฟล์คำสั่งซื้อ</b> — ใช้ดูสถานะ เลขพัสดุ ยอดขาย <span class="muted">(นำเข้าทุกวัน/ทุกครั้งที่อัปเดต)</span></div></li>
                <li><div><b>ไฟล์รายได้ / การโอนเงิน</b> — ใช้เช็กว่าเงินเข้าแล้ว ออเดอร์จะหายจาก "ลูกหนี้แพลตฟอร์ม" เอง</div></li>
                <li><div>ถ้าโปรแกรมเดาคอลัมน์ไม่ถูก กด <b>ปรับคอลัมน์</b> แล้วติ๊ก "จำการจับคู่นี้" ครั้งหน้าจะใช้ได้ทันที</div></li>
              </ol>
              <p class="small muted mt-s">${A.icon('check')} ยอดขายนับตาม <b>วันที่ส่งสินค้า</b> • ข้อมูลลูกค้า (ชื่อ ที่อยู่ เบอร์โทร อีเมล เลขผู้เสียภาษี ข้อความ) ถูกตัดทิ้งตั้งแต่ตอนอ่านไฟล์ ไม่ถูกเก็บในโปรแกรม</p>
              <p class="small muted mt-s">ดูวิธีดาวน์โหลดไฟล์ของแต่ละแพลตฟอร์มได้ที่หน้า <a href="#/shops">ร้านค้าของฉัน</a></p>
            </div>
            <div class="card">
              <div class="card-head"><h3>${A.icon('clock')} ประวัติการนำเข้า</h3></div>
              <div id="history"></div>
            </div>
          </div>
        </div>`;
      const dz = el.querySelector('#dz');
      const inp = el.querySelector('#file-in');
      inp.onchange = () => { addFiles([...inp.files]); inp.value = ''; };
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
      dz.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
      drawQueue(el);
      drawHistory(el);

      async function addFiles(files) {
        for (const file of files) {
          const item = { file, id: U.uid() };
          queue.push(item);
          try {
            item.parsed = await I.readFile(file);
            const tpl = I.findTemplate(item.parsed.headers);
            if (tpl) {
              item.platform = tpl.platform; item.report = tpl.report; item.mapping = { ...I.autoMap(item.parsed.headers, tpl.report), ...I.templateMapping(tpl, item.parsed.headers) }; item.fromTpl = true; item.sure = true;
            } else {
              const d = I.detect(item.parsed.headers, file.name);
              Object.assign(item, { platform: d.platform, report: d.report, mapping: d.mapping, sure: d.sure });
            }
            rebuild(item);
          } catch (e) {
            console.error(e);
            item.error = e.message || String(e);
          }
          drawQueue(el);
        }
      }
    },
  };

  function rebuild(item) {
    try {
      item.built = I.build(item.parsed, item.platform, item.report, item.mapping, item.shop);
      item.error = item.mapping.orderNo == null ? 'ไม่พบคอลัมน์เลขคำสั่งซื้อ — กด "ปรับคอลัมน์" เพื่อเลือกเอง' : (item.report === 'income' && item.mapping.actualPayout == null && item.mapping.amount == null ? 'ไม่พบคอลัมน์ยอดเงินที่ได้รับ — กด "ปรับคอลัมน์"' : null);
    } catch (e) { item.error = e.message; }
  }

  function drawQueue(el) {
    const box = el.querySelector('#queue');
    if (!box) return;
    const st = A.settings();
    // "26 ออเดอร์ (28 รายการสินค้า)" — Lazada นับสินค้าแต่ละชิ้นในออเดอร์เป็นคนละรายการ
    const itemsNote = (items, orders) => (items && items !== orders ? ` (${U.num(items)} รายการสินค้า)` : '');
    box.innerHTML = queue.map((it) => {
      if (!it.parsed && !it.error) return `<div class="card"><b>${U.esc(it.file.name)}</b> <span class="muted">กำลังอ่าน…</span></div>`;
      if (!it.parsed) return `<div class="card"><div class="row"><b>${U.esc(it.file.name)}</b><span class="spacer"></span><button class="icon-btn" data-drop="${it.id}">${A.icon('x')}</button></div><div class="notice red mt-s">${A.icon('alert')}<div>${U.esc(it.error)}</div></div></div>`;
      const recs = it.built ? it.built.records.filter((r) => !r._compOnly) : [];
      const shops = st.shops.filter((s) => s.platform === it.platform);
      const preview = recs.slice(0, 5);
      const cols = it.report === 'orders'
        ? [{ h: 'เลขคำสั่งซื้อ', v: (r) => U.esc(r.orderNo) }, { h: 'วันที่ส่ง', v: (r) => (r.shipDate ? U.thDate(r.shipDate) : `<span class="muted small">${r.deliveredDate ? 'ได้รับ ' + U.thDate(r.deliveredDate) : 'ยังไม่ส่ง/ไม่มีในไฟล์'}</span>`) }, { h: 'สถานะ', v: (r) => ui.status(r.status) + (r.statusRaw ? `<div class="small muted">${U.esc(r.statusRaw)}</div>` : '') },
          { h: 'สินค้า', cls: 'ell', v: (r) => U.esc(r.items || '') }, { h: 'ยอดขาย', cls: 'num', v: (r) => U.money(r.grossSales) }, { h: 'เลขพัสดุ', v: (r) => U.esc(r.trackingNo || '–') }]
        : [{ h: 'เลขคำสั่งซื้อ', v: (r) => U.esc(r.orderNo) }, { h: 'วันที่เงินเข้า', v: (r) => U.thDate(r.payoutDate) }, { h: 'ยอดขาย', cls: 'num', v: (r) => U.money(r.grossSales) },
          { h: 'ค่าธรรมเนียม', cls: 'num', v: (r) => U.money(r.platformFees) }, { h: 'เงินเข้า', cls: 'num', v: (r) => U.money(r.actualPayout) }];
      return `<div class="card" data-item="${it.id}">
        <div class="card-head">
          <h3>${A.icon('file')} ${U.esc(it.file.name)}</h3>
          <button class="icon-btn" data-drop="${it.id}" title="เอาออก">${A.icon('x')}</button>
        </div>
        <div class="row">
          <div class="field"><label>แพลตฟอร์ม</label><select class="input" data-f="platform">${A.PF_KEYS.map((k) => `<option value="${k}" ${it.platform === k ? 'selected' : ''}>${A.PLATFORMS[k].name}</option>`).join('')}</select></div>
          <div class="field"><label>ชนิดไฟล์</label><select class="input" data-f="report"><option value="orders" ${it.report === 'orders' ? 'selected' : ''}>คำสั่งซื้อ (ออเดอร์)</option><option value="income" ${it.report === 'income' ? 'selected' : ''}>รายได้ / การโอนเงิน</option></select></div>
          <div class="field"><label>ร้าน</label><select class="input" data-f="shop"><option value="">— ไม่ระบุ —</option>${shops.map((s) => `<option ${it.shop === s.name ? 'selected' : ''}>${U.esc(s.name)}</option>`).join('')}</select></div>
          <span class="spacer"></span>
          <div class="small muted right">${U.num(it.built ? it.built.rowCount : 0)} แถว → <b>${U.num(recs.length)}</b> ออเดอร์<b>${itemsNote(it.built && it.built.itemCount, recs.length)}</b>${it.built && it.built.skipped ? `<br>ข้าม ${U.num(it.built.skipped)} แถว` : ''}</div>
        </div>
        ${it.parsed.piiCols && it.parsed.piiCols.length ? `<div class="notice mt-s" title="${U.esc(it.parsed.piiCols.join(', '))}">${A.icon('check')}<div>ตัดข้อมูลลูกค้าทิ้งแล้ว ${it.parsed.piiCols.length} คอลัมน์ (ชื่อ ที่อยู่ เบอร์โทร ฯลฯ) — <b>ไม่ถูกเก็บในโปรแกรม ไม่ขึ้นคลาวด์ ไม่ออกไปกับไฟล์ Excel</b></div></div>` : ''}
        ${it.built && it.built.linked && it.built.linked.length ? `<div class="notice ok mt-s">${A.icon('check')}<div>เงินชดเชยที่ระบุเลขคำสั่งซื้อ ${it.built.linked.length} รายการ (${U.money(U.sum(it.built.linked, (a) => a.amount))}) — นับรวมเป็นเงินเข้าของออเดอร์นั้น (เช่น ชดเชยสินค้าตีกลับ)</div></div>` : ''}
        ${it.built && it.built.adjustments && it.built.adjustments.length ? `<div class="notice mt-s">${A.icon('info')}<div>มีรายการเงินชดเชยจากแพลตฟอร์ม ${it.built.adjustments.length} รายการ (${U.money(U.sum(it.built.adjustments, (a) => a.amount))}) — จะบันทึกเป็น "รายรับอื่นๆ"</div></div>` : ''}
        ${it.fromTpl ? `<div class="notice mt-s">${A.icon('check')}<div>ใช้การจับคู่คอลัมน์ที่จำไว้</div></div>` : ''}
        ${!it.sure && !it.fromTpl ? `<div class="notice warn mt-s">${A.icon('alert')}<div>ไม่แน่ใจว่าเป็นไฟล์ของแพลตฟอร์มไหน — โปรดตรวจช่อง "แพลตฟอร์ม" ก่อนบันทึก</div></div>` : ''}
        ${it.error ? `<div class="notice red mt-s">${A.icon('alert')}<div>${U.esc(it.error)}</div></div>` : ''}
        <div class="mt-s">${ui.table(cols, preview, { empty: it.built && it.built.rowCount === 0 ? 'ไฟล์นี้มีแต่หัวตาราง ยังไม่มีออเดอร์ (เช่น แท็บ "ที่ต้องจัดส่ง" ที่ว่างอยู่) — ลองส่งออกแท็บ "ทั้งหมด" แทน' : 'ไม่พบออเดอร์ในไฟล์นี้' })}</div>
        <div id="map-${it.id}" class="hidden mt-s"></div>
        <div class="row mt-s">
          <button class="btn ghost sm" data-map="${it.id}">${A.icon('edit')} ปรับคอลัมน์</button>
          <span class="spacer"></span>
          <button class="btn" data-save="${it.id}" ${!recs.length || it.error ? 'disabled' : ''}>${A.icon('check')} บันทึก ${U.num(recs.length)} ออเดอร์${itemsNote(it.built && it.built.itemCount, recs.length)}</button>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-drop]').forEach((b) => { b.onclick = () => { queue = queue.filter((x) => x.id !== b.dataset.drop); drawQueue(el); }; });
    box.querySelectorAll('[data-item]').forEach((card) => {
      const it = queue.find((x) => x.id === card.dataset.item);
      card.querySelectorAll('[data-f]').forEach((s) => {
        s.onchange = () => {
          const f = s.dataset.f;
          it[f] = s.value || undefined;
          if (f === 'report') it.mapping = I.autoMap(it.parsed.headers, it.report);
          if (f !== 'shop') it.fromTpl = false;
          it.sure = true;
          rebuild(it); drawQueue(el);
        };
      });
    });
    box.querySelectorAll('[data-map]').forEach((b) => { b.onclick = () => drawMapper(el, queue.find((x) => x.id === b.dataset.map)); });
    box.querySelectorAll('[data-save]').forEach((b) => {
      b.onclick = async () => {
        const it = queue.find((x) => x.id === b.dataset.save);
        b.disabled = true;
        try {
          if (it.remember) await I.saveTemplate(it.parsed.headers, it.platform, it.report, it.mapping);
          const r = await I.commit(it.built, { platform: it.platform, report: it.report, filename: it.file.name });
          ui.toast(`นำเข้าแล้ว: ใหม่ ${U.num(r.created)} • อัปเดต ${U.num(r.updated)} ออเดอร์${r.items && r.items !== r.total ? ` (${U.num(r.items)} รายการสินค้า)` : ''}${r.adjustments ? ` • เงินชดเชย ${r.adjustments} รายการ` : ''}`, 'ok');
          queue = queue.filter((x) => x !== it);
          drawQueue(el); drawHistory(el);
        } catch (e) { console.error(e); ui.toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'); b.disabled = false; }
      };
    });
  }

  function drawMapper(el, it) {
    const box = el.querySelector('#map-' + it.id);
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    const fields = I.FIELDS[it.report];
    const opts = (sel) => `<option value="">— ไม่ใช้ —</option>` + it.parsed.headers.map((h, i) => h && !I.isPII(h) ? `<option value="${i}" ${sel === i || (Array.isArray(sel) && sel.includes(i)) ? 'selected' : ''}>${U.esc(h)}</option>` : '').join('');
    box.innerHTML = `<div class="card" style="background:var(--cream)">
      <div class="card-head"><h3>จับคู่คอลัมน์ในไฟล์ → ข้อมูลในโปรแกรม</h3><span class="sub">ค่าธรรมเนียมแยกหลายคอลัมน์ เลือกได้หลายช่อง (กด Ctrl ค้าง)</span></div>
      <div class="form-grid">${Object.entries(fields).map(([k, f]) => `<div class="field"><label>${f.label}${f.required ? ' *' : ''}</label>
        <select class="input" data-k="${k}" ${f.kind === 'multi' ? 'multiple size="4"' : ''}>${opts(it.mapping[k])}</select></div>`).join('')}</div>
      <div class="row mt-s"><label class="check"><input type="checkbox" data-remember ${it.remember ? 'checked' : ''}> จำการจับคู่นี้ไว้ใช้กับไฟล์หัวตารางแบบเดียวกันครั้งหน้า</label><span class="spacer"></span><button class="btn blue sm" data-apply>ใช้การจับคู่นี้</button></div>
    </div>`;
    box.classList.remove('hidden');
    box.querySelector('[data-apply]').onclick = () => {
      const m = {};
      box.querySelectorAll('[data-k]').forEach((s) => {
        if (s.multiple) { const v = [...s.selectedOptions].map((o) => +o.value).filter((x) => !isNaN(x) && o_ok(x)); if (v.length) m[s.dataset.k] = v; }
        else if (s.value !== '') m[s.dataset.k] = +s.value;
      });
      it.mapping = m;
      it.remember = box.querySelector('[data-remember]').checked;
      it.fromTpl = false;
      rebuild(it); drawQueue(el);
      ui.toast('อัปเดตการจับคู่คอลัมน์แล้ว');
    };
    function o_ok(x) { return x >= 0; }
  }

  function drawHistory(el) {
    const box = el.querySelector('#history');
    if (!box) return;
    const rows = A.db.all('imports').sort((a, b) => b.at - a.at).slice(0, 15);
    box.innerHTML = rows.length ? `<div class="todo-list">${rows.map((r) => `<div class="todo tone-${r.report === 'income' ? 'mint' : 'blue'}" style="cursor:default">
      <span class="t-ic">${A.icon(r.report === 'income' ? 'wallet' : 'parcel')}</span>
      <div class="t-main"><b title="${U.esc(r.filename)}">${U.esc(r.filename)}</b><small>${A.PLATFORMS[r.platform] ? A.PLATFORMS[r.platform].name : ''} • ${r.report === 'income' ? 'รายได้' : 'คำสั่งซื้อ'} • ${r.orders != null ? `${r.orders} ออเดอร์${r.items && r.items !== r.orders ? ` (${r.items} รายการสินค้า)` : ''} • ` : ''}ใหม่ ${r.created} / อัปเดต ${r.updated} • ${U.thDateTime(r.at)}</small></div>
    </div>`).join('')}</div>` : '<p class="muted small">ยังไม่เคยนำเข้าไฟล์</p>';
  }
})(window.App);
