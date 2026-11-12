/* หน้า: ซิงก์ Firebase */
(function (A) {
  const U = A.U, ui = A.ui;

  A.pages.sync = {
    desc: 'สำรองข้อมูลขึ้นคลาวด์อัตโนมัติ และใช้ข้อมูลชุดเดียวกันได้หลายเครื่อง',
    render(el) {
      const cfg = A.sync.getConfig();
      const s = A.sync.status();
      const signedIn = A.sync.isOn();
      const pend = A.db.pendingCount();
      el.innerHTML = `
        <div class="grid g2">
          <div>
            <div class="card tone-blue">
              <div class="card-head"><h3>${A.icon('gear')} ขั้นที่ 1: ใส่ Firebase config</h3>${cfg ? `<span class="badge b-green">${A.icon('check')} ตั้งค่าแล้ว (${U.esc(cfg.projectId)})</span>` : ''}</div>
              ${cfg ? `<p class="small muted">โปรเจกต์: <code>${U.esc(cfg.projectId)}</code> • authDomain: <code>${U.esc(cfg.authDomain)}</code></p>
                <button class="btn ghost sm" id="cfg-clear">${A.icon('trash')} เปลี่ยน/ลบ config</button>`
              : `<p class="small muted">คัดลอกส่วน <code>firebaseConfig</code> จาก Firebase Console → Project settings → Your apps มาวาง (ดูคู่มือด้านขวา)</p>
                <textarea class="input" id="cfg" rows="8" placeholder='const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "....firebaseapp.com",\n  projectId: "...",\n  appId: "..."\n};'></textarea>
                <div class="row mt-s"><span class="spacer"></span><button class="btn blue" id="cfg-save">${A.icon('check')} บันทึก config</button></div>`}
            </div>
            <div class="card tone-pink">
              <div class="card-head"><h3>${A.icon('user')} ขั้นที่ 2: เข้าสู่ระบบ</h3>${signedIn ? `<span class="badge b-green">${U.esc(s.email)}</span>` : ''}</div>
              ${!cfg ? '<p class="muted small">ใส่ config ในขั้นที่ 1 ก่อน</p>'
              : signedIn ? `<p>เข้าสู่ระบบเป็น <b>${U.esc(s.email)}</b> — ข้อมูลจะซิงก์กับทุกเครื่องที่ใช้บัญชีนี้</p><button class="btn ghost sm" id="out">${A.icon('logout')} ออกจากระบบ</button>`
              : `<p class="small muted">ใช้อีเมล/รหัสผ่านสำหรับ Firebase ของร้าน (ครั้งแรกกด "สมัครบัญชีใหม่") — ทุกเครื่องใช้บัญชีเดียวกันเพื่อเห็นข้อมูลชุดเดียวกัน</p>
                <form id="login" class="form-grid" style="grid-template-columns:1fr 1fr">
                  <div class="field"><label>อีเมล</label><input class="input" type="email" name="email" required autocomplete="username"></div>
                  <div class="field"><label>รหัสผ่าน</label><input class="input" type="password" name="pw" required minlength="6" autocomplete="current-password"></div>
                  <div class="row" style="grid-column:1/-1"><button class="btn" type="submit">${A.icon('user')} เข้าสู่ระบบ</button><button class="btn ghost" type="button" id="signup">สมัครบัญชีใหม่</button></div>
                </form>`}
            </div>
            <div class="card">
              <div class="card-head"><h3>${A.icon('cloud')} สถานะการซิงก์</h3></div>
              <dl class="kv">
                <dt>สถานะ</dt><dd id="st-text">${statusText(s)}</dd>
                <dt>ซิงก์ล่าสุด</dt><dd>${U.thDateTime(U.lsGet('bunny.sync.lastAt', 0))}</dd>
                <dt>รายการรอส่งขึ้น</dt><dd>${U.num(pend)} รายการ</dd>
                ${s.msg ? `<dt>รายละเอียด</dt><dd class="small">${U.esc(s.msg)}</dd>` : ''}
              </dl>
              <div class="row mt">
                <label class="check"><input type="checkbox" id="auto" ${A.sync.isAuto() ? 'checked' : ''}> ซิงก์อัตโนมัติเมื่อมีการแก้ไข</label>
                <span class="spacer"></span>
                <button class="btn blue" id="now" ${signedIn ? '' : 'disabled'}>${A.icon('refresh')} ซิงก์ตอนนี้</button>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>${A.icon('info')} คู่มือตั้งค่า Firebase (ครั้งเดียว ~10 นาที)</h3></div>
            <ol class="steps">
              <li><div>เข้า <b>console.firebase.google.com</b> → <b>Add project</b> ตั้งชื่อ เช่น <code>bunny-ledger</code> (ปิด Google Analytics ได้)</div></li>
              <li><div>ในหน้าโปรเจกต์ กดไอคอน <b>&lt;/&gt; (Web)</b> → ตั้งชื่อแอป → <b>Register app</b> → คัดลอกส่วน <code>firebaseConfig</code> มาวางในขั้นที่ 1</div></li>
              <li><div>เมนู <b>Build → Authentication</b> → Get started → แท็บ Sign-in method → เปิด <b>Email/Password</b></div></li>
              <li><div>Authentication → Settings → <b>Authorized domains</b> → ตรวจว่ามี <code>localhost</code> (ปกติมีอยู่แล้ว)</div></li>
              <li><div>เมนู <b>Build → Firestore Database</b> → Create database → เลือก location <code>asia-southeast1 (Singapore)</code> → Production mode</div></li>
              <li><div>Firestore → แท็บ <b>Rules</b> → ลบของเดิม วางเนื้อหาจากไฟล์ <code>firestore.rules</code> ในโฟลเดอร์โปรแกรม → <b>Publish</b></div></li>
              <li><div>กลับมาที่หน้านี้ → <b>สมัครบัญชีใหม่</b> ด้วยอีเมลของร้าน → เสร็จ! เครื่องอื่นแค่ใส่ config เดียวกันแล้วเข้าสู่ระบบด้วยบัญชีเดียวกัน</div></li>
            </ol>
            <div class="notice mt">${A.icon('info')}<div>แพ็กเกจฟรี (Spark) ของ Firebase เพียงพอสำหรับร้านทั่วไป (อ่าน 50,000 / เขียน 20,000 ครั้งต่อวัน) • ข้อมูลแต่ละบัญชีเห็นได้เฉพาะเจ้าของตามกฎใน firestore.rules</div></div>
            <p class="small muted mt-s">คู่มือฉบับเต็มอยู่ในไฟล์ <code>คู่มือตั้งค่า-Firebase.md</code></p>
          </div>
        </div>`;

      const $ = (q) => el.querySelector(q);
      if ($('#cfg-save')) $('#cfg-save').onclick = async () => {
        try { const c = A.sync.parseConfig($('#cfg').value); await A.sync.saveConfig(c); ui.toast('บันทึก config แล้ว', 'ok'); A.rerender(); }
        catch (e) { ui.toast(e.message, 'err'); }
      };
      if ($('#cfg-clear')) $('#cfg-clear').onclick = async () => {
        if (await ui.confirm('ลบ Firebase config?', 'จะหยุดซิงก์ในเครื่องนี้ (ข้อมูลในเครื่องและบนคลาวด์ยังอยู่ครบ)', 'ลบ config', true)) A.sync.clearConfig();
      };
      if ($('#login')) {
        const form = $('#login');
        const run = async (fn, okMsg) => {
          const fd = new FormData(form);
          const email = String(fd.get('email') || '').trim(), pw = String(fd.get('pw') || '');
          if (!email || pw.length < 6) { ui.toast('กรอกอีเมล และรหัสผ่านอย่างน้อย 6 ตัว', 'err'); return; }
          try { await fn(email, pw); ui.toast(okMsg, 'ok'); setTimeout(A.rerender, 800); } catch (e) { ui.toast(e.message, 'err'); }
        };
        form.onsubmit = (e) => { e.preventDefault(); run(A.sync.signIn, 'เข้าสู่ระบบแล้ว กำลังซิงก์…'); };
        $('#signup').onclick = () => run(A.sync.signUp, 'สมัครบัญชีแล้ว กำลังซิงก์…');
      }
      if ($('#out')) $('#out').onclick = async () => { await A.sync.signOut(); ui.toast('ออกจากระบบแล้ว'); A.rerender(); };
      $('#auto').onchange = (e) => A.sync.setAuto(e.target.checked);
      $('#now').onclick = async (e) => {
        e.currentTarget.disabled = true;
        try { const r = await A.sync.syncNow(); ui.toast(`ซิงก์เสร็จ: ดึงลง ${r ? r.got : 0} • ส่งขึ้น ${r ? r.sent : 0} รายการ`, 'ok'); }
        catch (err) { ui.toast('ซิงก์ไม่สำเร็จ: ' + err.message, 'err'); }
        A.rerender();
      };
    },
  };

  function statusText(s) {
    return ({ off: 'ยังไม่ตั้งค่า', signedOut: 'ยังไม่เข้าสู่ระบบ', connecting: 'กำลังเชื่อมต่อ…', busy: 'กำลังซิงก์…', ok: '<span class="badge b-green">ซิงก์เรียบร้อย</span>', offline: '<span class="badge b-butter">ออฟไลน์ — จะส่งขึ้นเมื่อมีเน็ต</span>', error: '<span class="badge b-red">มีปัญหา</span>' })[s.state] || s.state;
  }
})(window.App);
