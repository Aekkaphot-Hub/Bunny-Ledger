/* ส่งออก Excel (ExcelJS) — หัวตารางสีชมพู/ฟ้า ตัวเลข #,##0.00 ตรึงหัวตาราง แถวรวมเป็นสูตร SUM และรูปกราฟวงกลม */
(function (A) {
  const U = A.U, S = A.summary, C = A.calc;
  const FONT = 'Tahoma';
  const PINK = 'FFF6B5CB', BLUE = 'FF9CCBF0', CREAM = 'FFFBF6EE', INK = 'FF4A4E69', ZEBRA = 'FFFFFBF5', LINE = 'FFEDE4D6';

  A.EXCEL_SHEETS = [
    ['overview', 'สรุปภาพรวม (มีกราฟวงกลม)'],
    ['daily', 'สรุปรายวัน'],
    ['weekly', 'สรุปรายสัปดาห์'],
    ['monthly', 'สรุปรายเดือน'],
    ['orders', 'ออเดอร์-รายรับ'],
    ['receivables', 'ลูกหนี้แพลตฟอร์ม (ณ วันนี้)'],
    ['tracking', 'ติดตามออเดอร์ (ณ วันนี้)'],
    ['expenses', 'รายจ่าย'],
    ['income', 'รายรับอื่นๆ'],
    ['fees', 'ค่าธรรมเนียมแพลตฟอร์ม'],
  ];

  const toDate = (s) => (s ? U.parseYmd(s) : null);
  const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  /* cols: [{h, w, t:'money'|'int'|'date'|'text'|'pct', v(row)}] */
  function table(ws, startRow, cols, rows, { fill = PINK, totals = true, title } = {}) {
    let r = startRow;
    if (title) {
      const c = ws.getCell(r, 1);
      c.value = title; c.font = { name: FONT, bold: true, size: 12, color: { argb: INK } };
      r += 1;
    }
    const head = ws.getRow(r);
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.h;
      cell.font = { name: FONT, bold: true, color: { argb: INK }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9C8B4' } } };
      const col = ws.getColumn(i + 1);
      col.width = Math.max(col.width || 0, c.w || 14);
    });
    head.height = 24;
    const headerRow = r;
    rows.forEach((row, ri) => {
      r += 1;
      const xr = ws.getRow(r);
      cols.forEach((c, i) => {
        const cell = xr.getCell(i + 1);
        let v = c.v(row);
        if (c.t === 'date') v = toDate(v);
        cell.value = v == null || (typeof v === 'number' && isNaN(v)) ? null : v;
        cell.font = { name: FONT, size: 10, color: { argb: INK } };
        if (c.t === 'money') cell.numFmt = '#,##0.00';
        if (c.t === 'int') cell.numFmt = '#,##0';
        if (c.t === 'pct') cell.numFmt = '0.0%';
        if (c.t === 'date') cell.numFmt = 'dd/mm/yyyy';
        if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
        cell.border = { bottom: { style: 'hair', color: { argb: LINE } } };
        if (c.style) Object.assign(cell, c.style(row) || {});
      });
    });
    if (totals && rows.length) {
      r += 1;
      const tr = ws.getRow(r);
      cols.forEach((c, i) => {
        const cell = tr.getCell(i + 1);
        if (i === 0) cell.value = 'รวม';
        else if (c.t === 'money' || c.t === 'int') {
          const L = colLetter(i + 1);
          cell.value = { formula: `SUM(${L}${headerRow + 1}:${L}${r - 1})`, result: U.round2(U.sum(rows, (x) => c.v(x))) };
          cell.numFmt = c.t === 'money' ? '#,##0.00' : '#,##0';
        }
        cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
        cell.border = { top: { style: 'thin', color: { argb: 'FFD9C8B4' } } };
      });
    }
    return { headerRow, lastRow: r };
  }
  function sheet(wb, name, headerRow, cols) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: headerRow, showGridLines: false }], properties: { defaultRowHeight: 18 } });
    return ws;
  }
  function sheetTitle(ws, text, sub) {
    ws.getCell(1, 1).value = text;
    ws.getCell(1, 1).font = { name: FONT, bold: true, size: 15, color: { argb: 'FFE683A6' } };
    ws.getCell(2, 1).value = sub;
    ws.getCell(2, 1).font = { name: FONT, size: 10, color: { argb: 'FF6E7191' } };
  }

  const periodCols = (label) => [
    { h: label, w: 26, t: 'text', v: (r) => r.label },
    { h: 'ออเดอร์', w: 10, t: 'int', v: (r) => r.orders },
    { h: 'ยอดขาย', t: 'money', v: (r) => U.round2(r.sales) },
    { h: 'ค่าธรรมเนียม', t: 'money', v: (r) => U.round2(r.fees) },
    { h: 'ยอดสุทธิหลังหักค่าธรรมเนียม', w: 18, t: 'money', v: (r) => U.round2(r.net) },
    { h: 'เงินเข้าจริง', t: 'money', v: (r) => U.round2(r.received) },
    { h: 'ยังรอเงินเข้า', t: 'money', v: (r) => U.round2(r.pending) },
    { h: 'รายจ่าย', t: 'money', v: (r) => U.round2(r.expenses) },
    { h: 'รายรับอื่นๆ', t: 'money', v: (r) => U.round2(r.otherIncome) },
    { h: 'กำไรเบื้องต้น', t: 'money', v: (r) => U.round2(r.profit), style: (r) => (r.profit < 0 ? { font: { name: FONT, size: 10, color: { argb: 'FFC25A5A' } } } : null) },
  ];

  A.exportExcel = async ({ from, to, platform = '', title, sheets } = {}) => {
    if (!window.ExcelJS) { A.ui.toast('ยังโหลดตัวสร้าง Excel ไม่เสร็จ (ต้องต่ออินเทอร์เน็ตครั้งแรก)', 'err'); return; }
    const want = new Set(sheets || A.EXCEL_SHEETS.map((s) => s[0]));
    A.ui.toast('กำลังสร้างไฟล์ Excel…');
    const st = A.settings();
    const f = { platform: platform || undefined };
    const pfName = platform ? A.PLATFORMS[platform].name : 'ทุกแพลตฟอร์ม';
    const rangeText = `${U.thDate(from)} – ${U.thDate(to)} • ${pfName}`;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bunny Ledger';
    wb.created = new Date();
    const items = S.items(from, to, f);
    const tot = S.range(from, to, f);

    if (want.has('overview')) {
      const ws = sheet(wb, 'สรุปภาพรวม', 0);
      ws.views = [{ showGridLines: false }];
      sheetTitle(ws, `สรุปบัญชี ${st.shopName}`, `${title ? title + ' • ' : ''}${rangeText} • สร้างเมื่อ ${U.thDateTime(Date.now())}`);
      const kv = [
        ['ยอดขาย', tot.sales], ['จำนวนออเดอร์', tot.orders], ['ค่าธรรมเนียมแพลตฟอร์ม', tot.fees], ['ยอดสุทธิหลังหักค่าธรรมเนียม', tot.net],
        ['เงินเข้าจริงในช่วงนี้', tot.received], ['ยังรอเงินเข้า (ของยอดขายช่วงนี้)', tot.pending], ['รายจ่าย', tot.expenses], ['รายรับอื่นๆ', tot.otherIncome], ['กำไรเบื้องต้น', tot.profit],
      ];
      table(ws, 4, [{ h: 'รายการ', w: 34, t: 'text', v: (r) => r[0] }, { h: 'จำนวน', w: 18, t: 'money', v: (r) => (r[0] === 'จำนวนออเดอร์' ? r[1] : U.round2(r[1])), style: (r) => (r[0] === 'จำนวนออเดอร์' ? { numFmt: '#,##0' } : null) }], kv, { totals: false });
      const pfRows = A.PF_KEYS.filter((k) => !platform || k === platform).map((k) => ({ k, ...S.range(from, to, { platform: k }) }));
      table(ws, 16, [
        { h: 'แพลตฟอร์ม', w: 34, t: 'text', v: (r) => A.PLATFORMS[r.k].name },
        { h: 'ออเดอร์', w: 18, t: 'int', v: (r) => r.orders },
        { h: 'ยอดขาย', w: 16, t: 'money', v: (r) => U.round2(r.sales) },
        { h: 'ค่าธรรมเนียม', w: 16, t: 'money', v: (r) => U.round2(r.fees) },
        { h: 'เงินเข้าจริง', w: 16, t: 'money', v: (r) => U.round2(r.received) },
        { h: 'รอเงินเข้า', w: 16, t: 'money', v: (r) => U.round2(r.pending) },
      ], pfRows, { fill: BLUE, title: 'แยกตามแพลตฟอร์ม' });
      const pies = S.pies(from, to, f);
      const imgs = [
        ['ยอดขายแยกแพลตฟอร์ม', await A.charts.donutImage(pies.sales, { money: true, center: 'ยอดขาย' })],
        ['เงินเข้าแล้ว vs รอเข้า', await A.charts.donutImage(pies.money, { money: true, center: 'ยอดที่ควรได้' })],
        ['รายจ่ายแยกหมวด', await A.charts.donutImage(pies.expenses, { money: true, center: 'รายจ่าย' })],
      ];
      let col = 0;
      const imgRow = 23;
      imgs.forEach(([label, url]) => {
        if (!url) return;
        ws.getCell(imgRow, col + 1).value = label;
        ws.getCell(imgRow, col + 1).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
        const id = wb.addImage({ base64: url, extension: 'png' });
        ws.addImage(id, { tl: { col, row: imgRow }, ext: { width: 360, height: 291 } });
        col += 3;
      });
    }

    const addPeriod = (key, gran, name, label) => {
      if (!want.has(key)) return;
      const rows = S.bucket(gran, from, to, f).map((r) => ({ ...r, label: gran === 'day' ? `${U.TH_DOW[U.parseYmd(r.from).getDay()]} ${U.thDate(r.from)}` : gran === 'month' ? U.thMonth(r.from) : r.label }));
      const ws = sheet(wb, name, 4);
      sheetTitle(ws, `${name} — ${st.shopName}`, rangeText);
      table(ws, 4, periodCols(label), rows, { fill: gran === 'week' ? BLUE : PINK });
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 10 } };
    };
    addPeriod('daily', 'day', 'สรุปรายวัน', 'วันที่');
    addPeriod('weekly', 'week', 'สรุปรายสัปดาห์', 'สัปดาห์ (จันทร์–อาทิตย์)');
    addPeriod('monthly', 'month', 'สรุปรายเดือน', 'เดือน');

    if (want.has('orders')) {
      const ws = sheet(wb, 'ออเดอร์-รายรับ', 4);
      sheetTitle(ws, 'รายการออเดอร์และรายรับ', rangeText + ' (ตามวันที่สั่งซื้อ)');
      table(ws, 4, [
        { h: 'วันที่สั่ง', w: 12, t: 'date', v: (o) => o.orderDate },
        { h: 'แพลตฟอร์ม', w: 10, t: 'text', v: (o) => A.PLATFORMS[o.platform].name },
        { h: 'ร้าน', w: 12, t: 'text', v: (o) => o.shop || '' },
        { h: 'เลขคำสั่งซื้อ', w: 20, t: 'text', v: (o) => o.orderNo },
        { h: 'สินค้า', w: 30, t: 'text', v: (o) => o.items || '' },
        { h: 'จำนวน', w: 8, t: 'int', v: (o) => o.qty || 0 },
        { h: 'สถานะ', w: 14, t: 'text', v: (o) => (A.STATUS[o.status] || {}).label || '' },
        { h: 'ยอดขาย', t: 'money', v: (o) => (A.isVoid(o.status) ? 0 : o.grossSales || 0) },
        { h: 'ค่าธรรมเนียม', t: 'money', v: (o) => (A.isVoid(o.status) ? 0 : U.round2(C.fees(o, st))) },
        { h: 'ยอดที่ควรได้', t: 'money', v: (o) => (A.isVoid(o.status) ? 0 : U.round2(C.expected(o, st))) },
        { h: 'เงินเข้าจริง', t: 'money', v: (o) => o.actualPayout || 0 },
        { h: 'วันที่เงินเข้า', w: 12, t: 'date', v: (o) => o.payoutDate },
        { h: 'วันที่ส่ง', w: 12, t: 'date', v: (o) => o.shipDate },
        { h: 'วันที่ได้รับ', w: 12, t: 'date', v: (o) => o.deliveredDate || o.completedDate },
        { h: 'เลขพัสดุ', w: 18, t: 'text', v: (o) => o.trackingNo || '' },
        { h: 'โน้ต', w: 24, t: 'text', v: (o) => o.note || '' },
      ], items.orders.slice().sort((a, b) => a.orderDate.localeCompare(b.orderDate)));
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 16 } };
    }

    if (want.has('receivables')) {
      const rows = C.receivables(f);
      const ws = sheet(wb, 'ลูกหนี้แพลตฟอร์ม', 4);
      sheetTitle(ws, 'ลูกหนี้แพลตฟอร์ม — เงินที่ยังไม่โอนเข้า', `ณ วันที่ ${U.thDate(U.today())} • ${pfName}`);
      const red = { font: { name: FONT, size: 10, bold: true, color: { argb: 'FFC25A5A' } } };
      table(ws, 4, [
        { h: 'แพลตฟอร์ม', w: 10, t: 'text', v: (r) => A.PLATFORMS[r.o.platform].name },
        { h: 'เลขคำสั่งซื้อ', w: 20, t: 'text', v: (r) => r.o.orderNo },
        { h: 'สินค้า', w: 28, t: 'text', v: (r) => r.o.items || '' },
        { h: 'วันที่ลูกค้าได้รับ', w: 14, t: 'date', v: (r) => r.base },
        { h: 'ควรได้เงินภายใน', w: 14, t: 'date', v: (r) => r.due },
        { h: 'อายุ (วัน)', w: 10, t: 'int', v: (r) => r.age },
        { h: 'สถานะ', w: 16, t: 'text', v: (r) => (r.overdue ? `เกินกำหนด ${r.overdueDays} วัน` : 'ยังไม่ถึงกำหนด'), style: (r) => (r.overdue ? red : null) },
        { h: 'ยอดที่ควรได้', t: 'money', v: (r) => U.round2(r.amount) },
      ], rows, { fill: BLUE });
    }

    if (want.has('tracking')) {
      const t = C.tracking(f);
      const rows = [
        ...t.notReceived.map((x) => ({ ...x, g: 'เกินกำหนดยังไม่ได้รับ' })),
        ...t.pendingShip.map((x) => ({ ...x, g: x.late ? 'ค้างส่ง' : 'รอจัดส่ง' })),
        ...t.shipping.map((x) => ({ ...x, g: 'กำลังจัดส่ง' })),
        ...t.voided.map((x) => ({ ...x, g: (A.STATUS[x.o.status] || {}).label })),
      ];
      const ws = sheet(wb, 'ติดตามออเดอร์', 4);
      sheetTitle(ws, 'ติดตามออเดอร์', `ณ วันที่ ${U.thDate(U.today())} • ${pfName}`);
      table(ws, 4, [
        { h: 'กลุ่ม', w: 20, t: 'text', v: (x) => x.g },
        { h: 'แพลตฟอร์ม', w: 10, t: 'text', v: (x) => A.PLATFORMS[x.o.platform].name },
        { h: 'เลขคำสั่งซื้อ', w: 20, t: 'text', v: (x) => x.o.orderNo },
        { h: 'สินค้า', w: 28, t: 'text', v: (x) => x.o.items || '' },
        { h: 'วันที่สั่ง', w: 12, t: 'date', v: (x) => x.o.orderDate },
        { h: 'วันที่ส่ง', w: 12, t: 'date', v: (x) => x.o.shipDate },
        { h: 'ผ่านมา (วัน)', w: 10, t: 'int', v: (x) => x.age },
        { h: 'เลขพัสดุ', w: 20, t: 'text', v: (x) => x.o.trackingNo || '' },
        { h: 'ขนส่ง', w: 14, t: 'text', v: (x) => x.o.carrier || '' },
        { h: 'ยอดขาย', t: 'money', v: (x) => x.o.grossSales || 0 },
        { h: 'โน้ต', w: 24, t: 'text', v: (x) => x.o.note || '' },
      ], rows);
    }

    if (want.has('expenses')) {
      const ws = sheet(wb, 'รายจ่าย', 4);
      sheetTitle(ws, 'รายจ่าย', rangeText);
      table(ws, 4, [
        { h: 'วันที่', w: 12, t: 'date', v: (e) => e.date },
        { h: 'หมวด', w: 18, t: 'text', v: (e) => e.category || '' },
        { h: 'แพลตฟอร์ม', w: 12, t: 'text', v: (e) => (e.platform ? A.PLATFORMS[e.platform].name : '') },
        { h: 'รายละเอียด', w: 34, t: 'text', v: (e) => e.note || '' },
        { h: 'จำนวนเงิน', t: 'money', v: (e) => e.amount || 0 },
      ], items.expenses.slice().reverse());
    }
    if (want.has('income') && !platform) {
      const ws = sheet(wb, 'รายรับอื่นๆ', 4);
      sheetTitle(ws, 'รายรับอื่นๆ', rangeText);
      table(ws, 4, [
        { h: 'วันที่', w: 12, t: 'date', v: (e) => e.date },
        { h: 'หมวด', w: 18, t: 'text', v: (e) => e.category || '' },
        { h: 'รายละเอียด', w: 34, t: 'text', v: (e) => e.note || '' },
        { h: 'จำนวนเงิน', t: 'money', v: (e) => e.amount || 0 },
      ], items.otherIncome.slice().reverse(), { fill: BLUE });
    }
    if (want.has('fees')) {
      const months = S.bucket('month', from, to, {});
      const per = {};
      A.PF_KEYS.forEach((k) => { per[k] = S.bucket('month', from, to, { platform: k }); });
      const ws = sheet(wb, 'ค่าธรรมเนียม', 4);
      sheetTitle(ws, 'ค่าธรรมเนียมแพลตฟอร์มรายเดือน', `${U.thDate(from)} – ${U.thDate(to)}`);
      const keys = A.PF_KEYS.filter((k) => !platform || k === platform);
      table(ws, 4, [
        { h: 'เดือน', w: 18, t: 'text', v: (i) => U.thMonth(months[i].from) },
        ...keys.flatMap((k) => [
          { h: `${A.PLATFORMS[k].name} ยอดขาย`, w: 16, t: 'money', v: (i) => U.round2(per[k][i].sales) },
          { h: `${A.PLATFORMS[k].name} ค่าธรรมเนียม`, w: 16, t: 'money', v: (i) => U.round2(per[k][i].fees) },
          { h: `${A.PLATFORMS[k].name} % ที่ถูกหัก`, w: 12, t: 'pct', v: (i) => (per[k][i].sales ? per[k][i].fees / per[k][i].sales : 0) },
        ]),
      ], months.map((_, i) => i));
    }

    const buf = await wb.xlsx.writeBuffer();
    const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '');
    U.download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `สรุปบัญชี_${safe(st.shopName)}_${from}_ถึง_${to}${platform ? '_' + A.PLATFORMS[platform].name : ''}.xlsx`);
    A.ui.toast('ดาวน์โหลดไฟล์ Excel แล้ว', 'ok');
    return buf;
  };
})(window.App);
