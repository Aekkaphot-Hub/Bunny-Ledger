/* (ไม่บังคับ) ใส่ Firebase config ของร้านไว้ที่นี่ แล้วทุกเครื่อง/มือถือที่เปิดแอปจะใช้ config นี้อัตโนมัติ
   ไม่ต้องวางซ้ำในหน้า "ซิงก์ Firebase" ทีละเครื่อง — เหมาะเมื่ออัปแอปขึ้น Firebase Hosting

   วิธีใช้: คัดลอกค่าจาก Firebase Console → Project settings → Your apps มาแทน null เช่น
   window.BUNNY_FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "ชื่อโปรเจกต์.firebaseapp.com",
     projectId: "ชื่อโปรเจกต์",
     appId: "1:...:web:..."
   };
   (config นี้ไม่ใช่รหัสลับ ข้อมูลถูกป้องกันด้วยการเข้าสู่ระบบ + firestore.rules) */
window.BUNNY_FIREBASE_CONFIG = null;
