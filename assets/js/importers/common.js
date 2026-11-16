/* นำเข้าไฟล์ CSV / Excel จาก Seller Center
   ขั้นตอน: อ่านไฟล์ → หาแถวหัวตาราง → เดาแพลตฟอร์ม/ชนิดรายงาน → จับคู่คอลัมน์ → รวมแถวตามเลขออเดอร์ → บันทึก */
(function (A) {
  const U = A.U;
  const I = {};
  A.importers = I;

  const NO_FUZZY = new Set(['variation', 'weightEst', 'weightBilled', 'orderItem', 'qty', 'status', 'sku', 'amount', 'rowType', 'relatedOrder', 'substatus', 'carrier', 'itemRefund', 'sellerDiscount', 'itemGross']);
  I.norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s\*\(\)\[\]\.:_\-\/฿,"'#]/g, '');

  /* ---------- reading ---------- */
  function readAs(file, how, enc) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      if (how === 'text') fr.readAsText(file, enc || 'utf-8'); else fr.readAsArrayBuffer(file);
    });
  }
  I.readFile = async (file) => {
    if (!window.XLSX) throw new Error('ยังโหลดตัวอ่านไฟล์ Excel ไม่เสร็จ (ต้องต่ออินเทอร์เน็ตครั้งแรก)');
    const isCsv = /\.(csv|txt)$/i.test(file.name);
    let wb;
    if (isCsv) {
      let text = await readAs(file, 'text', 'utf-8');
      if (text.includes('�')) text = await readAs(file, 'text', 'windows-874'); // ไฟล์ภาษาไทยแบบเก่า
      wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(await readAs(file, 'buffer'), { type: 'array', cellDates: true });
    }
    // เลือกชีตที่มีหัวตารางเข้าเค้าที่สุด
    let best = null;
    wb.SheetNames.forEach((name) => {
      I.fixRange(wb.Sheets[name]);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
      const h = I.findHeader(rows);
      if (h && (!best || h.score > best.score)) best = { ...h, rows, sheet: name };
    });
    if (!best) throw new Error('ไม่พบหัวตารางที่มีเลขคำสั่งซื้อในไฟล์นี้');
    I.stripPII(best);
    best.summary = I.platformSummary(wb, best.sheet);
    best.withdrawals = I.withdrawals(wb, best.sheet);
    best.extraAdj = I.adjustmentSheet(wb, best.sheet);
    return best;
  };

  /* ยอดสรุปที่แพลตฟอร์มคำนวณเอง (Shopee: ชีต Summary • TikTok: ชีต รายงาน) — ใช้ในหน้า "อ้างอิงข้อมูล"
     อ่านเฉพาะบรรทัดยอดเงินตามชื่อด้านล่าง ไม่เก็บชื่อ/บัญชีธนาคารที่อยู่ในชีตสรุป */
  const SUMMARY_LABELS = {
    payout: ['จำนวนเงินทั้งหมดที่โอนแล้ว', 'ยอดการชำระเงินทั้งหมด', 'total released amount', 'total settlement amount'],
    sales: ['รายได้ทั้งหมด', 'total revenue'],
    fees: ['ค่าใช้จ่ายทั้งหมด', 'ค่าธรรมเนียมทั้งหมด', 'total fees'],
  };
  I.platformSummary = (wb, skipSheet) => {
    const want = {};
    Object.entries(SUMMARY_LABELS).forEach(([k, ls]) => ls.forEach((l) => { want[I.norm(l)] = k; }));
    const out = {};
    wb.SheetNames.filter((n) => n !== skipSheet).forEach((name) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false }).slice(0, 120);
      rows.forEach((r) => {
        const label = r.find((c) => typeof c === 'string' && c.trim());
        if (!label) return;
        const k = want[I.norm(label).replace(/^\d+/, '')];
        if (!k || out[k] != null) return;
        const v = r.slice(r.indexOf(label) + 1).map((c) => U.parseNumber(c)).find((x) => x != null);
        if (v != null) out[k] = { value: U.round2(Math.abs(v)), label: String(label).trim(), sheet: name };
      });
    });
    return Object.keys(out).length ? out : null;
  };

  /* ชีตตารางอื่นในไฟล์รายได้: หาแถวหัวตารางที่มีคอลัมน์ตามชื่อ แล้วคืนแถวข้อมูลเป็น object (อ่านเฉพาะคอลัมน์ที่ขอ) */
  function sideTable(wb, skipSheet, want) {
    for (const name of wb.SheetNames) {
      if (name === skipSheet) continue;
      I.fixRange(wb.Sheets[name]);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
      for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const nh = rows[i].map(I.norm);
        const idx = {};
        Object.entries(want).forEach(([k, names]) => { const j = nh.findIndex((h) => names.some((n) => h === I.norm(n))); if (j >= 0) idx[k] = j; });
        if (Object.keys(idx).length === Object.keys(want).length) {
          return rows.slice(i + 1).map((r) => { const o = {}; Object.entries(idx).forEach(([k, j]) => { o[k] = r[j]; }); return o; });
        }
      }
    }
    return [];
  }
  /* TikTok: ชีต "บันทึกการถอน" = สมุดยอดเงินใน TikTok (ไม่อ่านคอลัมน์เลขบัญชี)
     Earnings (+) = เงินเข้ายอด TikTok รายวัน • Withdrawal (−) = ถอนเข้าบัญชีธนาคาร */
  I.withdrawals = (wb, skipSheet) => sideTable(wb, skipSheet, {
    type: ['ประเภทธุรกรรม', 'type', 'transaction type'], ref: ['id อ้างอิง', 'reference id'], amount: ['จำนวน', 'amount'], date: ['เวลาที่สำเร็จ', 'completed time', 'success time'], requested: ['เวลาส่งคำขอ', 'request time'], status: ['สถานะ', 'status'],
  }).map((r) => {
    const amount = U.parseNumber(r.amount);
    const kind = /withdraw|ถอน/i.test(String(r.type || '')) || amount < 0 ? 'wd' : 'earn';
    return { kind, ref: String(r.ref || '').trim(), amount: amount == null ? null : U.round2(Math.abs(amount)), date: U.parseDate(r.date) || U.parseDate(r.requested), status: String(r.status || '').trim() };
  }).filter((r) => r.ref && /\d/.test(r.ref) && r.amount != null && r.date);
  /* Shopee: ชีต "Adjustment" = เงินปรับปรุงยอด (เช่น เคลมค่าจัดส่ง) ที่โอนแยกจากยอดของออเดอร์ */
  I.adjustmentSheet = (wb, skipSheet) => {
    const rows = sideTable(wb, skipSheet, {
      date: ['วันที่โอนยอดเงินที่ปรับปรุง'], type: ['ประเภทการปรับปรุง | คำอธิบาย', 'ประเภทการปรับปรุง'], amount: ['ยอดที่ปรับปรุง'], order: ['รหัสคำสั่งซื้อที่เกี่ยวข้อง'],
    });
    const seen = {};
    return rows.map((r) => {
      const date = U.parseDate(r.date), amount = U.parseNumber(r.amount), order = String(r.order || '').trim();
      if (!date || amount == null) return null;
      const base = `sa-${date}-${order || 'x'}`;
      seen[base] = (seen[base] || 0) + 1;
      return { ref: `${base}-${seen[base]}`, type: String(r.type || 'ปรับปรุงยอด').trim(), date, amount: U.round2(amount), order: /^[0-9A-Za-z]{6,40}$/.test(order) ? order : undefined, external: true };
    }).filter(Boolean);
  };

  /* ล้างข้อมูลส่วนตัวของลูกค้าทิ้งทันทีหลังอ่านไฟล์ (ชื่อ ที่อยู่ เบอร์โทร อีเมล ฯลฯ — ดู I.PII)
     เหลือไว้แค่ชื่อหัวคอลัมน์ เพื่อให้รู้ว่าตัดคอลัมน์ไหนทิ้งไป */
  I.stripPII = (parsed) => {
    const idx = parsed.headers.map((h, i) => (I.isPII(h) ? i : -1)).filter((i) => i >= 0);
    for (let r = parsed.headerIdx + 1; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      idx.forEach((i) => { if (i < row.length) row[i] = ''; });
    }
    // แถวก่อนหัวตาราง (หัวรายงาน) อาจมีชื่อ/บัญชีธนาคารเจ้าของร้าน — ไม่ใช้ จึงล้างทิ้งด้วย
    for (let r = 0; r < parsed.headerIdx; r++) parsed.rows[r] = [];
    parsed.piiCols = idx.map((i) => parsed.headers[i]);
    return parsed;
  };

  /* ไฟล์จาก TikTok / Lazada บางไฟล์ระบุขอบเขตตาราง (!ref) ผิด เช่น บอกว่ามี 2 แถวแต่จริงมี 470 แถว
     จึงคำนวณขอบเขตใหม่จากเซลล์ที่มีอยู่จริง */
  I.fixRange = (ws) => {
    if (!ws) return;
    let maxR = -1, maxC = -1;
    Object.keys(ws).forEach((k) => {
      if (k[0] === '!') return;
      const a = XLSX.utils.decode_cell(k);
      if (a.r > maxR) maxR = a.r;
      if (a.c > maxC) maxC = a.c;
    });
    if (maxR < 0) return;
    const cur = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(maxR, cur.e.r), c: Math.max(maxC, cur.e.c) } });
  };

  let ALL_ALIASES = null;
  function allAliases() {
    if (ALL_ALIASES) return ALL_ALIASES;
    ALL_ALIASES = new Set();
    Object.values(I.FIELDS).forEach((fs) => Object.values(fs).forEach((f) => f.aliases.forEach((a) => ALL_ALIASES.add(I.norm(a)))));
    return ALL_ALIASES;
  }
  /* หาแถวหัวตาราง (บางไฟล์มีหัวเรื่องหลายบรรทัดก่อนตาราง) */
  I.findHeader = (rows) => {
    const al = allAliases();
    const keyAliases = new Set([...I.FIELDS.orders.orderNo.aliases, ...I.FIELDS.income.orderNo.aliases].map(I.norm));
    let best = null;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const cells = rows[i].map(I.norm);
      if (!cells.some((c) => keyAliases.has(c))) continue;
      const score = cells.filter((c) => al.has(c)).length;
      if (!best || score > best.score) best = { headerIdx: i, score, headers: rows[i].map((h) => String(h).trim()) };
    }
    return best && best.score >= 2 ? best : null;
  };

  /* ---------- detection & mapping ---------- */
  I.autoMap = (headers, report) => {
    const fields = I.FIELDS[report];
    const nh = headers.map(I.norm);
    const used = new Set(headers.map((h, i) => (I.isPII(h) ? i : -1)).filter((i) => i >= 0)); // ห้ามจับคู่คอลัมน์ข้อมูลลูกค้า
    const map = {};
    // pass 1: exact
    Object.entries(fields).forEach(([k, f]) => {
      const al = f.aliases.map(I.norm);
      if (f.kind === 'multi' || f.kind === 'net') {
        const idx = nh.map((h, i) => (al.includes(h) && !used.has(i) ? i : -1)).filter((i) => i >= 0);
        if (idx.length) { map[k] = idx; idx.forEach((i) => used.add(i)); }
        return;
      }
      for (const a of al) { const i = nh.indexOf(a); if (i >= 0 && !used.has(i)) { map[k] = i; used.add(i); return; } }
    });
    // pass 2: header contains alias (for slightly different names)
    Object.entries(fields).forEach(([k, f]) => {
      if (map[k] != null || NO_FUZZY.has(k) || f.kind === 'multi' || f.kind === 'net') return;
      const al = f.aliases.map(I.norm).filter((a) => a.length >= 6);
      for (let i = 0; i < nh.length; i++) if (!used.has(i) && al.some((a) => nh[i].includes(a))) { map[k] = i; used.add(i); return; }
    });
    return map;
  };

  I.detect = (headers, filename) => {
    const nh = new Set(headers.map(I.norm));
    const fname = (filename || '').toLowerCase();
    const scores = {};
    A.PF_KEYS.forEach((p) => {
      const h = I.PLATFORM_HINTS[p];
      scores[p] = h.headers.filter((x) => nh.has(I.norm(x))).length * 2 + (h.files.some((f) => fname.includes(f)) ? 6 : 0);
    });
    // ไฟล์ Shopee มักเป็นหัวภาษาไทยล้วน
    const platform = A.PF_KEYS.slice().sort((a, b) => scores[b] - scores[a])[0];
    const sure = scores[platform] > 0 && A.PF_KEYS.filter((p) => scores[p] === scores[platform]).length === 1;

    const mo = I.autoMap(headers, 'orders');
    const mi = I.autoMap(headers, 'income');
    const sOrders = (mo.status != null ? 3 : 0) + (mo.trackingNo != null ? 2 : 0) + (mo.items != null ? 1 : 0) + (mo.orderDate != null ? 1 : 0);
    const sIncome = (mi.actualPayout != null ? 4 : 0) + (mi.payoutDate != null ? 2 : 0) + (mi.amount != null && mi.feeName != null ? 4 : 0) + (mi.paidStatus != null ? 2 : 0);
    const report = sIncome > sOrders ? 'income' : 'orders';
    return { platform: sure ? platform : (scores[platform] > 0 ? platform : 'shopee'), sure, report, mapping: report === 'income' ? mi : mo, scores };
  };

  /* ---------- templates (remember a column mapping for a header layout) ---------- */
  I.signature = (headers) => 'tpl_' + U.hash(headers.map(I.norm).filter(Boolean).join('|'));
  I.findTemplate = (headers) => A.db.get('templates', I.signature(headers));
  I.saveTemplate = (headers, platform, report, mapping) => {
    const byName = {};
    Object.entries(mapping).forEach(([k, v]) => { byName[k] = Array.isArray(v) ? v.map((i) => headers[i]) : headers[v]; });
    return A.db.put('templates', { id: I.signature(headers), platform, report, mapping: byName, headers });
  };
  I.templateMapping = (tpl, headers) => {
    const m = {};
    Object.entries(tpl.mapping).forEach(([k, v]) => {
      if (Array.isArray(v)) { const idx = v.map((n) => headers.indexOf(n)).filter((i) => i >= 0); if (idx.length) m[k] = idx; }
      else { const i = headers.indexOf(v); if (i >= 0) m[k] = i; }
    });
    // ช่องที่โปรแกรมเพิ่มภายหลัง (เช่น ตัวเลือกสินค้า ค่าส่ง) แต่แม่แบบเก่ายังไม่มี → เติมจากการจับคู่อัตโนมัติ
    if (tpl.report && I.FIELDS[tpl.report]) {
      const used = new Set(Object.values(m).flat());
      Object.entries(I.autoMap(headers, tpl.report)).forEach(([k, v]) => {
        if (k in tpl.mapping) return;
        const idx = [].concat(v);
        if (idx.some((i) => used.has(i))) return;
        m[k] = v; idx.forEach((i) => used.add(i));
      });
    }
    return m;
  };

  /* ---------- transform rows → normalized records ---------- */
  const cleanId = (v) => String(v == null ? '' : v).trim().replace(/^'+/, '').replace(/\.0+$/, '');
  I.build = (parsed, platform, report, mapping, shop) => {
    const { rows, headerIdx } = parsed;
    const fields = I.FIELDS[report];
    const data = rows.slice(headerIdx + 1);
    // decide date order per file (d/m/y or m/d/y)
    const dateCols = Object.entries(mapping).filter(([k]) => fields[k] && fields[k].type === 'date').map(([, i]) => i);
    const sample = [];
    data.slice(0, 300).forEach((r) => dateCols.forEach((i) => sample.push(r[i])));
    const dateOrder = U.detectDateOrder(sample);

    const groups = new Map();
    const adjustments = new Map();
    let skipped = 0;
    const itemsOf = new Map(); // เลขออเดอร์ → รหัสรายการสินค้า
    const lineBased = report === 'income' && mapping.actualPayout == null && mapping.amount != null;
    const payCol = lineBased ? mapping.amount : mapping.actualPayout;
    // ไฟล์รายได้: แยกตาม "ออเดอร์ + วันที่เงินเข้า" เพราะออเดอร์เดียวอาจได้เงินหลายรอบ (เช่น เดือนถัดไปโดนหักคืนเงิน)
    const dayOf = (r) => (report === 'income' && mapping.payoutDate != null ? U.parseDate(r[mapping.payoutDate], dateOrder) || '' : '');
    data.forEach((r) => {
      const id = cleanId(r[mapping.orderNo]);
      if (!id || /\s/.test(id) || id.length > 40 || !/\d/.test(id)) { skipped++; return; }
      if (report === 'income' && mapping.rowType != null) {
        const t = String(r[mapping.rowType] || '').trim();
        if (t && !/order|คำสั่งซื้อ/i.test(t)) {
          // ไม่ใช่ออเดอร์ เช่น เงินชดเชยจากแพลตฟอร์ม / ชดเชยค่าขนส่ง → เก็บเป็น "รายรับอื่นๆ" ให้ยอดเงินเข้าครบตามแพลตฟอร์ม
          const amt = payCol != null ? U.parseNumber(r[payCol]) : null;
          if (amt) {
            const day = dayOf(r);
            const k = `${id}|${day}`;
            const rel = mapping.relatedOrder != null ? cleanId(r[mapping.relatedOrder]) : '';
            const cur = adjustments.get(k) || { ref: id, type: t, date: day, amount: 0 };
            // เงินชดเชยที่ระบุเลขคำสั่งซื้อ (เช่น ชดเชยสินค้าตีกลับ) → นับเป็นเงินเข้าของออเดอร์นั้น
            if (rel && rel !== id && /^\d{6,40}$/.test(rel)) cur.order = rel;
            cur.amount = U.round2(cur.amount + amt);
            adjustments.set(k, cur);
          }
          skipped++; return;
        }
      }
      if (report === 'income' && mapping.paidStatus != null) {
        const ps = String(r[mapping.paidStatus] || '').toLowerCase();
        if (/not|ยังไม่|unpaid/.test(ps)) { skipped++; return; }
      }
      // นับรายการสินค้าต่อออเดอร์ (Lazada แยกแต่ละสินค้าเป็นคนละรายการ เช่น 26 ออเดอร์ = 28 รายการสินค้า)
      if (!itemsOf.has(id)) itemsOf.set(id, new Set());
      const its = itemsOf.get(id);
      its.add(mapping.orderItem != null && String(r[mapping.orderItem] || '').trim() ? String(r[mapping.orderItem]).trim() : `row${its.size}`);
      const key = report === 'income' ? `${id}\u0001${dayOf(r)}` : id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    const conv = (f, v) => {
      if (f.type === 'num') return U.parseNumber(v);
      if (f.type === 'date') return U.parseDate(v, dateOrder);
      return v == null ? '' : String(v).trim();
    };
    let out = [];
    groups.forEach((rs, key) => {
      const orderNo = key.split('\u0001')[0];
      const rec = { platform, orderNo };
      if (shop) rec.shop = shop;
      Object.entries(fields).forEach(([k, f]) => {
        const col = mapping[k];
        if (col == null || k === 'orderNo' || f.kind === 'items' || f.kind === 'lines') return;
        if (f.kind === 'net') {
          // รวมหลายคอลัมน์แบบมีเครื่องหมาย (เช่น ค่าส่งที่ร้านจ่ายสุทธิ)
          let total = null;
          col.forEach((c) => { const v = rs.map((r) => U.parseNumber(r[c])).find((x) => x != null); if (v != null) total = (total || 0) + v; });
          if (total != null) rec[k] = U.round2(total);
        } else if (f.kind === 'multi') {
          let total = null;
          col.forEach((c) => {
            const v = rs.map((r) => U.parseNumber(r[c])).find((x) => x != null);
            if (v != null) total = (total || 0) + Math.abs(v);
          });
          if (total != null) rec[k] = total;
        } else if (f.kind === 'sum') {
          const vals = rs.map((r) => U.parseNumber(r[col])).filter((x) => x != null);
          if (vals.length) rec[k] = U.round2(U.sum(vals));
        } else if (f.kind === 'concat') {
          const vals = [...new Set(rs.map((r) => String(r[col] || '').trim()).filter(Boolean))];
          if (vals.length) rec[k] = vals.join(', ');
        } else {
          const v = rs.map((r) => conv(f, r[col])).find((x) => x != null && x !== '');
          if (v != null && v !== '') rec[k] = v;
        }
      });
      // ---- post-processing ----
      if (report === 'orders') {
        const rawStatus = rec.status, rawSub = rec.substatus;
        rec.status = A.normalizeStatus(rawSub) || A.normalizeStatus(rawStatus) || null;
        if (rawStatus || rawSub) rec.statusRaw = [rawStatus, rawSub].filter(Boolean).join(' / ');
        delete rec.substatus;
        // ยอดขายของร้าน: ราคาก่อนส่วนลด − ส่วนลดร้าน > ยอดสุทธิรายชิ้น > ยอดที่ลูกค้าจ่ายทั้งออเดอร์
        const paidByBuyer = rec.grossSales != null ? rec.grossSales : (rec.itemGross != null ? rec.itemSubtotal : null);
        if (rec.itemGross != null) rec.grossSales = U.round2(rec.itemGross - Math.abs(rec.sellerDiscount || 0));
        else if (rec.itemSubtotal != null) rec.grossSales = rec.itemSubtotal;
        if (paidByBuyer != null) rec.buyerPaid = paidByBuyer;
        if (mapping.qty == null) rec.qty = rs.length;
        // รายการสินค้าในออเดอร์ (ชื่อ + ตัวเลือก + จำนวน) ใช้คิดต้นทุนสินค้า
        if (mapping.items != null) {
          const ls = new Map();
          rs.forEach((r) => {
            const n = String(r[mapping.items] || '').trim();
            if (!n) return;
            const v = mapping.variation != null ? String(r[mapping.variation] || '').trim() : '';
            const s = mapping.sku != null ? String(r[mapping.sku] || '').trim() : '';
            const q = mapping.qty != null ? U.parseNumber(r[mapping.qty]) || 0 : 1;
            const key = n + '\u0001' + v;
            const cur = ls.get(key) || { n, v, s, q: 0 };
            cur.q += q;
            ls.set(key, cur);
          });
          if (ls.size) rec.lines = [...ls.values()].map((l) => { const o = { n: l.n, q: l.q }; if (l.v) o.v = l.v; if (l.s) o.s = l.s; return o; });
        }
        // คืนเงิน / คืนสินค้า
        const refund = rec.orderRefund != null ? rec.orderRefund : rec.itemRefund;
        if (refund > 0) {
          rec.refundAmount = U.round2(refund);
          const base = paidByBuyer || rec.grossSales || 0;
          if (base && refund >= base * 0.99) rec.status = 'returned';
          else if (rec.grossSales != null) rec.grossSales = U.round2(Math.max(0, rec.grossSales - refund));
        }
        const rt = String(rec.returnStatus || '');
        const textSaysReturned = rt && /คืนเงินแล้ว|อนุมัติ|สำเร็จ|refunded|approved|completed/i.test(rt) && !/ปฏิเสธ|reject|ยกเลิกคำขอ/i.test(rt);
        // ถ้าไฟล์บอกยอดคืนเงินมา ใช้ยอดเงินตัดสิน (คืนบางส่วน ≠ คืนทั้งออเดอร์) ถ้าไม่มียอด ใช้ข้อความสถานะ
        if (textSaysReturned && !(refund > 0) && rec.status !== 'cancelled') rec.status = 'returned';
        if (rt) rec.returnNote = rt;
        if (rec.status === 'shipped' && rec.deliveredDate) rec.status = 'delivered';
        ['itemSubtotal', 'itemGross', 'sellerDiscount', 'orderRefund', 'itemRefund', 'returnStatus'].forEach((k) => delete rec[k]);
        if (rec.feesTotal != null) rec.platformFees = Math.abs(rec.feesTotal);
        else if (rec.fees != null) rec.platformFees = rec.fees;
        delete rec.feesTotal; delete rec.fees;
        if (rec.expectedPayout != null) rec.expectedSource = 'file';
        if (!rec.status) {
          if (rec.deliveredDate) rec.status = 'delivered';
          else if (rec.shipDate) rec.status = 'shipped';
        }
      } else {
        if (lineBased) {
          const amounts = rs.map((r) => U.parseNumber(r[mapping.amount])).filter((x) => x != null);
          rec.actualPayout = U.round2(U.sum(amounts));
          const neg = amounts.filter((x) => x < 0);
          if (neg.length) rec.fees = U.round2(Math.abs(U.sum(neg)));
          const pos = amounts.filter((x) => x > 0);
          if (rec.grossSales == null && pos.length) rec.grossSales = U.round2(U.sum(pos));
          delete rec.amount;
        }
        delete rec.feeName; delete rec.paidStatus; delete rec.rowType; delete rec.relatedOrder;
        // ค่าส่งที่ร้านจ่ายเอง (ติดลบ = ร้านจ่าย) และน้ำหนักพัสดุ → ใช้หาออเดอร์ที่ควรเคลม
        const ship = rec.shipNet != null && rec.shipNet < 0 ? U.round2(-rec.shipNet) : 0;
        const w = rec.weightBilled != null || rec.weightEst != null ? [rec.weightEst || 0, rec.weightBilled || 0] : null;
        delete rec.shipNet; delete rec.weightEst; delete rec.weightBilled;
        // Shopee: ยอดขาย = สินค้าราคาปกติ − ส่วนลดจากร้าน (ส่วนลดที่ Shopee ออกให้ไม่หัก)
        if (rec.itemGross != null) rec.grossSales = U.round2(rec.itemGross - Math.abs(rec.sellerDiscount || 0));
        delete rec.itemGross; delete rec.sellerDiscount;
        const refund = rec.refund ? U.round2(Math.abs(rec.refund)) : 0;
        delete rec.refund;
        if (rec.feesTotal != null) rec.platformFees = Math.abs(rec.feesTotal);
        else if (rec.fees != null) rec.platformFees = rec.fees;
        delete rec.feesTotal; delete rec.fees;
        if (rec.actualPayout == null) return;
        // เงินเข้า 1 รอบ (ยอดขายเก็บแบบก่อนหักเงินคืน แล้วไปหักตอนรวมทุกรอบ)
        rec._part = { pay: rec.actualPayout, gross: rec.grossSales != null ? rec.grossSales : null, refund, fees: rec.platformFees != null ? rec.platformFees : null };
        if (ship) rec._part.ship = ship;
        if (w) rec._part.w = w;
        if (lineBased) rec._part.weak = true; // Lazada: ยอดขายเดาจากรายการเงินบวก ใช้เมื่อไม่มีไฟล์ออเดอร์เท่านั้น
      }
      out.push(rec);
    });
    // เงินชดเชยที่ผูกกับออเดอร์ → รวมเข้ารอบเงินเข้าของออเดอร์นั้น (วันเดียวกัน) หรือเป็นรอบเงินเข้าแยกของออเดอร์นั้น
    const linked = [];
    if (report === 'income') (parsed.extraAdj || []).forEach((a) => adjustments.set(`${a.ref}|${a.date}`, { ...a }));
    adjustments.forEach((a, k) => {
      if (!a.order) return;
      const rec = out.find((r) => r.orderNo === a.order && (r.payoutDate || '') === a.date);
      if (rec) {
        rec._part.pay = U.round2(rec._part.pay + a.amount);
        rec._part.adj = U.round2((rec._part.adj || 0) + a.amount);
        if (a.amount > 0) rec._part.comp = U.round2((rec._part.comp || 0) + a.amount);
        rec.actualPayout = rec._part.pay;
      } else {
        out.push({ platform, orderNo: a.order, payoutDate: a.date || undefined, actualPayout: a.amount, _compOnly: { ...a }, _part: { pay: a.amount, adj: a.amount, comp: a.amount > 0 ? a.amount : 0, gross: null, refund: 0, fees: null } });
      }
      a.linked = true;
      linked.push(a);
      adjustments.delete(k);
    });
    if (report === 'income') out = mergeParts(out);
    // จำนวนรายการสินค้า: ไฟล์ออเดอร์ = แถวของออเดอร์นั้น, ไฟล์รายได้ = เฉพาะเมื่อไฟล์มีรหัสรายการสินค้า (Lazada)
    const countItems = report === 'orders' || mapping.orderItem != null;
    let itemCount = 0;
    out.forEach((r) => {
      const n = itemsOf.has(r.orderNo) ? itemsOf.get(r.orderNo).size : 1;
      if (countItems) r.itemLines = n;
      itemCount += n;
    });
    return { records: out, skipped, dateOrder, rowCount: data.length, itemCount: countItems ? itemCount : null, adjustments: [...adjustments.values()], linked, withdrawals: report === 'income' ? parsed.withdrawals || [] : [] };
  };

  /* ---------- ลบไฟล์ที่นำเข้า (ย้อนข้อมูลที่ไฟล์นั้นนำเข้า) ----------
     - รอบเงินเข้าที่ไฟล์นี้เขียน → ลบออก แล้วคำนวณยอดเงินเข้าใหม่จากรอบที่เหลือ (ไม่เหลือ = กลับเป็นยังไม่ได้รับเงิน)
     - ออเดอร์ที่ไม่มีไฟล์อื่นนำเข้าเลย → ลบออเดอร์
     - ออเดอร์ที่ไฟล์อื่นนำเข้าด้วย → เก็บไว้ (ข้อมูลจากไฟล์อื่นยังอยู่)
     - เงินชดเชย / ยอดถอนเงินที่มาจากไฟล์นี้ → ลบ
     ไฟล์ที่นำเข้าก่อนมีระบบนี้ ไม่มีรหัสการนำเข้า → ลบได้แค่ประวัติ (ให้นำเข้าไฟล์เดิมซ้ำ 1 ครั้งแล้วลบใหม่) */
  I.undoPlan = (impIds) => {
    const ids = new Set([].concat(impIds));
    const del = [], upd = [];
    let parts = 0;
    A.db.all('orders').forEach((o) => {
      const files = o.files || [];
      const pp = o.payoutParts || {};
      const gone = Object.keys(pp).filter((d) => pp[d] && ids.has(pp[d].imp));
      const touched = files.some((f) => ids.has(f));
      if (!touched && !gone.length) return;
      parts += gone.length;
      const left = files.filter((f) => !ids.has(f));
      if (touched && !left.length && !o.manualPaid && !o.claim && !o.note) { del.push(o); return; }
      const keep = {};
      Object.keys(pp).forEach((d) => { if (!gone.includes(d)) keep[d] = pp[d]; });
      const next = { ...o, files: left };
      if (gone.length) {
        if (Object.keys(keep).length) {
          const t = I.partTotals(keep);
          Object.assign(next, { payoutParts: keep, actualPayout: t.actualPayout, payoutDate: t.payoutDate || o.payoutDate });
          ['platformFees', 'shipPaid', 'compGot', 'weightEst', 'weightBilled', 'refundAmount'].forEach((k) => { if (t[k] != null) next[k] = t[k]; else delete next[k]; });
          if (t.grossSales != null && t.salesStrong) next.grossSales = t.grossSales;
        } else {
          Object.assign(next, { payoutParts: null, actualPayout: null, payoutDate: null, salesFromIncome: false });
          ['shipPaid', 'compGot', 'weightEst', 'weightBilled'].forEach((k) => delete next[k]);
          if (o.returnedByIncome) { next.returnedByIncome = false; if (left.length) next.status = 'completed'; }
        }
      }
      upd.push(next);
    });
    const other = A.db.all('otherIncome').filter((e) => ids.has(e.imp));
    const deps = A.db.all('deposits').filter((d) => ids.has(d.imp));
    const imports = A.db.all('imports').filter((x) => ids.has(x.id));
    return { del, upd, parts, unpaid: upd.filter((o) => o.actualPayout == null && (A.db.get('orders', o.id) || {}).actualPayout != null).length, other, deps, imports, legacy: imports.filter((x) => !String(x.id || '').startsWith('imp_')) };
  };
  I.undo = async (impIds) => {
    const p = I.undoPlan(impIds);
    if (p.del.length) await A.db.putMany('orders', p.del.map((o) => ({ ...o, deleted: true })));
    if (p.upd.length) await A.db.putMany('orders', p.upd);
    if (p.other.length) await A.db.putMany('otherIncome', p.other.map((e) => ({ ...e, deleted: true })));
    if (p.deps.length) await A.db.putMany('deposits', p.deps.map((d) => ({ ...d, deleted: true })));
    if (p.imports.length) await A.db.putMany('imports', p.imports.map((x) => ({ ...x, deleted: true })));
    return p;
  };

  /* รวมเงินเข้าหลายรอบของออเดอร์เดียวกัน → { parts: { 'YYYY-MM-DD': {pay, gross, refund, fees} }, ยอดรวม } */
  function mergeParts(recs) {
    const by = new Map();
    recs.forEach((r) => {
      const part = r._part; delete r._part;
      let m = by.get(r.orderNo);
      if (!m) { m = { ...r, parts: {} }; delete m.payoutDate; by.set(r.orderNo, m); }
      ['orderDate', 'payoutRef', 'shop'].forEach((k) => { if (m[k] == null && r[k] != null) m[k] = r[k]; });
      m.parts[r.payoutDate || 'x'] = part;
    });
    return [...by.values()].map((m) => Object.assign(m, I.partTotals(m.parts)));
  }
  I.partTotals = (parts) => {
    const list = Object.values(parts);
    const days = Object.keys(parts).filter((d) => /^\d{4}-/.test(d)).sort();
    const out = { actualPayout: U.round2(U.sum(list, (p) => p.pay || 0)) };
    if (days.length) out.payoutDate = days[0];
    const fees = list.filter((p) => p.fees != null);
    if (fees.length) out.platformFees = U.round2(U.sum(fees, (p) => p.fees));
    const refund = U.round2(U.sum(list, (p) => p.refund || 0));
    out.refundAmount = refund || undefined;
    const ship = U.round2(U.sum(list, (p) => p.ship || 0));
    if (ship) out.shipPaid = ship;
    const comp = U.round2(U.sum(list, (p) => p.comp || 0));
    if (comp) out.compGot = comp;
    const ws = list.filter((p) => p.w);
    if (ws.length) { out.weightEst = Math.max(...ws.map((p) => p.w[0])); out.weightBilled = Math.max(...ws.map((p) => p.w[1])); }
    const withGross = list.filter((p) => p.gross != null);
    const strong = withGross.filter((p) => !p.weak);
    const use = strong.length ? strong : withGross;
    if (use.length) {
      const g = U.sum(use, (p) => p.gross);
      if (g > 0 || refund > 0) {
        out.grossSales = U.round2(Math.max(0, g - refund));
        out.salesStrong = !!strong.length;
        out.fullRefund = refund > 0 && g - refund <= Math.max(g * 0.01, 0.5); // คืนเงินเต็มจำนวน
      }
    }
    return out;
  };

  /* ---------- save to database (upsert by platform + order number) ---------- */
  I.makeId = (platform, orderNo) => `${platform}:${String(orderNo).replace(/\//g, '_')}`;
  const MANUAL = ['note', 'manualPaid', 'mismatchOk'];
  I.commit = async (built, { platform, report, filename }) => {
    // ทุกอย่างที่ไฟล์นี้นำเข้า ติดรหัสการนำเข้าไว้ → ลบไฟล์นำเข้าทีหลังได้ (I.undo)
    const impId = 'imp_' + U.uid();
    const today = U.today();
    let created = 0, updated = 0;
    // เงินชดเชยของออเดอร์ที่ยังไม่มีในโปรแกรม → เก็บเป็นรายรับอื่นๆ แทน (ไม่สร้างออเดอร์ปลอม)
    const orphan = [];
    const records = built.records.filter((r) => {
      if (!r._compOnly) return true;
      const cur = A.db.getRaw('orders', I.makeId(platform, r.orderNo));
      if (cur && !cur.deleted) return true;
      orphan.push(r._compOnly);
      return false;
    });
    const recs = records.map((r) => {
      const id = I.makeId(platform, r.orderNo);
      const cur = A.db.getRaw('orders', id);
      const alive = cur && !cur.deleted ? cur : null;
      if (r._compOnly) r = { orderNo: r.orderNo, parts: r.parts }; // เงินชดเชยอย่างเดียว: ไม่แตะข้อมูลอื่นของออเดอร์
      const base = alive ? { ...alive } : { id, platform, orderNo: r.orderNo, createdAt: Date.now(), deleted: false };
      if (alive) updated++; else created++;
      const clean = {};
      Object.entries(r).forEach(([k, v]) => { if (v != null && v !== '' && !MANUAL.includes(k)) clean[k] = v; });
      let next;
      if (report === 'orders') {
        next = { ...base, ...clean, source: filename };
        // อย่าย้อนสถานะที่ผู้ใช้กดเองว่า "ได้รับแล้ว" กลับไปเป็นกำลังส่ง
        if (alive && alive.status === 'delivered' && clean.status === 'shipped') next.status = 'delivered';
        // ยอดขายจากไฟล์รายได้ (ยอดที่แพลตฟอร์มสรุปจริง) แม่นกว่าไฟล์ออเดอร์ → ไม่เขียนทับ
        if (alive && alive.salesFromIncome) { next.grossSales = alive.grossSales; if (alive.refundAmount != null) next.refundAmount = alive.refundAmount; }
        if (alive && alive.returnedByIncome) next.status = 'returned';
        if (!next.status) next.status = 'pending_ship';
        if (!next.orderDate) next.orderDate = today;
      } else {
        // เงินเข้าเก็บแยกรอบตามวันที่ → นำเข้าไฟล์หลายเดือนแล้วรวมกันถูก นำเข้าไฟล์เดิมซ้ำก็ไม่นับซ้ำ
        const legacy = alive && !alive.manualPaid && alive.actualPayout != null && !alive.payoutParts ? { [alive.payoutDate || 'x']: { pay: alive.actualPayout } } : {};
        const prev = alive && !alive.manualPaid && alive.payoutParts ? alive.payoutParts : legacy;
        const tagged = {};
        Object.entries(r.parts || {}).forEach(([d, p]) => { tagged[d] = { ...p, imp: impId }; });
        const parts = { ...prev, ...tagged };
        const t = I.partTotals(parts);
        next = { ...base, payoutParts: parts, actualPayout: t.actualPayout, payoutDate: t.payoutDate || base.payoutDate || today, manualPaid: false };
        if (t.platformFees != null) next.platformFees = t.platformFees;
        ['shipPaid', 'compGot', 'weightEst', 'weightBilled'].forEach((k) => { if (t[k] != null) next[k] = t[k]; else delete next[k]; });
        if (clean.payoutRef) next.payoutRef = clean.payoutRef;
        if (clean.items && !base.items) next.items = clean.items;             // ชื่อสินค้า (ออเดอร์ที่ยังไม่มีไฟล์ออเดอร์)
        if (clean.itemLines && base.qty == null) next.qty = clean.itemLines; // จำนวนรายการสินค้า
        if (clean.itemLines) next.itemLines = Math.max(clean.itemLines, base.itemLines || 0);
        if (t.refundAmount) next.refundAmount = t.refundAmount;
        if (t.grossSales != null && t.salesStrong) { next.grossSales = t.grossSales; next.salesFromIncome = true; }
        else if (t.grossSales != null && base.grossSales == null) next.grossSales = t.grossSales; // Lazada ที่ยังไม่มีไฟล์ออเดอร์
        if (!next.orderDate) next.orderDate = clean.orderDate || next.payoutDate;
        if (!next.status || next.status === 'pending_ship' || next.status === 'shipped') next.status = 'completed';
        if (t.fullRefund && (t.salesStrong || base.grossSales == null)) { next.status = 'returned'; next.returnedByIncome = true; } // คืนเงินเต็มจำนวน ไม่นับเป็นยอดขาย
        else if (base.returnedByIncome) { next.status = 'completed'; next.returnedByIncome = false; }
        if (!next.source) next.source = filename;
      }
      next.files = [...new Set([...(base.files || []), impId])];
      next.deleted = false;
      return next;
    });
    await A.db.putMany('orders', recs);
    // รายการที่ไม่ใช่ออเดอร์ในไฟล์รายได้ (เงินชดเชยจากแพลตฟอร์ม ฯลฯ) → รายรับอื่นๆ
    // เงินชดเชยที่นับรวมกับออเดอร์แล้ว → ลบรายการ "รายรับอื่นๆ" เดิม (จากการนำเข้ารุ่นก่อน) กันนับซ้ำ
    const orphanKeys = new Set(orphan.map((a) => `${a.ref}|${a.date}`));
    const stale = (built.linked || []).filter((a) => !orphanKeys.has(`${a.ref}|${a.date}`))
      .map((a) => A.db.get('otherIncome', `adj:${platform}:${a.ref}:${a.date || 'x'}`)).filter(Boolean);
    if (stale.length) await A.db.putMany('otherIncome', stale.map((x) => ({ ...x, deleted: true })));
    const adj = (built.adjustments || []).concat(orphan).map((a) => ({
      id: `adj:${platform}:${a.ref}:${a.date || 'x'}`, date: a.date || today, amount: a.amount, category: a.amount < 0 ? 'ปรับปรุงยอดจากแพลตฟอร์ม' : 'เงินชดเชยจากแพลตฟอร์ม', platform,
      note: `${A.PLATFORMS[platform].name} • ${a.type} • ${a.ref}`, source: filename, imp: impId, auto: true, deleted: false,
    }));
    if (adj.length) await A.db.putMany('otherIncome', adj);
    // ยอดถอนเงินเข้าบัญชีธนาคาร (TikTok) → หน้า "เงินเข้าบัญชีธนาคาร" (เก็บสถานะที่ผู้ใช้ยืนยันไว้)
    const wds = (built.withdrawals || []).map((w) => {
      const id = `${platform}:${w.kind}:${w.ref}`;
      const cur = A.db.get('deposits', id) || {};
      return { ...cur, id, kind: w.kind, platform, ref: w.ref, date: w.date, amount: w.amount, status: w.status, source: filename, imp: impId };
    });
    if (wds.length) await A.db.putMany('deposits', wds);
    await A.db.put('imports', { id: impId, at: Date.now(), filename, platform, report, rows: built.rowCount, orders: recs.length, items: built.itemCount, created, updated, skipped: built.skipped, adjustments: adj.length });
    return { created, updated, total: recs.length, items: built.itemCount, adjustments: adj.length };
  };
})(window.App);
