/* เตรียมไว้สำหรับเชื่อม API ของแพลตฟอร์ม (เฟสถัดไป)
   ทุก connector ต้องคืนค่ารูปแบบเดียวกับตัวนำเข้าไฟล์ ({records:[...] } แบบเดียวกับ A.importers.build)
   แล้วส่งต่อให้ A.importers.commit() — หน้าอื่นไม่ต้องแก้

   หมายเหตุ: API ของ Shopee / Lazada / TikTok Shop ต้องใช้ secret key และการเซ็นลายเซ็น (HMAC)
   ซึ่งห้ามเก็บไว้ในเบราว์เซอร์ → ให้ทำผ่านตัวกลาง เช่น Firebase Cloud Functions
   ที่ดึงข้อมูลแล้วเขียนลง Firestore (users/{uid}/orders) จากนั้นระบบซิงก์จะดึงลงมาเอง */
(function (A) {
  const notReady = (name) => async () => { throw new Error(`ยังไม่รองรับการเชื่อม API ของ ${name} — ตอนนี้ใช้การนำเข้าไฟล์ไปก่อน`); };
  A.connectors = {
    shopee: { name: 'Shopee Open Platform', ready: false, fetchOrders: notReady('Shopee'), fetchPayouts: notReady('Shopee'), docs: 'https://open.shopee.com' },
    lazada: { name: 'Lazada Open Platform', ready: false, fetchOrders: notReady('Lazada'), fetchPayouts: notReady('Lazada'), docs: 'https://open.lazada.com' },
    tiktok: { name: 'TikTok Shop Partner Center', ready: false, fetchOrders: notReady('TikTok'), fetchPayouts: notReady('TikTok'), docs: 'https://partner.tiktokshop.com' },
  };
})(window.App);
