/* ข้อมูลตัวอย่าง 60 วันย้อนหลัง (ทำเครื่องหมาย demo:true ลบออกได้ทีหลัง) */
(function (A) {
  const U = A.U;
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  const PRODUCTS = ['เสื้อยืดลายกระต่าย', 'กระเป๋าผ้าพาสเทล', 'แก้วน้ำเก็บความเย็น', 'สมุดโน้ตปกน่ารัก', 'ตุ๊กตากระต่ายนุ่มนิ่ม', 'ปากกาเจลสีพาสเทล', 'ผ้าพันคอไหมพรม', 'เคสมือถือใส', 'ถุงเท้าลายการ์ตูน', 'ที่คาดผมหูกระต่าย'];
  const PRICE = [199, 259, 329, 89, 450, 59, 279, 149, 79, 99];
  const CARRIER = { shopee: 'SPX Express', lazada: 'LEX TH', tiktok: 'J&T Express' };

  A.demo = {
    async load() {
      const r = rng(20261112);
      const today = U.today();
      const st = A.settings();
      const orders = [];
      let seq = 1000;
      for (let back = 60; back >= 0; back--) {
        const date = U.addDays(today, -back);
        const n = 3 + Math.floor(r() * 7);
        for (let i = 0; i < n; i++) {
          const pr = r();
          const platform = pr < 0.48 ? 'shopee' : pr < 0.74 ? 'lazada' : 'tiktok';
          const pi = Math.floor(r() * PRODUCTS.length);
          const qty = 1 + Math.floor(r() * 3);
          const gross = PRICE[pi] * qty;
          const fees = U.round2(gross * (st.feeRate[platform] + (r() - 0.5) * 0.03));
          const orderNo = (platform === 'shopee' ? '2611' : platform === 'lazada' ? '7' : '57') + String(++seq).padStart(8, '0');
          const o = {
            id: `${platform}:${orderNo}`, platform, orderNo, orderDate: date, items: PRODUCTS[pi], qty, grossSales: gross, platformFees: fees,
            expectedPayout: U.round2(gross - fees), expectedSource: 'file', carrier: CARRIER[platform],
            trackingNo: (platform === 'shopee' ? 'TH' : platform === 'lazada' ? 'LXTH' : 'JT') + Math.floor(1e9 + r() * 9e9), source: 'ข้อมูลตัวอย่าง', demo: true,
          };
          const x = r();
          if (x < 0.04) o.status = 'cancelled';
          else if (x < 0.06) { o.status = 'returned'; o.shipDate = U.addDays(date, 1); }
          else if (back <= 1) o.status = 'pending_ship';
          else {
            o.shipDate = U.addDays(date, 1);
            const transit = 2 + Math.floor(r() * 4);
            const stuck = r() < 0.02 && back > 7; // ของหาย/ช้า
            if (stuck || back - 1 < transit) o.status = 'shipped';
            else {
              o.deliveredDate = U.addDays(o.shipDate, transit);
              o.status = back > 10 ? 'completed' : 'delivered';
              const payAfter = st.payoutDays[platform] - 2 + Math.floor(r() * 4);
              const payDate = U.addDays(o.deliveredDate, payAfter);
              const missing = r() < 0.06; // แพลตฟอร์มยังไม่โอน
              if (!missing && payDate <= today) {
                o.payoutDate = payDate;
                o.actualPayout = r() < 0.05 ? U.round2(o.expectedPayout - 20 - Math.floor(r() * 40)) : o.expectedPayout;
              }
            }
          }
          if (o.status === 'pending_ship' && r() < 0.3) o.orderDate = U.addDays(date, -3); // ค้างส่ง
          orders.push(o);
        }
      }
      const expenses = [];
      const cats = st.expenseCategories;
      for (let back = 60; back >= 0; back -= 1) {
        const date = U.addDays(today, -back);
        if (back % 7 === 0) expenses.push({ date, category: 'ต้นทุนสินค้า', amount: 2500 + Math.round(r() * 2500), note: 'สั่งของล็อตใหม่', demo: true });
        if (back % 3 === 0) expenses.push({ date, category: 'ค่าแพ็กของ', amount: 80 + Math.round(r() * 150), note: 'กล่อง/บับเบิ้ล', demo: true });
        if (back % 5 === 0) {
          const p = A.PF_KEYS[back % 3];
          expenses.push({ date, category: 'ค่าโฆษณา', platform: p, amount: 200 + Math.round(r() * 400), note: `ยิงแอด ${A.PLATFORMS[p].name}`, demo: true });
        }
        if (U.parseYmd(date).getDate() === 1) expenses.push({ date, category: cats.includes('ค่าเช่า/ค่าน้ำไฟ') ? 'ค่าเช่า/ค่าน้ำไฟ' : 'อื่นๆ', amount: 1500, note: 'ค่าไฟ/เน็ต', demo: true });
      }
      const income = [];
      for (let back = 56; back >= 0; back -= 9) income.push({ date: U.addDays(today, -back), category: 'ขายหน้าร้าน', amount: 300 + Math.round(r() * 900), note: 'ขายที่ตลาดนัด', demo: true });
      await A.db.putMany('orders', orders);
      await A.db.putMany('expenses', expenses);
      await A.db.putMany('otherIncome', income);
      return orders.length;
    },
    async remove() {
      let n = 0;
      for (const s of ['orders', 'expenses', 'otherIncome']) {
        const ids = A.db.all(s).filter((x) => x.demo).map((x) => x.id);
        n += ids.length;
        await A.db.removeMany(s, ids);
      }
      return n;
    },
    has() { return A.db.all('orders').some((o) => o.demo); },
  };
})(window.App);
