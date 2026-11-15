/* ต้นทุนสินค้า: ตั้งต้นทุนต่อ SKU แล้วจับคู่ "ชื่อสินค้า + ตัวเลือก" ในออเดอร์ เข้ากับ SKU
   ที่เก็บ (store products)
   - SKU:      { id: 'sku:<hash>', kind: 'sku', name, cost }
   - จับคู่:    { id: 'map:<hash>', kind: 'map', n, v, sku }   v = '*' หมายถึงทุกตัวเลือกของสินค้านี้
   ออเดอร์ต้องมีรายการสินค้า (o.lines) ซึ่งมาจากไฟล์คำสั่งซื้อ */
(function (A) {
  const U = A.U;
  const K = {};

  K.normN = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  K.normV = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  K.normSku = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  K.key = (n, v) => `${K.normN(n)}||${v === '*' ? '*' : K.normV(v)}`;
  K.skuId = (name) => 'sku:' + U.hash(K.normSku(name));
  K.mapId = (n, v) => 'map:' + U.hash(K.key(n, v));

  let cache = null;
  A.db.on((e) => { if (!e || e.store === 'products' || e.store === '*') cache = null; });
  K.index = () => {
    if (cache) return cache;
    const skus = new Map(), bySkuName = new Map(), maps = new Map();
    A.db.all('products').forEach((x) => {
      if (x.kind === 'sku') { skus.set(x.id, x); bySkuName.set(K.normSku(x.name), x); }
      else if (x.kind === 'map') maps.set(K.key(x.n, x.v), x);
    });
    cache = { skus, bySkuName, maps };
    return cache;
  };
  K.skus = () => [...K.index().skus.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  K.active = () => K.index().skus.size > 0;

  /* หา SKU ของรายการสินค้า: ตรงตัวเลือก > ทั้งสินค้า > SKU ของผู้ขายตรงชื่อ SKU */
  K.lookup = (l) => {
    const ix = K.index();
    const exact = ix.maps.get(K.key(l.n, l.v || ''));
    if (exact) return { sku: ix.skus.get(exact.sku), how: 'exact', map: exact };
    const whole = ix.maps.get(K.key(l.n, '*'));
    if (whole) return { sku: ix.skus.get(whole.sku), how: 'product', map: whole };
    if (l.s) { const s = ix.bySkuName.get(K.normSku(l.s)); if (s) return { sku: s, how: 'sellerSku' }; }
    return null;
  };

  /* ต้นทุนของออเดอร์ → { cost, missing (จำนวนรายการที่ยังไม่รู้ต้นทุน), noLines, counted } */
  K.orderCost = (o, st = A.settings()) => {
    const out = { cost: 0, missing: 0, noLines: false, counted: true };
    if (o.status === 'cancelled' || (o.status === 'returned' && !st.cost.onReturn) || o.status === 'pending_ship') { out.counted = false; return out; }
    if (!o.lines || !o.lines.length) { out.noLines = true; out.missing = 1; return out; }
    o.lines.forEach((l) => {
      const r = K.lookup(l);
      if (r && r.sku) out.cost += (r.sku.cost || 0) * (l.q || 0);
      else out.missing++;
    });
    out.cost = U.round2(out.cost);
    return out;
  };

  /* ชื่อสินค้า + ตัวเลือก ทั้งหมดที่เคยขาย (ไว้จับคู่) */
  K.combos = () => {
    const by = new Map();
    A.db.all('orders').forEach((o) => {
      (o.lines || []).forEach((l) => {
        const k = K.key(l.n, l.v || '');
        let c = by.get(k);
        if (!c) { c = { key: k, n: l.n, v: l.v || '', s: l.s || '', qty: 0, orders: 0, last: '', pf: new Set() }; by.set(k, c); }
        c.qty += l.q || 0; c.orders++; c.pf.add(o.platform);
        const d = o.shipDate || o.orderDate || '';
        if (d > c.last) c.last = d;
      });
    });
    return [...by.values()].map((c) => ({ ...c, pf: [...c.pf], hit: K.lookup(c) }));
  };

  K.saveSku = async (name, cost, prev) => {
    name = String(name || '').trim();
    if (!name) throw new Error('ใส่ชื่อ SKU ก่อนนะ');
    const id = prev ? prev.id : K.skuId(name);
    const cur = A.db.get('products', id);
    if (!prev && cur) throw new Error(`มี SKU "${cur.name}" อยู่แล้ว`);
    return A.db.put('products', { ...(cur || {}), id, kind: 'sku', name, cost: U.round2(+cost || 0) });
  };
  K.setMap = async (n, v, skuId) => {
    const id = K.mapId(n, v);
    if (!skuId) { if (A.db.get('products', id)) await A.db.remove('products', id); return; }
    await A.db.put('products', { id, kind: 'map', n, v: v === '*' ? '*' : v || '', sku: skuId });
  };

  /* ---------- เรียนรู้จากไฟล์ Excel ที่จดเอง (เช่น บัญชีฝน.xlsx) ----------
     - ชีตราคาต้นทุน: หัวตาราง "SKU" + "ราคา/ต้นทุน"
     - ชีตรายการขาย: หัวตาราง "สินค้า" + "ตัวเลือก" + "sku" (+ "จำนวน" "ต้นทุน") → จับคู่ชื่อสินค้า+ตัวเลือก กับ SKU
     - ชีตสินค้ามีปัญหา: คอลัมน์แรกเป็นเลขออเดอร์ขึ้นต้น tt/sp/lz + "ได้รับเงิน" → เรื่องเคลม
     อ่านเฉพาะคอลัมน์ข้างต้น ไม่อ่านข้อมูลลูกค้า */
  const N = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  K.learn = async (file) => {
    if (!window.XLSX) throw new Error('ยังโหลดตัวอ่านไฟล์ Excel ไม่เสร็จ');
    const buf = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsArrayBuffer(file); });
    const wb = XLSX.read(buf, { type: 'array' });
    const costs = new Map(); // normSku → {name, cost}
    const votes = new Map(); // key → {n, v, skus: Map(normSku → {name, count})}
    const unit = new Map(); // normSku → Map(unitCost → count)
    const claims = [];
    const sheets = [];
    const headerless = [];
    let layout = null; // ตำแหน่งคอลัมน์ของชีตรายการขาย ใช้กับชีตที่ไม่มีหัวตาราง (เช่น ชีตที่เริ่มด้วยวันที่)
    const readSales = (name, data, cProd, cVar, cQty, cSku, cPrice) => {
      let n = 0;
      data.forEach((r) => {
        const p = String(r[cProd] || '').trim(), s = String(r[cSku] || '').trim();
        if (!p || !s) return;
        const v = cVar >= 0 ? String(r[cVar] || '').trim() : '';
        const k = K.key(p, v);
        const cur = votes.get(k) || { n: p, v, skus: new Map() };
        const e = cur.skus.get(N(s)) || { name: s, count: 0 };
        e.count++; cur.skus.set(N(s), e); votes.set(k, cur);
        const q = cQty >= 0 ? U.parseNumber(r[cQty]) : 1, c = cPrice >= 0 ? U.parseNumber(r[cPrice]) : null;
        if (q > 0 && c > 0) { const u = U.round2(c / q); const m = unit.get(N(s)) || new Map(); m.set(u, (m.get(u) || 0) + 1); unit.set(N(s), m); }
        n++;
      });
      if (n) sheets.push({ name, kind: 'sales', n });
    };
    wb.SheetNames.forEach((name) => {
      A.importers.fixRange(wb.Sheets[name]);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
      let hi = -1, h = null;
      for (let i = 0; i < Math.min(rows.length, 15); i++) { const r = rows[i].map(N); if (r.some((c) => c === 'sku' || c === 'สินค้า' || c === 'ได้รับเงิน')) { hi = i; h = r; break; } }
      if (hi < 0) { headerless.push({ name, rows }); return; }
      const col = (...names) => h.findIndex((c) => names.includes(c));
      const cSku = col('sku'), cPrice = col('ราคา', 'ต้นทุน', 'ทุน', 'ราคาทุน'), cProd = col('สินค้า', 'ชื่อสินค้า'), cVar = col('ตัวเลือก', 'ชื่อตัวเลือก'), cQty = col('จำนวน'), cGot = col('ได้รับเงิน');
      const data = rows.slice(hi + 1);
      if (cGot >= 0) {
        // ชีตสินค้ามีปัญหา
        const cYuen = col('ยื่น'), cEv = col('หลักฐาน'), cIncome = col('รายได้');
        let n = 0;
        data.forEach((r) => {
          const m = String(r[0] || '').trim().match(/^(tt|sp|lz|lzd)?\s*([0-9a-z]{8,40})$/i);
          if (!m) return;
          const pre = (m[1] || '').toLowerCase();
          const platform = pre === 'tt' ? 'tiktok' : pre === 'sp' ? 'shopee' : pre ? 'lazada' : '';
          const extra = r.slice(cGot + 1).map((x) => String(x || '').trim()).filter(Boolean);
          claims.push({ platform, orderNo: m[2].toUpperCase(), got: U.parseNumber(r[cGot]) || 0, filed: cYuen >= 0 && String(r[cYuen] || '').trim() !== '', evidence: cEv >= 0 && String(r[cEv] || '').trim() !== '', income: cIncome >= 0 ? U.parseNumber(r[cIncome]) : null, note: extra.join(' • ') });
          n++;
        });
        if (n) sheets.push({ name, kind: 'claims', n });
        return;
      }
      if (cSku >= 0 && cProd < 0 && cPrice >= 0) {
        // ชีตต้นทุนต่อ SKU
        let n = 0;
        data.forEach((r) => { const s = String(r[cSku] || '').trim(); const c = U.parseNumber(r[cPrice]); if (s && c != null) { costs.set(N(s), { name: s, cost: c }); n++; } });
        if (n) sheets.push({ name, kind: 'costs', n });
        return;
      }
      if (cSku >= 0 && cProd >= 0) {
        // ชีตรายการขาย
        layout = { cProd, cVar, cQty, cSku, cPrice };
        readSales(name, data, cProd, cVar, cQty, cSku, cPrice);
      }
    });
    // ชีตที่ไม่มีหัวตาราง: ใช้ตำแหน่งคอลัมน์เดียวกับชีตรายการขาย ถ้าคอลัมน์ SKU เป็นชื่อ SKU ที่รู้จักเป็นส่วนใหญ่
    if (layout) {
      const known = new Set([...costs.keys()]);
      votes.forEach((x) => x.skus.forEach((_e, ns) => known.add(ns)));
      headerless.forEach(({ name, rows }) => {
        const vals = rows.map((r) => N(r[layout.cSku])).filter(Boolean);
        if (vals.length >= 5 && vals.filter((v) => known.has(v)).length >= vals.length * 0.6) readSales(name, rows, layout.cProd, layout.cVar, layout.cQty, layout.cSku, layout.cPrice);
      });
    }
    // SKU ที่ไม่มีในชีตต้นทุน → ใช้ต้นทุนต่อชิ้นที่พบบ่อยที่สุดในชีตรายการขาย
    const skuNames = new Map();
    votes.forEach((x) => x.skus.forEach((e, ns) => { if (!skuNames.has(ns)) skuNames.set(ns, e.name); }));
    skuNames.forEach((name, ns) => {
      if (costs.has(ns)) return;
      const m = unit.get(ns);
      const best = m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0] : null;
      costs.set(ns, { name, cost: best ? best[0] : 0, guessed: true });
    });
    const maps = [];
    let conflicts = 0;
    votes.forEach((x) => {
      const ranked = [...x.skus.entries()].sort((a, b) => b[1].count - a[1].count);
      if (ranked.length > 1) conflicts++;
      maps.push({ n: x.n, v: x.v, sku: ranked[0][0] });
    });
    return { costs: [...costs.values()], maps, conflicts, claims, sheets };
  };

  /* บันทึกผลการเรียนรู้: SKU + ต้นทุน และการจับคู่ (ไม่ทับการจับคู่ที่ผู้ใช้ตั้งเองไว้แล้ว เว้นแต่ overwrite) */
  K.applyLearn = async (res, { overwrite = false } = {}) => {
    const ix = K.index();
    const skuRecs = res.costs.map((c) => {
      const id = K.skuId(c.name);
      const cur = ix.skus.get(id) || ix.bySkuName.get(K.normSku(c.name));
      if (cur && !overwrite) return null;
      return { ...(cur || {}), id: cur ? cur.id : id, kind: 'sku', name: cur ? cur.name : c.name, cost: U.round2(c.cost || 0) };
    }).filter(Boolean);
    if (skuRecs.length) await A.db.putMany('products', skuRecs);
    const ix2 = K.index();
    const mapRecs = res.maps.map((m) => {
      const sku = ix2.bySkuName.get(m.sku);
      if (!sku) return null;
      const id = K.mapId(m.n, m.v);
      if (!overwrite && A.db.get('products', id)) return null;
      return { id, kind: 'map', n: m.n, v: m.v || '', sku: sku.id, learned: true };
    }).filter(Boolean);
    if (mapRecs.length) await A.db.putMany('products', mapRecs);
    return { skus: skuRecs.length, maps: mapRecs.length };
  };

  A.costing = K;
})(window.App);
