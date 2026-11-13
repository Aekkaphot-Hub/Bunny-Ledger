/* การ์ด "บัญชี & ซิงก์" ในหน้าตั้งค่า (แทนเมนูซิงก์ Firebase เดิม) */
(function (A) {
  const U = A.U, ui = A.ui;
  const GUIDE = 'https://github.com/Aekkaphot-Hub/Bunny-Ledger/blob/main/' + encodeURIComponent('คู่มือตั้งค่า-Firebase.md');

  const STATE = {
    connecting: '<span class="badge b-blue">กำลังเชื่อมต่อ…</span>',
    busy: '<span class="badge b-blue">กำลังซิงก์…</span>',
    ok: '<span class="badge b-green">ซิงก์เรียบร้อย</span>',
    offline: '<span class="badge b-butter">ออฟไลน์ — จะซิงก์เมื่อมีเน็ต</span>',
    error: '<span class="badge b-red">มีปัญหา</span>',
    signedOut: '<span class="badge b-grey">ยังไม่ได้เข้าสู่ระบบ</span>',
  };

  A.accountCard = (box) => {
    const draw = () => {
      if (!box.isConnected) return;
      const S = A.sync, s = S.status();
      const head = `<div class="card-head"><h3>${A.icon('cloud')} บัญชี & ซิงก์</h3>${S.hasConfig() ? STATE[s.state] || '' : '<span class="badge b-grey">ใช้ในเครื่องนี้เท่านั้น</span>'}</div>`;

      if (!S.hasConfig()) {
        box.innerHTML = `${head}
          <p>ตอนนี้ข้อมูลอยู่ในเครื่องนี้เท่านั้น เชื่อม Firebase เพื่อเข้าสู่ระบบและใช้ข้อมูลชุดเดียวกันทั้งคอมและมือถือ (ฟรี)</p>
          <p class="small muted">ทำตาม <a href="${GUIDE}" target="_blank" rel="noopener">คู่มือตั้งค่า Firebase</a> แล้ววาง firebaseConfig ด้านล่าง (หรือส่งให้ผู้ดูแลใส่ไว้ในแอป ทุกเครื่องจะเชื่อมเอง)</p>
          <details><summary class="small" style="cursor:pointer">วาง Firebase config</summary>
            <textarea class="input mt-s" id="cfg" rows="7" placeholder='const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "....firebaseapp.com",\n  projectId: "...",\n  appId: "..."\n};'></textarea>
            <div class="row mt-s"><span class="spacer"></span><button class="btn blue sm" id="cfg-save">${A.icon('check')} บันทึก config</button></div>
          </details>`;
        box.querySelector('#cfg-save').onclick = async () => {
          try { await S.saveConfig(S.parseConfig(box.querySelector('#cfg').value)); ui.toast('เชื่อม Firebase แล้ว — เข้าสู่ระบบได้เลย', 'ok'); }
          catch (e) { ui.toast(e.message, 'err'); }
        };
        return;
      }

      if (!s.email) {
        box.innerHTML = `${head}
          <p>${s.state === 'connecting' ? 'กำลังเชื่อมต่อ Firebase…' : s.state === 'error' || s.state === 'offline' ? `เชื่อมต่อ Firebase ไม่ได้ตอนนี้ — ใช้งานในเครื่องไปก่อนได้${s.msg ? `<br><span class="small muted">${U.esc(s.msg)}</span>` : ''}` : 'เข้าสู่ระบบเพื่อซิงก์ข้อมูลกับเครื่องอื่น ข้อมูลในเครื่องนี้จะถูกรวมขึ้นบัญชีอัตโนมัติ'}</p>
          <div class="row"><button class="btn" id="login" ${s.state === 'connecting' ? 'disabled' : ''}>${A.icon('user')} เข้าสู่ระบบ / สร้างบัญชี</button></div>
          ${S.configFromFile() ? '' : '<p class="small mt-s"><a href="#" id="cfg-clear">เปลี่ยน / ลบ Firebase config</a></p>'}`;
        box.querySelector('#login').onclick = () => A.authGate.open('signin');
      } else {
        const pend = A.db.pendingCount();
        box.innerHTML = `${head}
          <dl class="kv">
            <dt>บัญชี</dt><dd><b>${U.esc(s.email)}</b></dd>
            <dt>ซิงก์ล่าสุด</dt><dd>${U.thDateTime(U.lsGet('bunny.sync.lastAt', 0))}</dd>
            <dt>รอส่งขึ้นคลาวด์</dt><dd>${U.num(pend)} รายการ</dd>
            ${s.msg && s.state !== 'ok' ? `<dt>รายละเอียด</dt><dd class="small">${U.esc(s.msg)}</dd>` : ''}
          </dl>
          <div class="row mt">
            <label class="check"><input type="checkbox" id="auto" ${S.isAuto() ? 'checked' : ''}> ซิงก์อัตโนมัติ</label>
            <span class="spacer"></span>
            <button class="btn blue sm" id="now">${A.icon('refresh')} ซิงก์ตอนนี้</button>
          </div>
          <div class="row mt-s">
            <button class="btn ghost sm" id="out">${A.icon('logout')} ออกจากระบบ</button>
            <button class="btn ghost sm" id="out-wipe" title="สำหรับเครื่องที่ใช้ร่วมกับคนอื่น">${A.icon('trash')} ออกจากระบบ + ล้างข้อมูลในเครื่องนี้</button>
          </div>
          ${S.configFromFile() ? '' : '<p class="small mt-s"><a href="#" id="cfg-clear">เปลี่ยน / ลบ Firebase config</a></p>'}`;
        box.querySelector('#auto').onchange = (e) => S.setAuto(e.target.checked);
        box.querySelector('#now').onclick = async (e) => {
          e.currentTarget.disabled = true;
          try { const r = await S.syncNow(); ui.toast(`ซิงก์เสร็จ: ดึงลง ${r ? r.got : 0} • ส่งขึ้น ${r ? r.sent : 0} รายการ`, 'ok'); }
          catch (err) { ui.toast('ซิงก์ไม่สำเร็จ: ' + err.message, 'err'); }
          draw();
        };
        box.querySelector('#out').onclick = async () => {
          if (!(await ui.confirm('ออกจากระบบ?', 'ข้อมูลยังอยู่ในเครื่องนี้ แต่จะไม่ซิงก์จนกว่าจะเข้าสู่ระบบอีกครั้ง', 'ออกจากระบบ'))) return;
          await S.signOut(); ui.toast('ออกจากระบบแล้ว');
        };
        box.querySelector('#out-wipe').onclick = async () => {
          if (!(await ui.confirm('ออกจากระบบและล้างข้อมูลในเครื่องนี้?', 'ใช้กับเครื่องที่ใช้ร่วมกับคนอื่น — ข้อมูลบนคลาวด์ยังอยู่ครบ เข้าสู่ระบบใหม่เมื่อไรก็ดึงกลับมาได้', 'ออกจากระบบ + ล้าง', true))) return;
          await S.signOut({ wipe: true }); ui.toast('ออกจากระบบและล้างข้อมูลในเครื่องแล้ว'); A.go('dashboard');
        };
      }
      const clr = box.querySelector('#cfg-clear');
      if (clr) clr.onclick = async (e) => {
        e.preventDefault();
        if (await ui.confirm('ลบ Firebase config?', 'จะหยุดซิงก์ในเครื่องนี้ (ข้อมูลในเครื่องและบนคลาวด์ยังอยู่ครบ)', 'ลบ config', true)) S.clearConfig();
      };
    };
    draw();
    A.sync.onStatus(draw);
  };

  // ลิงก์เก่า #/sync → ไปหน้าตั้งค่า ส่วนบัญชี
  A.pages.sync = { title: 'บัญชี & ซิงก์', render() { location.replace('#/settings?focus=account'); } };
})(window.App);
