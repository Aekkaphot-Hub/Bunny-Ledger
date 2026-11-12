/* หน้า: ค่าธรรมเนียมแพลตฟอร์ม */
(function (A) {
  const U = A.U, ui = A.ui, S = A.summary;
  const state = { months: 12 };

  A.pages.fees = {
    desc: 'ค่าคอมมิชชั่น ค่าบริการ ค่าธรรมเนียมชำระเงินที่แพลตฟอร์มหักไป สรุปรายเดือน',
    render(el) { draw(el); },
  };

  function draw(el) {
    const t = U.today();
    const from = U.addMonths(t, -(state.months - 1));
    const per = {};
    A.PF_KEYS.forEach((k) => { per[k] = S.bucket('month', from, t, { platform: k }); });
    const months = per.shopee.map((r) => r.from);
    const tot = {};
    A.PF_KEYS.forEach((k) => { tot[k] = S.total(per[k]); });
    const est = A.db.all('orders').filter((o) => o.orderDate >= from && !A.isVoid(o.status) && A.calc.feesEstimated(o)).length;
    const st = A.settings();
    const learned = A.calc.learnedRates();
    const rateText = A.PF_KEYS.map((k) => `${A.PLATFORMS[k].name} ${U.pct(A.calc.rateFor(k, st), 1)}${learned[k] ? ' (จากเงินเข้าจริง)' : ' (จากตั้งค่า)'}`).join(' • ');

    el.innerHTML = `
      <div class="notice">${A.icon('info')}<div>ตัวเลขในหน้านี้คือ <b>ยอดที่แพลตฟอร์มหักทั้งหมด</b> = ยอดขาย − เงินเข้าจริง (รวมค่าคอมมิชชั่น ค่าธรรมเนียม และค่าส่งที่ร้านถูกหัก)</div></div><div class="mt-s"></div>
      ${est ? `<div class="notice warn">${A.icon('info')}<div>มี ${U.num(est)} ออเดอร์ที่เงินยังไม่เข้า จึงใช้อัตราประมาณ: ${rateText} — นำเข้าไฟล์รายได้เพิ่มเพื่อให้ได้ตัวเลขจริง</div></div><div class="mt-s"></div>` : ''}
      <div class="grid g3">
        ${A.PF_KEYS.map((k) => `<div class="pf-card" style="--pf:${A.PLATFORMS[k].color}">
          <div class="row"><span class="pf-logo">${A.PLATFORMS[k].letter}</span><h3>${A.PLATFORMS[k].name}</h3></div>
          <div class="row mt-s"><div><div class="small muted">ค่าธรรมเนียม ${state.months} เดือน</div><div style="font-family:var(--font-head);font-size:22px">${U.money(tot[k].fees)}</div></div><span class="spacer"></span>
          <span class="badge b-butter">${tot[k].sales ? U.pct(tot[k].fees / tot[k].sales) : '–'} ของยอดขาย</span></div>
        </div>`).join('')}
      </div>
      <div class="grid g-1-2 mt">
        <div class="card"><div class="card-head"><h3>${A.icon('pie')} สัดส่วนค่าธรรมเนียม</h3></div><div class="chart-box tall"><canvas id="c-pie"></canvas></div></div>
        <div class="card"><div class="card-head"><h3>${A.icon('calendar')} ค่าธรรมเนียมรายเดือน</h3>
          <div class="tabs">${[3, 6, 12].map((n) => `<button class="tab ${state.months === n ? 'active' : ''}" data-m="${n}">${n} เดือน</button>`).join('')}</div></div>
          <div class="chart-box tall"><canvas id="c-bar"></canvas></div></div>
      </div>
      <div class="card mt">
        <div class="card-head"><h3>${A.icon('tag')} ตารางค่าธรรมเนียมรายเดือน</h3></div>
        ${ui.table([
          { h: 'เดือน', v: (i) => U.thMonth(months[i]) },
          ...A.PF_KEYS.flatMap((k) => [
            { h: `${A.PLATFORMS[k].name} ยอดขาย`, cls: 'num', v: (i) => U.money0(per[k][i].sales) },
            { h: `ค่าธรรมเนียม`, cls: 'num', v: (i) => `${U.money(per[k][i].fees)}<div class="small muted">${per[k][i].sales ? U.pct(per[k][i].fees / per[k][i].sales) : ''}</div>` },
          ]),
          { h: 'รวมค่าธรรมเนียม', cls: 'num', v: (i) => `<b>${U.money(U.sum(A.PF_KEYS, (k) => per[k][i].fees))}</b>` },
        ], months.map((_, i) => i).reverse(), {
          foot: [{ v: 'รวม' }, ...A.PF_KEYS.flatMap((k) => [{ cls: 'num', v: U.money0(tot[k].sales) }, { cls: 'num', v: U.money(tot[k].fees) }]), { cls: 'num', v: U.money(U.sum(A.PF_KEYS, (k) => tot[k].fees)) }],
        })}
      </div>`;
    el.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { state.months = +b.dataset.m; A.charts.reset(); draw(el); }; });
    A.charts.donut(el.querySelector('#c-pie'), A.PF_KEYS.map((k) => ({ key: k, label: A.PLATFORMS[k].name, color: A.PLATFORMS[k].color, value: tot[k].fees })), { money: true, center: 'ค่าธรรมเนียม' });
    A.charts.bars(el.querySelector('#c-bar'), months.map(U.thMonthShort), A.PF_KEYS.map((k) => ({ label: A.PLATFORMS[k].name, color: A.PLATFORMS[k].color, data: per[k].map((r) => U.round2(r.fees)) })), { stacked: true });
  }
})(window.App);
