/* สรุปยอดตามช่วงเวลา: รายวัน / รายสัปดาห์ (จันทร์–อาทิตย์) / รายเดือน
   ใช้ร่วมกันทั้งหน้าจอ กราฟ และไฟล์ Excel */
(function (A) {
  const U = A.U;
  const S = {};

  S.GRAN = { day: 'รายวัน', week: 'รายสัปดาห์', month: 'รายเดือน' };

  S.keyOf = (gran, d) => (gran === 'day' ? d : gran === 'week' ? U.weekStart(d) : U.monthStart(d));
  S.periodOf = (gran, anchor) => {
    if (gran === 'day') return { key: anchor, from: anchor, to: anchor, label: U.thDate(anchor) };
    if (gran === 'week') {
      const from = U.weekStart(anchor), to = U.addDays(from, 6);
      return { key: from, from, to, label: `${U.thDate(from)} – ${U.thDate(to)}` };
    }
    const from = U.monthStart(anchor);
    return { key: from, from, to: U.monthEnd(anchor), label: U.thMonth(anchor) };
  };
  S.shift = (gran, anchor, n) => (gran === 'day' ? U.addDays(anchor, n) : gran === 'week' ? U.addDays(anchor, 7 * n) : U.addMonths(anchor, n));
  S.periods = (gran, from, to) => {
    const out = [];
    let a = S.periodOf(gran, from).from;
    let guard = 0;
    while (a <= to && guard++ < 2000) { out.push(S.periodOf(gran, a)); a = S.shift(gran, a, 1); }
    return out;
  };

  // วันที่ของออเดอร์ = วันที่ส่ง (ออเดอร์ยกเลิก/คืนที่ไม่มีวันส่ง ใช้วันที่สั่ง)
  S.dayOf = (o) => (A.isVoid(o.status) ? A.calc.saleDate(o) || o.orderDate : A.calc.saleDate(o));

  const blank = () => ({ sales: 0, orders: 0, fees: 0, received: 0, receivedCount: 0, paid1: 0, paid1Count: 0, paid2: 0, paid2Count: 0, cogs: 0, cogsMissing: 0, pending: 0, expenses: 0, otherIncome: 0, voided: 0, qty: 0 });
  const pfOk = (f, p) => !f.platform || f.platform === p;
  const shopOk = (f, s) => !f.shop || f.shop === s;

  /* one pass over all data → buckets keyed by period */
  S.bucket = (gran, from, to, f = {}) => {
    const st = A.settings();
    const costOn = A.costing && A.costing.active();
    const map = new Map();
    S.periods(gran, from, to).forEach((p) => map.set(p.key, { ...p, ...blank() }));
    const add = (d, fn) => {
      if (!d || d < from || d > to) return;
      const b = map.get(S.keyOf(gran, d));
      if (b) fn(b);
    };
    A.db.all('orders').forEach((o) => {
      if (!pfOk(f, o.platform) || !shopOk(f, o.shop)) return;
      // ยอดขายนับตามวันที่ส่งสินค้า / ออเดอร์ยกเลิกนับจำนวนตามวันที่สั่ง
      add(A.isVoid(o.status) ? (A.calc.saleDate(o) || o.orderDate) : A.calc.saleDate(o), (b) => {
        // ต้นทุนสินค้า (เมื่อตั้งต้นทุนไว้แล้ว)
        if (costOn) { const c = A.costing.orderCost(o, st); if (c.counted) { b.cogs += c.cost; if (c.missing) b.cogsMissing++; } }
        if (A.isVoid(o.status)) {
          b.voided++;
          // ออเดอร์คืนสินค้าที่โดนหักค่าส่งคืน (เงินเข้าติดลบ) นับเป็นค่าใช้จ่าย
          if (o.actualPayout < 0) b.fees += -o.actualPayout;
          return;
        }
        b.sales += o.grossSales || 0;
        b.orders++;
        b.qty += o.qty || 0;
        b.fees += A.calc.fees(o, st);
        if (!A.calc.isPaid(o)) b.pending += A.calc.expected(o, st);
      });
      const parts = A.calc.payoutParts(o);
      parts.forEach((p) => add(p.date, (b) => { b.received += p.amount || 0; b.receivedCount++; }));
      if (!parts.length) return;
      // เงินเข้า 1 = เงินของออเดอร์ที่ส่งในช่วงนั้น (ไม่ว่าเงินจะเข้าวันไหน)
      // เงินเข้า 2 = เงินที่เข้าในช่วงนั้น แต่เป็นของออเดอร์ที่ส่งช่วงอื่น
      const d = S.dayOf(o);
      const own = d && d >= from && d <= to ? S.keyOf(gran, d) : null;
      if (own) add(d, (b) => { b.paid1 += U.sum(parts, (p) => p.amount || 0); b.paid1Count++; });
      const seen = new Set();
      parts.forEach((p) => {
        if (!p.date || S.keyOf(gran, p.date) === own) return;
        add(p.date, (b) => { b.paid2 += p.amount || 0; if (!seen.has(b.key)) { seen.add(b.key); b.paid2Count++; } });
      });
    });
    A.db.all('expenses').forEach((e) => {
      if (f.platform && e.platform !== f.platform) return;
      add(e.date, (b) => { b.expenses += e.amount || 0; });
    });
    if (!f.platform) A.db.all('otherIncome').forEach((e) => add(e.date, (b) => { b.otherIncome += e.amount || 0; }));
    const rows = [...map.values()];
    rows.forEach((b) => { b.net = b.sales - b.fees; b.gross = b.net - b.cogs; b.profit = b.sales - b.fees - b.cogs + b.otherIncome - b.expenses; });
    return rows;
  };
  S.total = (rows) => {
    const t = blank();
    rows.forEach((r) => Object.keys(t).forEach((k) => { t[k] += r[k]; }));
    t.net = t.sales - t.fees; t.gross = t.net - t.cogs; t.profit = t.sales - t.fees - t.cogs + t.otherIncome - t.expenses;
    return t;
  };
  S.range = (from, to, f = {}) => S.total(S.bucket('month', from, to, f));

  /* items that belong to a date range (for detail lists) */
  S.items = (from, to, f = {}) => {
    const inR = (d) => d && d >= from && d <= to;
    const orders = A.db.all('orders').filter((o) => pfOk(f, o.platform) && shopOk(f, o.shop));
    const day = S.dayOf;
    const payouts = orders.filter((o) => A.calc.payoutParts(o).some((p) => inR(p.date))).sort((a, b) => (b.payoutDate || '').localeCompare(a.payoutDate || ''));
    return {
      // ออเดอร์ของช่วงนี้ = ออเดอร์ที่ "ส่งสินค้า" ในช่วงนี้
      orders: orders.filter((o) => inR(day(o))).sort((a, b) => (day(b) || '').localeCompare(day(a) || '')),
      payouts,
      // เงินเข้า 2: เงินที่เข้าช่วงนี้ของออเดอร์ที่ส่งช่วงอื่น
      payouts2: payouts.filter((o) => !inR(day(o))),
      expenses: A.db.all('expenses').filter((e) => inR(e.date) && (!f.platform || e.platform === f.platform)).sort((a, b) => b.date.localeCompare(a.date)),
      otherIncome: f.platform ? [] : A.db.all('otherIncome').filter((e) => inR(e.date)).sort((a, b) => b.date.localeCompare(a.date)),
    };
  };

  /* data for the donut charts */
  S.pies = (from, to, f = {}) => {
    const st = A.settings();
    const it = S.items(from, to, f);
    const live = it.orders.filter((o) => !A.isVoid(o.status));
    const byPf = (arr, val) => A.PF_KEYS.map((k) => ({ key: k, label: A.PLATFORMS[k].name, color: A.PLATFORMS[k].color, value: U.sum(arr.filter((o) => o.platform === k), val) }));
    const cats = {};
    it.expenses.forEach((e) => { cats[e.category || 'อื่นๆ'] = (cats[e.category || 'อื่นๆ'] || 0) + (e.amount || 0); });
    const palette = ['#F6B5CB', '#9CCBF0', '#A8DCC9', '#FBE3A7', '#C9B8F2', '#F5A97F', '#B9D7A8', '#F2A7A7', '#A7C7E7', '#E6C3E8'];
    const statusCount = {};
    it.orders.forEach((o) => { const k = o.status || 'pending_ship'; statusCount[k] = (statusCount[k] || 0) + 1; });
    return {
      sales: byPf(live, (o) => o.grossSales),
      fees: byPf(live, (o) => A.calc.fees(o, st)),
      expenses: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ key: k, label: k, value: v, color: palette[i % palette.length] })),
      money: [
        { key: 'paid', label: 'เงินเข้าแล้ว', color: '#A8DCC9', value: U.sum(live.filter(A.calc.isPaid), (o) => o.actualPayout) },
        { key: 'unpaid', label: 'รอเงินเข้า', color: '#F6B5CB', value: U.sum(live.filter((o) => !A.calc.isPaid(o)), (o) => A.calc.expected(o, st)) },
      ],
      status: Object.keys(A.STATUS).filter((k) => statusCount[k]).map((k) => ({ key: k, label: A.STATUS[k].label, color: A.STATUS[k].color, value: statusCount[k] })),
    };
  };

  A.summary = S;
})(window.App);
