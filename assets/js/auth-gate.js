/* หน้าจอเข้าสู่ระบบตอนเปิดแอป (เฉพาะเมื่อมี Firebase config)
   - เข้าสู่ระบบแล้ว → ซิงก์ข้อมูลอัตโนมัติเบื้องหลัง
   - "ใช้งานในเครื่องนี้ไปก่อน" → ข้ามได้ (เข้าสู่ระบบทีหลังที่หน้า ตั้งค่า → บัญชี & ซิงก์)
   - ออฟไลน์ / เชื่อม Firebase ไม่ได้ → ไม่บล็อกแอป */
(function (A) {
  const U = A.U;
  const SKIP_KEY = 'bunny.skipLogin';
  let el = null;
  let mode = 'signin'; // signin | signup | reset

  const gate = {};
  gate.skipped = () => U.lsGet(SKIP_KEY, false);

  function close() { if (el) { el.remove(); el = null; } }

  gate.open = (m = 'signin') => {
    mode = m;
    if (!el) {
      el = document.createElement('div');
      el.className = 'auth-back';
      document.body.appendChild(el);
    }
    draw();
  };

  function draw() {
    // ข้อมูลในเครื่องจะรวมขึ้นบัญชีเฉพาะเมื่อยังไม่เคยผูกกับบัญชีไหน
    const localCount = A.workspace && A.workspace.isMain() && !U.lsGet('bunny.main.owner', null) ? A.db.count('orders') + A.db.count('expenses') + A.db.count('otherIncome') : 0;
    const titles = { signin: 'เข้าสู่ระบบ', signup: 'สร้างบัญชีร้าน', reset: 'ลืมรหัสผ่าน' };
    el.innerHTML = `
      <div class="auth-card" role="dialog" aria-modal="true" aria-label="${titles[mode]}">
        <img src="assets/img/bunny-logo.svg" alt="" class="auth-logo">
        <h2>Bunny Ledger</h2>
        <p class="muted small" style="margin:2px 0 14px">${mode === 'signup' ? 'สร้างบัญชีครั้งแรกสำหรับร้านของคุณ' : mode === 'reset' ? 'เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมล' : 'เข้าสู่ระบบเพื่อใช้ข้อมูลชุดเดียวกันทั้งคอมและมือถือ'}</p>
        <form id="auth-form" class="auth-form">
          <div class="field"><label>อีเมล</label><input class="input" type="email" name="email" required autocomplete="username" value="${U.esc(U.lsGet('bunny.lastEmail', ''))}"></div>
          ${mode !== 'reset' ? `<div class="field"><label>รหัสผ่าน${mode === 'signup' ? ' (อย่างน้อย 6 ตัว)' : ''}</label><input class="input" type="password" name="pw" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></div>` : ''}
          ${mode === 'signup' ? `<div class="field"><label>ยืนยันรหัสผ่าน</label><input class="input" type="password" name="pw2" required minlength="6" autocomplete="new-password"></div>` : ''}
          <div class="auth-err hidden" id="auth-err"></div>
          <button class="btn" type="submit" style="width:100%;justify-content:center">${mode === 'signup' ? A.icon('sparkle') + ' สร้างบัญชีและเข้าสู่ระบบ' : mode === 'reset' ? A.icon('note') + ' ส่งลิงก์ตั้งรหัสใหม่' : A.icon('user') + ' เข้าสู่ระบบ'}</button>
        </form>
        <div class="auth-links">
          ${mode === 'signin' ? '<a href="#" data-m="reset">ลืมรหัสผ่าน?</a><a href="#" data-m="signup">ยังไม่มีบัญชี? สร้างบัญชีร้าน</a>' : '<a href="#" data-m="signin">← กลับไปเข้าสู่ระบบ</a>'}
        </div>
        ${localCount ? `<p class="small muted" style="margin-top:12px">ข้อมูลที่มีอยู่ในเครื่องนี้ (${U.num(localCount)} รายการ) จะถูกรวมขึ้นบัญชีหลังเข้าสู่ระบบ</p>` : ''}
        <button class="auth-skip" id="auth-skip" type="button">ใช้งานในเครื่องนี้ไปก่อน (ไม่ซิงก์)</button>
      </div>`;
    const form = el.querySelector('#auth-form');
    const err = el.querySelector('#auth-err');
    const showErr = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    el.querySelectorAll('[data-m]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); mode = a.dataset.m; draw(); }; });
    el.querySelector('#auth-skip').onclick = () => {
      U.lsSet(SKIP_KEY, true);
      close();
      A.ui.toast('ใช้งานในเครื่องนี้ — เข้าสู่ระบบได้ทีหลังที่ ตั้งค่า → บัญชี & ซิงก์');
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const pw = String(fd.get('pw') || '');
      if (mode === 'signup' && pw !== String(fd.get('pw2') || '')) { showErr('รหัสผ่านสองช่องไม่ตรงกัน'); return; }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        U.lsSet('bunny.lastEmail', email);
        if (mode === 'reset') {
          await A.sync.resetPassword(email);
          A.ui.toast('ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว — เช็กอีเมล (รวมถึงโฟลเดอร์สแปม)', 'ok');
          mode = 'signin'; draw();
          return;
        }
        // หลังเข้าสู่ระบบ: เปิดหน้าต่างเลือกร้าน (จำไว้ข้ามการโหลดหน้าใหม่ เช่น เมื่อต้องสลับฐานข้อมูลในเครื่อง)
        try { sessionStorage.setItem('bunny.openPicker', '1'); } catch (e) { /* ignore */ }
        if (mode === 'signup') await A.sync.signUp(email, pw); else await A.sync.signIn(email, pw);
        U.lsSet(SKIP_KEY, false);
        close();
        A.ui.toast(mode === 'signup' ? 'สร้างบัญชีแล้ว — ส่งอีเมลยืนยันไปให้แล้ว (ใช้ร้านของคุณได้ทันที)' : 'เข้าสู่ระบบแล้ว กำลังซิงก์ข้อมูล…', 'ok');
      } catch (ex) {
        try { sessionStorage.removeItem('bunny.openPicker'); } catch (e) { /* ignore */ }
        showErr(ex.message);
      } finally {
        if (btn.isConnected) btn.disabled = false;
      }
    };
    const first = form.querySelector(U.lsGet('bunny.lastEmail', '') && mode === 'signin' ? 'input[name=pw]' : 'input');
    if (first) setTimeout(() => first.focus(), 30);
  }

  /* เรียกจาก app.js หลังเริ่มระบบซิงก์ */
  gate.boot = () => {
    if (!A.sync.hasConfig()) return;
    A.sync.onStatus((s) => {
      if (!s.authReady) return;
      if (s.state === 'signedOut') { if (!gate.skipped() && !el) gate.open('signin'); }
      else if (s.email) close();
    });
  };

  A.authGate = gate;
})(window.App);
