/* นำเข้าไฟล์ CSV / Excel จาก Seller Center
   ขั้นตอน: อ่านไฟล์ → หาแถวหัวตาราง → เดาแพลตฟอร์ม/ชนิดรายงาน → จับคู่คอลัมน์ → รวมแถวตามเลขออเดอร์ → บันทึก */
(function (A) {
  const U = A.U;
  const I = {};
  A.importers = I;

  const NO_FUZZY = new Set(['qty', 'status', 'sku', 'amount', 'rowType', 'substatus', 'carrier', 'itemRefund', 'sellerDiscount', 'itemGross']);
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
    return best;
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
    const used = new Set();
    const map = {};
    // pass 1: exact
    Object.entries(fields).forEach(([k, f]) => {
      const al = f.aliases.map(I.norm);
      if (f.kind === 'multi') {
        const idx = nh.map((h, i) => (al.includes(h) && !used.has(i) ? i : -1)).filter((i) => i >= 0);
        if (idx.length) { map[k] = idx; idx.forEach((i) => used.add(i)); }
        return;
      }
      for (const a of al) { const i = nh.indexOf(a); if (i >= 0 && !used.has(i)) { map[k] = i; used.add(i); return; } }
    });
    // pass 2: header contains alias (for slightly different names)
    Object.entries(fields).forEach(([k, f]) => {
      if (map[k] != null || NO_FUZZY.has(k) || f.kind === 'multi') return;
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
    return m;
  };

  /* ---------- transform rows → normalized records ---------- */
  const cleanId = (v) => String(v == null ? '' : v).trim().replace(/^'+/, '').replace(/\.0+$/, '');
  I.build = ({ rows, headerIdx }, platform, report, mapping, shop) => {
    const fields = I.FIELDS[report];
    const data = rows.slice(headerIdx + 1);
    // decide date order per file (d/m/y or m/d/y)
    const dateCols = Object.entries(mapping).filter(([k]) => fields[k] && fields[k].type === 'date').map(([, i]) => i);
    const sample = [];
    data.slice(0, 300).forEach((r) => dateCols.forEach((i) => sample.push(r[i])));
    const dateOrder = U.detectDateOrder(sample);

    const groups = new Map();
    let skipped = 0;
    const lineBased = report === 'income' && mapping.actualPayout == null && mapping.amount != null;
    data.forEach((r) => {
      const id = cleanId(r[mapping.orderNo]);
      if (!id || /\s/.test(id) || id.length > 40 || !/\d/.test(id)) { skipped++; return; }
      if (report === 'income' && mapping.rowType != null) {
        const t = String(r[mapping.rowType] || '').toLowerCase();
        if (t && !/order|คำสั่งซื้อ/.test(t)) { skipped++; return; }
      }
      if (report === 'income' && mapping.paidStatus != null) {
        const ps = String(r[mapping.paidStatus] || '').toLowerCase();
        if (/not|ยังไม่|unpaid/.test(ps)) { skipped++; return; }
      }
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(r);
    });

    const conv = (f, v) => {
      if (f.type === 'num') return U.parseNumber(v);
      if (f.type === 'date') return U.parseDate(v, dateOrder);
      return v == null ? '' : String(v).trim();
    };
    const out = [];
    groups.forEach((rs, orderNo) => {
      const rec = { platform, orderNo };
      if (shop) rec.shop = shop;
      Object.entries(fields).forEach(([k, f]) => {
        const col = mapping[k];
        if (col == null || k === 'orderNo') return;
        if (f.kind === 'multi') {
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
        delete rec.feeName; delete rec.paidStatus; delete rec.rowType;
        if (rec.refund) {
          const r = Math.abs(rec.refund);
          rec.refundAmount = U.round2(r);
          if (rec.grossSales && r >= rec.grossSales * 0.99) rec.fullRefund = true;
          else if (rec.grossSales != null) rec.grossSales = U.round2(Math.max(0, rec.grossSales - r));
        }
        delete rec.refund;
        if (rec.feesTotal != null) rec.platformFees = Math.abs(rec.feesTotal);
        else if (rec.fees != null) rec.platformFees = rec.fees;
        delete rec.feesTotal; delete rec.fees;
        if (rec.actualPayout == null) return;
      }
      out.push(rec);
    });
    return { records: out, skipped, dateOrder, rowCount: data.length };
  };

  /* ---------- save to database (upsert by platform + order number) ---------- */
  I.makeId = (platform, orderNo) => `${platform}:${String(orderNo).replace(/\//g, '_')}`;
  const MANUAL = ['note', 'manualPaid', 'mismatchOk'];
  I.commit = async (built, { platform, report, filename }) => {
    const today = U.today();
    let created = 0, updated = 0;
    const recs = built.records.map((r) => {
      const id = I.makeId(platform, r.orderNo);
      const cur = A.db.getRaw('orders', id);
      const alive = cur && !cur.deleted ? cur : null;
      const base = alive ? { ...alive } : { id, platform, orderNo: r.orderNo, createdAt: Date.now(), deleted: false };
      if (alive) updated++; else created++;
      const clean = {};
      Object.entries(r).forEach(([k, v]) => { if (v != null && v !== '' && !MANUAL.includes(k)) clean[k] = v; });
      let next;
      if (report === 'orders') {
        next = { ...base, ...clean, source: filename };
        // อย่าย้อนสถานะที่ผู้ใช้กดเองว่า "ได้รับแล้ว" กลับไปเป็นกำลังส่ง
        if (alive && alive.status === 'delivered' && clean.status === 'shipped') next.status = 'delivered';
        if (!next.status) next.status = 'pending_ship';
        if (!next.orderDate) next.orderDate = today;
      } else {
        next = { ...base, actualPayout: clean.actualPayout, payoutDate: clean.payoutDate || base.payoutDate || today, manualPaid: false };
        ['platformFees', 'payoutRef', 'refundAmount'].forEach((k) => { if (clean[k] != null) next[k] = clean[k]; });
        if (clean.grossSales != null && base.grossSales == null) next.grossSales = clean.grossSales;
        if (!next.orderDate) next.orderDate = clean.orderDate || next.payoutDate;
        if (!next.status || next.status === 'pending_ship' || next.status === 'shipped') next.status = 'completed';
        if (r.fullRefund) next.status = 'returned'; // คืนเงินเต็มจำนวน ไม่นับเป็นยอดขาย
        if (!next.source) next.source = filename;
      }
      next.deleted = false;
      return next;
    });
    await A.db.putMany('orders', recs);
    await A.db.put('imports', { at: Date.now(), filename, platform, report, rows: built.rowCount, orders: recs.length, created, updated, skipped: built.skipped });
    return { created, updated, total: recs.length };
  };
})(window.App);
