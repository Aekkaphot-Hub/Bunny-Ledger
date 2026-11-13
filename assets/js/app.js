/* ตัวหลักของโปรแกรม: sidebar, router (#/หน้า), เริ่มต้นระบบ */
(function (A) {
  const U = A.U;
  let current = null;

  function findItem(id) {
    for (const g of A.MENU) for (const it of g.items) if (it.id === id) return { g, it };
    return null;
  }

  A.renderSidebar = () => {
    const sb = document.getElementById('sidebar');
    const st = A.settings();
    const badges = A.calc.badges();
    sb.innerHTML = `
      <div class="brand">
        <img src="assets/img/bunny-logo.svg" alt="Bunny Ledger">
        <div class="brand-text"><h2>Bunny Ledger</h2><small>${U.esc(st.shopName)}</small></div>
      </div>
      <button class="collapse-btn" id="collapse-btn" title="ย่อ/ขยายเมนู">${A.icon(document.getElementById('app').classList.contains('collapsed') ? 'chevR' : 'chevL')}</button>
      ${A.MENU.map((g) => `
        <div class="nav-group tone-${g.tone}">
          <div class="nav-group-title"><span>${g.title}</span></div>
          ${g.items.map((it) => {
            const n = it.badge ? badges[it.badge] : 0;
            return `<a class="nav-item tone-${g.tone} ${current === it.id ? 'active' : ''}" href="#/${it.id}" data-tip="${U.esc(it.label)} — ${U.esc(it.desc)}" title="${U.esc(it.desc)}">
              <span class="nav-ic">${A.icon(it.icon)}</span>
              <span class="nav-text"><b>${it.label}</b><small>${it.desc}</small></span>
              ${n ? `<span class="nav-badge" title="ต้องตามด่วน ${n} รายการ">${n > 99 ? '99+' : n}</span>` : ''}
            </a>`;
          }).join('')}
        </div>`).join('')}
    `;
    document.getElementById('collapse-btn').onclick = () => {
      const app = document.getElementById('app');
      app.classList.toggle('collapsed');
      U.lsSet('bunny.collapsed', app.classList.contains('collapsed'));
      A.renderSidebar();
    };
  };

  function route() {
    const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [id, q] = hash.split('?');
    const page = A.pages[id] ? id : 'dashboard';
    current = page;
    const meta = findItem(page);
    document.getElementById('page-title').textContent = meta ? meta.it.label.replace(/^\d\.\s*/, '') : (A.pages[page].title || '');
    document.getElementById('page-desc').textContent = (A.pages[page] && A.pages[page].desc) || (meta ? meta.it.desc : '');
    document.title = `${meta ? meta.it.label.replace(/^\d\.\s*/, '') : ''} · Bunny Ledger`;
    A.charts.reset();
    const view = document.getElementById('view');
    view.innerHTML = '';
    try {
      A.pages[page].render(view, new URLSearchParams(q || ''));
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="notice red">${A.icon('alert')}<div>เกิดข้อผิดพลาดในหน้านี้: ${U.esc(e.message)}</div></div>`;
    }
    A.renderSidebar();
  }
  A.go = (path) => { if (location.hash === '#/' + path) route(); else location.hash = '#/' + path; };
  /* re-draw the current page, keeping scroll */
  A.rerender = () => {
    const y = window.scrollY;
    route();
    window.scrollTo(0, y);
  };
  const softRefresh = U.debounce(() => {
    const a = document.activeElement;
    const typing = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
    if (typing || document.querySelector('.modal-back')) { A.renderSidebar(); return; }
    A.rerender();
  }, 400);

  function updateToday() {
    const t = U.today();
    document.getElementById('today-label').textContent = U.thDateLong(t);
  }

  async function boot() {
    if (U.lsGet('bunny.collapsed', false)) document.getElementById('app').classList.add('collapsed');
    updateToday();
    try {
      await A.db.init();
    } catch (e) {
      document.getElementById('view').innerHTML = `<div class="notice red">${A.icon('alert')}<div>เปิดฐานข้อมูลในเครื่องไม่ได้: ${U.esc(e.message)}<br>ลองเปิดด้วย Chrome หรือ Edge ผ่านไฟล์ <b>เปิดโปรแกรม.bat</b></div></div>`;
      return;
    }
    A.db.on((e) => { if (e.remote) softRefresh(); else A.renderSidebar(); });
    window.addEventListener('hashchange', () => { closeDrawer(); route(); window.scrollTo(0, 0); });
    setupChrome();
    route();
    setInterval(updateToday, 60000);
    if (A.pwa) A.pwa.boot();
    if (A.filestore) A.filestore.boot();
    if (A.sync) A.sync.boot();
  }

  /* ปุ่มเมนูบนมือถือ (เมนูเลื่อนออกจากซ้าย) + ปุ่มติดตั้งแอป */
  function closeDrawer() { document.getElementById('app').classList.remove('menu-open'); }
  function setupChrome() {
    const app = document.getElementById('app');
    const mb = document.getElementById('menu-btn');
    mb.innerHTML = A.icon('menu');
    mb.onclick = () => app.classList.toggle('menu-open');
    document.getElementById('drawer-back').onclick = closeDrawer;
    document.getElementById('install-btn').innerHTML = `${A.icon('download')} <span class="install-label">ติดตั้งแอป</span>`;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.App);
