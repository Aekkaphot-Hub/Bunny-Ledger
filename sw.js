/* Bunny Ledger service worker — ทำให้แอปเปิดได้แม้ไม่มีเน็ต / ไม่ได้เปิด เปิดโปรแกรม.bat
   - ไฟล์ของแอปเอง: ลองโหลดใหม่จากเซิร์ฟเวอร์ก่อน (ได้เวอร์ชันล่าสุด) ถ้าไม่ได้ใช้ของในแคช
   - ไลบรารีจาก CDN (ล็อกเวอร์ชันแล้ว) และฟอนต์: ใช้ของในแคชก่อน
   - ข้อมูลบัญชี / Firestore: ไม่ผ่านแคชนี้เด็ดขาด */
const VERSION = 'bunny-ledger-v5';
const APP_FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/css/app.css',
  'assets/img/bunny-logo.svg', 'assets/img/app-icon.svg', 'assets/img/icon-192.png', 'assets/img/icon-512.png', 'assets/img/icon-180.png',
  'assets/js/util.js', 'assets/js/icons.js', 'assets/js/constants.js', 'assets/js/db.js', 'assets/js/calc.js', 'assets/js/summary.js',
  'assets/js/charts.js', 'assets/js/ui.js', 'assets/js/demo.js', 'assets/js/firebase-config.js', 'assets/js/filestore.js',
  'assets/js/importers/common.js', 'assets/js/importers/platforms.js', 'assets/js/connectors/api-stub.js',
  'assets/js/export-excel.js', 'assets/js/sync-firebase.js', 'assets/js/pwa.js',
  'assets/js/pages/dashboard.js', 'assets/js/pages/history.js', 'assets/js/pages/import.js', 'assets/js/pages/shops.js',
  'assets/js/pages/receivables.js', 'assets/js/pages/tracking.js', 'assets/js/pages/ledger.js', 'assets/js/pages/fees.js',
  'assets/js/pages/reports.js', 'assets/js/pages/account.js', 'assets/js/auth-gate.js', 'assets/js/pages/backup.js', 'assets/js/pages/settings.js',
  'assets/js/app.js',
];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];
const CACHE_FIRST_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP_FILES);
    // libraries: best effort (may be offline during install)
    await Promise.all(LIBS.map((u) => fetch(u, { mode: 'cors' }).then((r) => r.ok && c.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase SDK files (versioned) — cache first; everything else from Google APIs goes straight to the network
  const isFirebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (CACHE_FIRST_HOSTS.includes(url.hostname) || isFirebaseSdk) {
    e.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // never cache the user's own data files that might sit next to the app
  if (/\.(xlsx|xls|csv|json)$/i.test(url.pathname) && !url.pathname.endsWith('manifest.webmanifest')) return;
  e.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') c.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
    return Response.error();
  }
}
