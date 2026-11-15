/* ค่าคงที่: แพลตฟอร์ม สถานะออเดอร์ ค่าตั้งต้น เมนู */
(function (A) {
  A.PLATFORMS = {
    shopee: { key: 'shopee', name: 'Shopee', color: '#F5A97F', deep: '#C46A3A', letter: 'S' },
    lazada: { key: 'lazada', name: 'Lazada', color: '#9A8CF0', deep: '#6A5BD0', letter: 'L' },
    tiktok: { key: 'tiktok', name: 'TikTok', color: '#3E4157', deep: '#3E4157', letter: 'T' },
  };
  A.PF_KEYS = Object.keys(A.PLATFORMS);

  A.STATUS = {
    pending_ship: { label: 'รอจัดส่ง', color: '#FBE3A7' },
    shipped: { label: 'กำลังจัดส่ง', color: '#9CCBF0' },
    delivered: { label: 'ส่งถึงแล้ว', color: '#A8DCC9' },
    completed: { label: 'สำเร็จ', color: '#7CC4A8' },
    cancelled: { label: 'ยกเลิก', color: '#D5D6E0' },
    returned: { label: 'คืนสินค้า/คืนเงิน', color: '#F2A7A7' },
  };
  A.isVoid = (st) => st === 'cancelled' || st === 'returned';

  // order matters: first match wins
  const RULES = [
    ['cancelled', ['ยกเลิก', 'cancel', 'canceled', 'cancelled', 'unpaid cancel']],
    ['returned', ['คืนเงิน', 'คืนสินค้า', 'ส่งคืน', 'return', 'refund', 'failed delivery', 'จัดส่งไม่สำเร็จ', 'ตีกลับ', 'lost', 'damaged']],
    ['completed', ['สำเร็จแล้ว', 'completed', 'complete', 'เสร็จสมบูรณ์', 'คำสั่งซื้อสำเร็จ', 'confirmed']],
    ['delivered', ['จัดส่งสำเร็จ', 'ส่งสำเร็จ', 'ได้รับสินค้าแล้ว', 'ได้รับแล้ว', 'delivered', 'ส่งถึงแล้ว', 'จัดส่งถึงแล้ว']],
    ['pending_ship', ['ที่ต้องจัดส่ง', 'รอจัดส่ง', 'รอการจัดส่ง', 'ยังไม่ได้จัดส่ง', 'to ship', 'to_ship', 'awaiting', 'pending', 'ready_to_ship', 'ready to ship',
      'unpaid', 'ยังไม่ชำระ', 'ยังไม่ได้ชำระ', 'รอชำระ', 'รอการชำระ', 'พร้อมจัดส่ง', 'รอดำเนินการ', 'รอรับพัสดุ', 'รอการรับ', 'รอการเรียกรับ', 'รอเข้ารับ',
      'packed', 'processing', 'แพ็ก', 'unshipped', 'on hold', 'ระงับไว้']],
    ['shipped', ['กำลังจัดส่ง', 'จัดส่งแล้ว', 'ระหว่างจัดส่ง', 'อยู่ระหว่างขนส่ง', 'กำลังขนส่ง', 'shipped', 'shipping', 'in transit', 'in_transit', 'out for delivery', 'handed over', 'การจัดส่ง', 'ขนส่ง']],
  ];
  A.normalizeStatus = (raw) => {
    if (raw == null) return null;
    const s = String(raw).toLowerCase().trim();
    if (!s) return null;
    for (const [st, words] of RULES) if (words.some((w) => s.includes(w))) return st;
    return null;
  };

  A.DEFAULT_SETTINGS = {
    id: 'main',
    shopName: 'ร้านของฉัน',
    payoutDays: { shopee: 7, lazada: 14, tiktok: 14 }, // วันหลังส่งถึง ที่ควรได้เงิน
    deliveryDays: 5, // ส่งแล้วกี่วันควรถึงมือลูกค้า
    shipLateDays: 2, // สั่งแล้วกี่วันควรจัดส่ง
    payoutTolerance: 1, // ยอมให้ยอดโอนต่างได้กี่บาท
    maxFeePct: 0.4, // ถูกหักเกินกี่ % ถือว่าผิดปกติ (ร้านทั่วไปโดนหักราว 25–32% รวมค่าส่ง)
    feeRate: { shopee: 0.12, lazada: 0.1, tiktok: 0.08 }, // ประมาณค่าธรรมเนียม ถ้าไฟล์ไม่มีข้อมูล
    expenseCategories: ['ต้นทุนสินค้า', 'ค่าแพ็กของ', 'ค่าโฆษณา', 'ค่าขนส่ง', 'ค่าเช่า/ค่าน้ำไฟ', 'ค่าจ้าง', 'อื่นๆ'],
    incomeCategories: ['ขายหน้าร้าน', 'โอนตรง', 'ดอกเบี้ย/อื่นๆ'],
    shops: [],
    // ภาษีมูลค่าเพิ่ม: ต้องจด VAT ภายใน 30 วันเมื่อรายรับเกิน 1.8 ล้านบาท/ปี • อัตรา 7% (ขยายถึง 30 ก.ย. 2570)
    // ต้นทุนสินค้า: onReturn = นับต้นทุนของออเดอร์ที่คืนสินค้า/คืนเงินด้วย (ปกติของกลับเข้าสต็อก จึงไม่นับ)
    cost: { onReturn: false },
    // ภาษีเงินได้ + ปฏิทินภาษี (done = รายการที่กดว่ายื่นแล้ว)
    tax: { otherAllowance: 0, socialSecurity: 0, withheld: 0, paid94: null, done: {} },
    // ข้อมูลผู้ขายบนใบกำกับภาษี
    invoice: { sellerName: '', taxId: '', branch: 'สำนักงานใหญ่', address: '', phone: '', abbPrefix: 'ABB', fullPrefix: 'INV' },
    vat: { registered: false, since: '', rate: 0.07, threshold: 1800000, priceIncludesVat: true, countOtherIncome: true, feesHaveInvoice: true, efiling: true },
  };

  A.MENU = [
    { key: 'daily', title: 'งานประจำวัน', tone: 'pink', items: [
      { id: 'dashboard', icon: 'home', label: 'หน้าหลัก', desc: 'ภาพรวมวันนี้' },
      { id: 'history', icon: 'calendar', label: 'ย้อนหลัง & สรุปยอด', desc: 'ดูยอดรายวัน สัปดาห์ เดือน' },
      { id: 'import', icon: 'import', label: 'นำเข้าข้อมูล', desc: 'ลากไฟล์จาก Seller Center' },
      { id: 'shops', icon: 'store', label: 'ร้านค้าของฉัน', desc: 'ร้านและการเชื่อมต่อ' },
    ] },
    { key: 'income', title: 'รายรับ', tone: 'blue', items: [
      { id: 'receivables', icon: 'moneybag', label: '1. ลูกหนี้แพลตฟอร์ม', desc: 'เงินที่ยังไม่โอนเข้า', badge: 'receivables' },
      { id: 'tracking', icon: 'parcel', label: '2. ติดตามออเดอร์', desc: 'พัสดุถึงมือลูกค้าหรือยัง', badge: 'tracking' },
      { id: 'claims', icon: 'alert', label: '3. ออเดอร์มีปัญหา & เคลม', desc: 'ค่าส่งเกิน ตีกลับ ติดตามเงินคืน', badge: 'claims' },
      { id: 'bank', icon: 'bank', label: '4. เงินเข้าบัญชีธนาคาร', desc: 'เช็กว่าเงินถึงบัญชีจริง', badge: 'bank' },
      { id: 'income', icon: 'plusCoin', label: 'รายรับอื่นๆ', desc: 'รายได้นอกแพลตฟอร์ม' },
    ] },
    { key: 'expense', title: 'รายจ่าย', tone: 'pink', items: [
      { id: 'costs', icon: 'box', label: 'ต้นทุน & กำไรจริง', desc: 'ต้นทุนสินค้า กำไรต่อออเดอร์' },
      { id: 'expenses', icon: 'receipt', label: 'บันทึกรายจ่าย', desc: 'ค่าของ ค่าแพ็ก ค่าแอด' },
      { id: 'fees', icon: 'tag', label: 'ค่าธรรมเนียมแพลตฟอร์ม', desc: 'ค่าคอมที่ถูกหัก' },
    ] },
    { key: 'tools', title: 'เครื่องมือ', tone: 'mint', items: [
      { id: 'verify', icon: 'search', label: 'อ้างอิงข้อมูล', desc: 'เทียบยอดกับไฟล์จริง' },
      { id: 'vat', icon: 'percent', label: 'คำนวณภาษี VAT', desc: 'เกณฑ์ 1.8 ล้าน & ภาษีรายเดือน' },
      { id: 'incometax', icon: 'wallet', label: 'ประมาณภาษีเงินได้', desc: 'ภ.ง.ด.94 / 90 เหมา 60% หรือจริง' },
      { id: 'taxcal', icon: 'clock', label: 'ปฏิทินภาษี', desc: 'วันยื่นภาษี & แจ้งเตือน', badge: 'taxcal' },
    ] },
    { key: 'docs', title: 'เอกสาร', tone: 'blue', items: [
      { id: 'reports', icon: 'pie', label: 'รายงาน & Excel', desc: 'สรุปเป็นไฟล์ Excel' },
      { id: 'invoices', icon: 'file', label: 'ใบกำกับภาษี', desc: 'อย่างย่อ / เต็มรูป + รายงานภาษีขาย' },
      { id: 'backup', icon: 'archive', label: 'ไฟล์ข้อมูล & สำรอง', desc: 'บันทึกลงไฟล์บนคอมอัตโนมัติ' },
      { id: 'settings', icon: 'gear', label: 'ตั้งค่า', desc: 'ปรับร้านและการแจ้งเตือน' },
    ] },
  ];
})(window.App);
