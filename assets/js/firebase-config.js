/* Firebase config ของร้าน — ทุกเครื่อง/มือถือที่เปิดแอปจะใช้ config นี้อัตโนมัติ แล้วขึ้นหน้าเข้าสู่ระบบเอง
   (config นี้ไม่ใช่รหัสลับ เปิดเผยได้ ข้อมูลถูกป้องกันด้วยการเข้าสู่ระบบ + firestore.rules)
   เปลี่ยนโปรเจกต์: คัดลอกค่าจาก Firebase Console → Project settings → Your apps → Config มาแทน
   ปิดการเชื่อม Firebase: เปลี่ยนเป็น window.BUNNY_FIREBASE_CONFIG = null; */
window.BUNNY_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDHni7NCxamdowbmIENZI_b2YCnM5xCSUQ',
  authDomain: 'bunny-ledger.firebaseapp.com',
  projectId: 'bunny-ledger',
  storageBucket: 'bunny-ledger.firebasestorage.app',
  messagingSenderId: '276889763263',
  appId: '1:276889763263:web:df809533ef7983688a350a',
};
