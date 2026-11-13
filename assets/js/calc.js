/* ตรรกะคำนวณ: ค่าธรรมเนียม ยอดที่ควรได้ ลูกหนี้แพลตฟอร์ม ติดตามพัสดุ */
(function (A) {
  const U = A.U;
  const C = {};

  C.isPaid = (o) => o.actualPayout != null;

  /* วันที่นับยอดขาย = "วันที่ส่งสินค้า" (ไม่ใช่วันที่สั่ง)
     - Shopee: เวลาส่งสินค้า • TikTok: Shipped Time
     - ไฟล์ที่ไม่มีวันส่ง (เช่น ไฟล์ออเดอร์ Lazada) → วันที่ลูกค้าได้รับ → วันที่คำสั่งซื้อสำเร็จ → วันที่สั่ง
     - ยังไม่ส่ง → ยังไม่นับเป็นยอดขาย (อยู่ใน ติดตามออเดอร์ → รอจัดส่ง) */
  C.saleDate = (o) => {
    if (o.shipDate) return o.shipDate;
    if (o.status === 'pending_ship') return null;
    return o.deliveredDate || o.completedDate || o.orderDate || null;
  };
  C.saleDateEstimated = (o) => !o.shipDate;
  /* เงินเข้าแยกตามวัน — ออเดอร์เดียวอาจได้เงินหลายรอบ (เช่น โอนแล้ว เดือนถัดไปโดนหักคืนเงิน) */
  C.payoutParts = (o) => {
    if (o.actualPayout == null) return [];
    if (o.payoutParts && Object.keys(o.payoutParts).length) {
      return Object.entries(o.payoutParts).map(([date, p]) => ({ date: /^\d{4}-/.test(date) ? date : o.payoutDate, amount: p.pay || 0 }));
    }
    return [{ date: o.payoutDate, amount: o.actualPayout }];
  };
  C.paidIn = (o, from, to) => U.sum(C.payoutParts(o).filter((p) => p.date && p.date >= from && p.date <= to), (p) => p.amount);

  /* อัตราที่ถูกหักจริง (ค่าธรรมเนียม + ค่าส่งที่แพลตฟอร์มหัก) เรียนรู้จากออเดอร์ที่เงินเข้าแล้ว
     ใช้ค่ามัธยฐานของ 300 ออเดอร์ล่าสุดต่อแพลตฟอร์ม ต้องมีอย่างน้อย 10 ออเดอร์ */
  let learnCache = null;
  A.db.on(() => { learnCache = null; });
  C.learnedRates = () => {
    if (learnCache) return learnCache;
    const out = {};
    const all = A.db.all('orders');
    A.PF_KEYS.forEach((p) => {
      const xs = all.filter((o) => o.platform === p && o.actualPayout != null && o.grossSales > 0 && !A.isVoid(o.status))
        .sort((a, b) => (b.payoutDate || '').localeCompare(a.payoutDate || '')).slice(0, 300)
        .map((o) => (o.grossSales - o.actualPayout) / o.grossSales).filter((x) => x >= 0 && x < 0.8).sort((a, b) => a - b);
      if (xs.length >= 10) out[p] = { rate: xs[Math.floor(xs.length / 2)], n: xs.length };
    });
    learnCache = out;
    return out;
  };
  C.rateFor = (p, st = A.settings()) => { const l = C.learnedRates()[p]; return l ? l.rate : st.feeRate[p] || 0; };

  // ยอดที่ถูกหัก: ถ้าเงินเข้าแล้ว = ยอดขาย − เงินเข้าจริง (รวมค่าส่งที่ถูกหัก) > ค่าธรรมเนียมจากไฟล์ > ประมาณการ
  C.fees = (o, st = A.settings()) => {
    if (o.actualPayout != null && o.grossSales != null) return Math.max(0, o.grossSales - o.actualPayout);
    if (o.platformFees != null) return Math.abs(o.platformFees);
    if (o.grossSales != null) return o.grossSales * C.rateFor(o.platform, st);
    return 0;
  };
  C.feesEstimated = (o) => o.platformFees == null && !(o.actualPayout != null && o.grossSales != null);
  C.expected = (o, st = A.settings()) => {
    if (o.expectedPayout != null) return o.expectedPayout;
    if (o.grossSales == null) return o.actualPayout || 0;
    return o.grossSales - C.fees(o, st);
  };
  // วันที่ใช้นับรอบเงินเข้า
  C.baseDate = (o) => o.deliveredDate || o.completedDate || (o.shipDate ? U.addDays(o.shipDate, 3) : null) || U.addDays(o.orderDate || U.today(), 5);
  C.dueDate = (o, st = A.settings()) => U.addDays(C.baseDate(o), st.payoutDays[o.platform] || 7);

  /* ลูกหนี้แพลตฟอร์ม: ส่งถึง/สำเร็จแล้ว แต่ยังไม่มีเงินเข้า */
  C.receivables = (filter = {}) => {
    const st = A.settings();
    const today = U.today();
    return A.db.all('orders')
      .filter((o) => (o.status === 'delivered' || o.status === 'completed') && !C.isPaid(o))
      .filter((o) => !filter.platform || o.platform === filter.platform)
      .map((o) => {
        const base = C.baseDate(o);
        const due = U.addDays(base, st.payoutDays[o.platform] || 7);
        const age = Math.max(0, U.diffDays(base, today));
        return { o, base, due, age, overdue: today > due, overdueDays: Math.max(0, U.diffDays(due, today)), amount: C.expected(o, st) };
      })
      .sort((a, b) => b.overdueDays - a.overdueDays || b.age - a.age);
  };
  /* เงินที่จะได้จากออเดอร์ที่ยังไม่ถึงมือลูกค้า */
  C.inTransit = (filter = {}) => {
    const st = A.settings();
    return A.db.all('orders')
      .filter((o) => (o.status === 'pending_ship' || o.status === 'shipped') && !C.isPaid(o))
      .filter((o) => !filter.platform || o.platform === filter.platform)
      .map((o) => ({ o, amount: C.expected(o, st) }));
  };
  /* เงินเข้าแล้วแต่ยอดผิดปกติ */
  C.mismatches = (filter = {}) => {
    const st = A.settings();
    const out = [];
    A.db.all('orders').forEach((o) => {
      if (!C.isPaid(o) || o.mismatchOk || A.isVoid(o.status)) return;
      if (filter.platform && o.platform !== filter.platform) return;
      const reasons = [];
      if (o.expectedSource === 'file' && o.expectedPayout != null) {
        const diff = o.actualPayout - o.expectedPayout;
        if (Math.abs(diff) > st.payoutTolerance) reasons.push(`ได้${diff < 0 ? 'น้อย' : 'มาก'}กว่าที่ควรได้ ${U.money(Math.abs(diff))}`);
      }
      if (o.grossSales > 0) {
        const feePct = (o.grossSales - o.actualPayout) / o.grossSales;
        if (feePct > st.maxFeePct) reasons.push(`ถูกหัก ${U.pct(feePct)} ของยอดขาย`);
      }
      if (reasons.length) out.push({ o, reasons, diff: o.expectedPayout != null ? o.actualPayout - o.expectedPayout : null });
    });
    return out.sort((a, b) => (b.o.payoutDate || '').localeCompare(a.o.payoutDate || ''));
  };

  /* ติดตามออเดอร์ */
  C.tracking = (filter = {}) => {
    const st = A.settings();
    const today = U.today();
    const res = { pendingShip: [], shipping: [], notReceived: [], received: [], voided: [] };
    A.db.all('orders').forEach((o) => {
      if (filter.platform && o.platform !== filter.platform) return;
      if (o.status === 'pending_ship') {
        const age = U.diffDays(o.orderDate || today, today);
        res.pendingShip.push({ o, age, late: age > st.shipLateDays });
      } else if (o.status === 'shipped') {
        const from = o.shipDate || o.orderDate || today;
        const age = U.diffDays(from, today);
        (age > st.deliveryDays ? res.notReceived : res.shipping).push({ o, age, late: age > st.deliveryDays });
      } else if (o.status === 'delivered' || o.status === 'completed') {
        const d = o.deliveredDate || o.completedDate || o.orderDate;
        if (d && U.diffDays(d, today) <= 30) res.received.push({ o, age: U.diffDays(d, today) });
      } else if (A.isVoid(o.status)) {
        if (U.diffDays(o.orderDate || today, today) <= 60) res.voided.push({ o, age: U.diffDays(o.orderDate || today, today) });
      }
    });
    res.pendingShip.sort((a, b) => b.age - a.age);
    res.notReceived.sort((a, b) => b.age - a.age);
    res.shipping.sort((a, b) => b.age - a.age);
    res.received.sort((a, b) => a.age - b.age);
    res.voided.sort((a, b) => a.age - b.age);
    return res;
  };

  C.badges = () => {
    const r = C.receivables().filter((x) => x.overdue).length;
    const t = C.tracking();
    return { receivables: r, tracking: t.notReceived.length + t.pendingShip.filter((x) => x.late).length };
  };

  A.calc = C;
})(window.App);
