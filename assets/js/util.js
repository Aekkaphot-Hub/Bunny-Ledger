/* ตัวช่วยทั่วไป: รูปแบบเงิน วันที่ไทย แปลงตัวเลข/วันที่จากไฟล์ */
window.App = window.App || {};
window.App.pages = window.App.pages || {};
(function (A) {
  const U = {};
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  const nf2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
  U.money = (n) => (n == null || isNaN(n) ? '–' : (n < 0 ? '-฿' : '฿') + nf2.format(Math.abs(n)));
  U.money0 = (n) => (n == null || isNaN(n) ? '–' : (n < 0 ? '-฿' : '฿') + nf0.format(Math.abs(n)));
  U.short = (n) => {
    n = Number(n) || 0;
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return nf0.format(n);
  };
  U.num = (n) => nf0.format(Number(n) || 0);
  U.pct = (n, d = 1) => (n == null || !isFinite(n) ? '–' : (n * 100).toFixed(d) + '%');
  U.round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // ---- dates ('YYYY-MM-DD', local time) ----
  U.pad = (n) => String(n).padStart(2, '0');
  U.ymd = (d) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  U.today = () => U.ymd(new Date());
  U.parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  U.addDays = (s, n) => { const d = U.parseYmd(s); d.setDate(d.getDate() + n); return U.ymd(d); };
  U.diffDays = (a, b) => Math.round((U.parseYmd(b) - U.parseYmd(a)) / 86400000); // b - a
  U.weekStart = (s) => { const d = U.parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return U.ymd(d); };
  U.monthStart = (s) => s.slice(0, 7) + '-01';
  U.monthEnd = (s) => { const d = U.parseYmd(U.monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return U.ymd(d); };
  U.addMonths = (s, n) => { const d = U.parseYmd(U.monthStart(s)); d.setMonth(d.getMonth() + n); return U.ymd(d); };

  U.TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  U.TH_MONTHS_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  U.TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  U.TH_DOW_L = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  U.thDate = (s) => {
    if (!s) return '–';
    const d = U.parseYmd(s);
    return `${d.getDate()} ${U.TH_MONTHS_S[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
  };
  U.thDateLong = (s) => {
    const d = U.parseYmd(s);
    return `วัน${U.TH_DOW_L[d.getDay()]}ที่ ${d.getDate()} ${U.TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
  };
  U.thMonth = (s) => { const d = U.parseYmd(U.monthStart(s)); return `${U.TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`; };
  U.thMonthShort = (s) => { const d = U.parseYmd(U.monthStart(s)); return `${U.TH_MONTHS_S[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`; };
  U.thDateTime = (ts) => {
    if (!ts) return '–';
    const d = new Date(ts);
    return `${U.thDate(U.ymd(d))} ${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  };

  // ---- parse values coming from Excel/CSV ----
  U.parseNumber = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s || s === '-' || s === '–') return null;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/[^0-9.]/g, '');
    if (!s) return null;
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return neg ? -n : n;
  };

  const EN_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const fixYear = (y) => { y = Number(y); if (y < 100) y += 2000; if (y > 2400) y -= 543; return y; };
  const okDate = (y, m, d) => y > 1990 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  // order: 'dmy' (Thai, default) or 'mdy' (US) for ambiguous a/b/yyyy dates
  U.parseDate = (v, order) => {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : U.ymd(v);
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { // Excel serial date
        const d = new Date(Math.round((v - 25569) * 86400000));
        return `${d.getUTCFullYear()}-${U.pad(d.getUTCMonth() + 1)}-${U.pad(d.getUTCDate())}`;
      }
      if (v > 1e9 && v < 1e11) return U.ymd(new Date(v * 1000)); // unix seconds
      if (v > 1e11) return U.ymd(new Date(v)); // unix ms
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) { const y = fixYear(m[1]); if (okDate(y, +m[2], +m[3])) return `${y}-${U.pad(m[2])}-${U.pad(m[3])}`; }
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
    if (m) {
      // Thai style day/month/year; if the first part > 12 it cannot be a month anyway
      let d = +m[1], mo = +m[2];
      if (order === 'mdy') { const t = d; d = mo; mo = t; }
      if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
      const y = fixYear(m[3]);
      if (okDate(y, mo, d)) return `${y}-${U.pad(mo)}-${U.pad(d)}`;
    }
    m = s.match(/(\d{1,2})\s*([A-Za-z]{3})[A-Za-z]*\.?\s*,?\s*(\d{4})/);
    if (m && EN_MONTHS[m[2].toLowerCase()]) { const y = fixYear(m[3]); return `${y}-${U.pad(EN_MONTHS[m[2].toLowerCase()])}-${U.pad(m[1])}`; }
    m = s.match(/([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m && EN_MONTHS[m[1].toLowerCase()]) { const y = fixYear(m[3]); return `${y}-${U.pad(EN_MONTHS[m[1].toLowerCase()])}-${U.pad(m[2])}`; }
    for (let i = 0; i < 12; i++) {
      const re = new RegExp('(\\d{1,2})\\s*' + U.TH_MONTHS_S[i].replace(/\./g, '\\.?') + '\\s*(\\d{2,4})');
      const t = s.match(re) || s.match(new RegExp('(\\d{1,2})\\s*' + U.TH_MONTHS[i] + '\\s*(\\d{2,4})'));
      if (t) { const y = fixYear(t[2]); return `${y}-${U.pad(i + 1)}-${U.pad(t[1])}`; }
    }
    return null;
  };

  // look at many a/b/yyyy strings and decide whether they are day-first or month-first
  U.detectDateOrder = (values) => {
    for (const v of values) {
      if (typeof v !== 'string') continue;
      const m = v.trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
      if (!m) continue;
      if (+m[1] > 12) return 'dmy';
      if (+m[2] > 12) return 'mdy';
    }
    return 'dmy';
  };

  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.sum = (arr, f) => arr.reduce((a, x) => a + (Number(f ? f(x) : x) || 0), 0);
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  U.hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  U.lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  U.lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  A.U = U;
})(window.App);
