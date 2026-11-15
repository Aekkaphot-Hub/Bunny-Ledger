/* ทำให้เว็บเป็น "แอป": ลงทะเบียน service worker, ปุ่มติดตั้งแอป, ขอให้เบราว์เซอร์เก็บข้อมูลถาวร */
(function (A) {
  const U = A.U;
  let deferredPrompt = null;
  const pwa = {};

  /* มือถือ: กันการซูมด้วยสองนิ้ว (Safari บน iPhone ไม่สนค่า user-scalable=no ใน viewport) */
  ['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });

  pwa.isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  pwa.isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  pwa.canPrompt = () => !!deferredPrompt;

  pwa.install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const r = await deferredPrompt.userChoice;
      deferredPrompt = null;
      drawButton();
      if (r.outcome === 'accepted') A.ui.toast('ติดตั้งแอปแล้ว — เปิดได้จากไอคอนกระต่ายบนเดสก์ท็อป/หน้าจอโฮม', 'ok');
      return;
    }
    A.ui.modal({
      title: 'ติดตั้ง Bunny Ledger เป็นแอป',
      body: pwa.isIOS()
        ? `<ol class="steps"><li><div>เปิดหน้านี้ด้วย <b>Safari</b></div></li><li><div>กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น)</div></li><li><div>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b> → เพิ่ม</div></li></ol>`
        : `<ol class="steps"><li><div><b>คอมพิวเตอร์ (Edge / Chrome):</b> กดไอคอน <b>ติดตั้งแอป</b> ท้ายช่องที่อยู่เว็บ หรือเมนู ⋯ → แอป → ติดตั้งไซต์นี้เป็นแอป</div></li>
           <li><div><b>Android (Chrome):</b> เมนู ⋮ → <b>ติดตั้งแอป</b> หรือ เพิ่มไปยังหน้าจอหลัก</div></li></ol>
           <p class="small muted mt-s">ถ้าไม่เห็นเมนูติดตั้ง ให้ตรวจว่าเปิดผ่าน http://localhost:8642 (เปิดโปรแกรม.bat) หรือผ่านเว็บที่อัปขึ้น Firebase Hosting (https://…web.app)</p>`,
      actions: [{ label: 'เข้าใจแล้ว' }],
    });
  };

  function drawButton() {
    const b = document.getElementById('install-btn');
    if (!b) return;
    b.classList.toggle('hidden', pwa.isStandalone());
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; drawButton(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; drawButton(); });

  pwa.boot = async () => {
    drawButton();
    const b = document.getElementById('install-btn');
    if (b) b.onclick = pwa.install;
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'activated' && navigator.serviceWorker.controller) A.ui.toast('อัปเดตแอปเป็นเวอร์ชันใหม่แล้ว', 'ok');
          });
        });
      } catch (e) { console.warn('service worker', e); }
    }
    // ขอให้เบราว์เซอร์ไม่ลบข้อมูลแอปเองเมื่อพื้นที่เต็ม
    if (navigator.storage && navigator.storage.persist) {
      try { const ok = await navigator.storage.persisted() || await navigator.storage.persist(); U.lsSet('bunny.persisted', ok); } catch (e) { /* ignore */ }
    }
  };

  A.pwa = pwa;
})(window.App);
