/* กราฟโทนพาสเทล (Chart.js): โดนัท แท่ง เส้น */
(function (A) {
  const U = A.U;
  const active = [];
  const INK = '#4A4E69', GRID = '#EFE7DA';

  const centerText = {
    id: 'centerText',
    afterDraw(chart, _args, opts) {
      if (!opts || !opts.text) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const x = (chartArea.left + chartArea.right) / 2, y = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = INK; ctx.font = '500 15px Mitr, Tahoma, sans-serif';
      ctx.fillText(opts.text, x, y - (opts.sub ? 8 : 0));
      if (opts.sub) { ctx.font = '11px "IBM Plex Sans Thai", Tahoma, sans-serif'; ctx.fillStyle = '#8A8CA3'; ctx.fillText(opts.sub, x, y + 11); }
      ctx.restore();
    },
  };
  let registered = false;
  function ready() {
    if (!window.Chart) return false;
    if (!registered) {
      Chart.register(centerText);
      Chart.defaults.font.family = '"IBM Plex Sans Thai", Tahoma, sans-serif';
      Chart.defaults.color = '#6E7191';
      registered = true;
    }
    return true;
  }

  const CH = {};
  CH.reset = () => { while (active.length) { try { active.pop().destroy(); } catch (e) { /* ignore */ } } };
  CH.make = (canvas, config) => {
    if (!ready()) { canvas.parentElement.innerHTML = '<div class="empty-chart">โหลดกราฟไม่ได้ (ไม่มีอินเทอร์เน็ต)</div>'; return null; }
    const old = Chart.getChart(canvas); if (old) old.destroy();
    const c = new Chart(canvas, config);
    active.push(c);
    return c;
  };

  /* slices: [{key,label,value,color}] ; opts: {money:true, onClick(key), center, static} */
  CH.donut = (canvas, slices, opts = {}) => {
    const data = slices.filter((s) => s.value > 0);
    const total = U.sum(data, (s) => s.value);
    if (!total) { canvas.parentElement.innerHTML = '<div class="empty-chart">ยังไม่มีข้อมูล<br>ในช่วงนี้</div>'; return null; }
    const fmt = (v) => (opts.money ? U.money(v) : U.num(v) + (opts.unit || ''));
    return CH.make(canvas, {
      type: 'doughnut',
      data: { labels: data.map((s) => s.label), datasets: [{ data: data.map((s) => s.value), backgroundColor: data.map((s) => s.color), borderColor: '#FFFDF8', borderWidth: 3, hoverOffset: 8 }] },
      options: {
        responsive: !opts.static, maintainAspectRatio: false, animation: opts.static ? false : { duration: 500 },
        devicePixelRatio: opts.static ? 2 : undefined,
        cutout: '62%',
        layout: { padding: 6 },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 10, font: { size: 12 },
            generateLabels(chart) {
              return chart.data.labels.map((l, i) => ({ text: `${l} ${U.pct(chart.data.datasets[0].data[i] / total, 0)}`, fillStyle: data[i].color, strokeStyle: data[i].color, pointStyle: 'circle', index: i, hidden: false }));
            } } },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmt(c.raw)} (${U.pct(c.raw / total)})` } },
          centerText: { text: opts.money ? '฿' + U.short(total) : U.num(total), sub: opts.center || 'รวม' },
        },
        onClick: (_e, els) => { if (opts.onClick && els.length) opts.onClick(data[els[0].index].key); },
        onHover: (e, els) => { if (opts.onClick) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      },
    });
  };

  /* datasets: [{label,data,color,type?}] */
  CH.bars = (canvas, labels, datasets, opts = {}) => CH.make(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label, data: d.data, type: d.type || 'bar', backgroundColor: d.color, borderColor: d.border || d.color,
        borderRadius: d.type === 'line' ? 0 : 7, borderSkipped: false, maxBarThickness: 34, tension: 0.35, pointRadius: d.type === 'line' ? 3 : 0,
        borderWidth: d.type === 'line' ? 2.5 : 0, stack: opts.stacked && d.type !== 'line' ? 's' : undefined, order: d.type === 'line' ? 0 : 1,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 12 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${U.money(c.raw)}` } },
      },
      scales: {
        x: { stacked: !!opts.stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 10 } },
        y: { stacked: !!opts.stacked, beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => '฿' + U.short(v) } },
      },
      onClick: (_e, els) => { if (opts.onClick && els.length) opts.onClick(els[0].index); },
    },
  });

  /* render a donut off-screen and return a PNG data URL (for Excel) */
  CH.donutImage = (slices, opts = {}) => new Promise((resolve) => {
    if (!ready() || !slices.some((s) => s.value > 0)) return resolve(null);
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;height:340px;background:#fff';
    const cv = document.createElement('canvas');
    cv.width = 420; cv.height = 340;
    holder.appendChild(cv); document.body.appendChild(holder);
    const chart = CH.donut(cv, slices, { ...opts, static: true });
    setTimeout(() => {
      let url = null;
      try {
        const out = document.createElement('canvas');
        out.width = cv.width; out.height = cv.height;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(cv, 0, 0);
        url = out.toDataURL('image/png');
      } catch (e) { console.error(e); }
      if (chart) { chart.destroy(); const i = active.indexOf(chart); if (i >= 0) active.splice(i, 1); }
      holder.remove();
      resolve(url);
    }, 60);
  });

  A.charts = CH;
})(window.App);
