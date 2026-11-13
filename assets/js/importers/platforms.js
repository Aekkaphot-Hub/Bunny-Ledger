/* พจนานุกรมชื่อคอลัมน์ของไฟล์จาก Seller Center (ไทย + อังกฤษ)
   ถ้าแพลตฟอร์มเปลี่ยนหัวคอลัมน์ ให้เพิ่มชื่อใหม่ในรายการ aliases ได้เลย */
(function (A) {
  const I = A.importers;

  /* kind: key | first | sum | concat | multi (หลายคอลัมน์ รวมค่าสัมบูรณ์)
     type: text | num | date | status */
  I.FIELDS = {
    orders: {
      orderNo: { label: 'เลขคำสั่งซื้อ', kind: 'key', type: 'text', required: true, aliases: ['หมายเลขคำสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'รหัสคำสั่งซื้อ', 'order id', 'order sn', 'ordersn', 'order number', 'order no', 'order no.', 'orderid', 'ordernumber'] },
      status: { label: 'สถานะ', kind: 'first', type: 'status', aliases: ['สถานะการสั่งซื้อ', 'สถานะคำสั่งซื้อ', 'order status', 'status', 'สถานะ'] },
      substatus: { label: 'สถานะย่อย', kind: 'first', type: 'status', aliases: ['order substatus', 'สถานะย่อยของคำสั่งซื้อ', 'สถานะย่อย'] },
      orderDate: { label: 'วันที่สั่งซื้อ', kind: 'first', type: 'date', aliases: ['วันที่ทำการสั่งซื้อ', 'เวลาที่ทำการสั่งซื้อ', 'วันที่สั่งซื้อ', 'เวลาที่สร้าง', 'เวลาสร้างคำสั่งซื้อ', 'order creation date', 'created time', 'created at', 'create time', 'createtime', 'order date', 'วันที่สร้าง', 'order created time'] },
      shipDate: { label: 'วันที่จัดส่ง', kind: 'first', type: 'date', aliases: ['เวลาส่งสินค้า', 'เวลาจัดส่ง', 'เวลาที่จัดส่ง', 'วันที่จัดส่ง', 'ship time', 'shipped time', 'shipped at', 'shipping date', 'shipped date', 'handover date', 'rts time'] },
      deliveredDate: { label: 'วันที่ลูกค้าได้รับ', kind: 'first', type: 'date', aliases: ['เวลาจัดส่งสำเร็จ', 'เวลาที่จัดส่งสำเร็จ', 'วันที่ได้รับสินค้า', 'วันที่ส่งสำเร็จ', 'delivered time', 'delivered at', 'delivery date', 'delivered date', 'deliverydate'] },
      completedDate: { label: 'วันที่คำสั่งซื้อสำเร็จ', kind: 'first', type: 'date', aliases: ['เวลาที่ทำการสั่งซื้อสำเร็จ', 'เวลาคำสั่งซื้อสำเร็จ', 'order complete time', 'completed time', 'order completed time'] },
      trackingNo: { label: 'เลขพัสดุ', kind: 'first', type: 'text', aliases: ['หมายเลขติดตามพัสดุ', 'เลขพัสดุ', 'tracking number', 'tracking no', 'tracking id', 'tracking code', 'trackingcode', 'หมายเลขพัสดุ'] },
      carrier: { label: 'บริษัทขนส่ง', kind: 'first', type: 'text', aliases: ['ตัวเลือกการจัดส่ง', 'บริษัทขนส่ง', 'ผู้ให้บริการขนส่ง', 'shipping option', 'shipping provider', 'shippingprovider', 'shipping provider name', 'delivery option', 'carrier'] },
      items: { label: 'ชื่อสินค้า', kind: 'concat', type: 'text', aliases: ['ชื่อสินค้า', 'product name', 'item name', 'itemname', 'product'] },
      sku: { label: 'SKU', kind: 'concat', type: 'text', aliases: ['เลขอ้างอิง sku (sku reference no.)', 'sku reference no.', 'เลขอ้างอิง sku', 'seller sku', 'sellersku', 'sku ของผู้ขาย', 'sku'] },
      qty: { label: 'จำนวนชิ้น', kind: 'sum', type: 'num', aliases: ['จำนวน', 'quantity', 'qty', 'จำนวนสินค้า'] },
      // ยอดขายของร้าน = ราคาสินค้า − ส่วนลดที่ร้านออกเอง (ส่วนลดที่แพลตฟอร์มออกให้ แพลตฟอร์มจ่ายคืนร้าน จึงไม่หัก)
      itemGross: { label: 'ราคาสินค้าก่อนส่วนลด (รวมทุกชิ้น)', kind: 'sum', type: 'num', aliases: ['sku subtotal before discount', 'ยอดรวมย่อย sku ก่อนส่วนลด', 'unit price', 'unitprice'] },
      sellerDiscount: { label: 'ส่วนลดที่ร้านออกเอง', kind: 'sum', type: 'num', aliases: ['sku seller discount', 'ส่วนลดจากผู้ขายของ sku', 'seller discount total', 'sellerdiscounttotal'] },
      itemSubtotal: { label: 'ยอดขายสุทธิต่อรายการ', kind: 'sum', type: 'num', aliases: ['ราคาขายสุทธิ', 'sku subtotal after discount', 'ยอดรวมย่อย sku หลังส่วนลด', 'paid price', 'paidprice', 'deal price'] },
      returnStatus: { label: 'สถานะคืนเงิน/คืนสินค้า', kind: 'first', type: 'text', aliases: ['สถานะการคืนเงินหรือคืนสินค้า', 'return / refund status', 'returnrefund status', 'cancelation/return type', 'cancellation/return type'] },
      orderRefund: { label: 'ยอดคืนเงินของออเดอร์', kind: 'first', type: 'num', aliases: ['order refund amount', 'ยอดเงินคืนของคำสั่งซื้อ'] },
      itemRefund: { label: 'ยอดคืนเงินรายชิ้น', kind: 'sum', type: 'num', aliases: ['refundamount', 'refund amount'] },
      grossSales: { label: 'ยอดที่ลูกค้าจ่ายทั้งออเดอร์', kind: 'first', type: 'num', aliases: ['ยอดคำสั่งซื้อทั้งหมด', 'ยอดรวมทั้งหมด', 'จำนวนเงินทั้งหมด', 'ยอดรวมคำสั่งซื้อ', 'ยอดชำระทั้งหมด', 'จำนวนเงินคำสั่งซื้อ', 'order amount', 'total amount', 'grand total', 'order total'] },
      shippingFeeBuyer: { label: 'ค่าส่งที่ลูกค้าจ่าย', kind: 'first', type: 'num', aliases: ['ค่าจัดส่งที่ชำระโดยผู้ซื้อ', 'ค่าจัดส่งที่ผู้ซื้อชำระ', 'ค่าจัดส่งหลังส่วนลด', 'buyer paid shipping fee', 'shipping fee after discount', 'shipping fee', 'shippingfee'] },
      feesTotal: { label: 'ค่าธรรมเนียมรวม', kind: 'first', type: 'num', aliases: ['ค่าธรรมเนียมทั้งหมด', 'total fees', 'total fee'] },
      fees: { label: 'ค่าธรรมเนียม (แยกหลายคอลัมน์)', kind: 'multi', type: 'num', aliases: ['ค่าคอมมิชชั่น', 'ค่าคอมมิชชัน', 'commission fee', 'ค่าธรรมเนียมบริการ', 'ค่าบริการ', 'service fee', 'ค่าธรรมเนียมการชำระเงิน', 'ค่าธรรมเนียมธุรกรรม', 'transaction fee', 'payment fee', 'platform commission fee', 'ค่าคอมมิชชั่นแพลตฟอร์ม'] },
      expectedPayout: { label: 'ยอดที่คาดว่าจะได้รับ', kind: 'first', type: 'num', aliases: ['จำนวนเงินที่คาดว่าจะได้รับ', 'รายได้ที่คาดว่าจะได้รับ', 'escrow amount', 'estimated payout', 'estimated settlement amount'] },
    },
    income: {
      orderNo: { label: 'เลขคำสั่งซื้อ', kind: 'key', type: 'text', required: true, aliases: ['หมายเลขคำสั่งซื้อ', 'เลขที่คำสั่งซื้อ', 'หมายเลขคำสั่งซื้อ/การปรับ', 'หมายเลขคำสั่งซื้อ/การปรับยอด', 'order id', 'order sn', 'order number', 'order no.', 'order no', 'ordernumber', 'order/adjustment id', 'รหัสคำสั่งซื้อ/การปรับปรุง', 'รหัสคำสั่งซื้อ'] },
      rowType: { label: 'ประเภทรายการ', kind: 'first', type: 'text', aliases: ['type', 'ประเภท', 'ประเภทรายการ', 'ประเภทธุรกรรม'] },
      // Lazada: ใช้ "วันที่ปรับปรุงเข้ายอดของฉัน" (วันที่เงินเข้ายอดร้านจริง) ก่อน "วันที่ทำรายการ"
      payoutDate: { label: 'วันที่เงินเข้า', kind: 'first', type: 'date', aliases: ['วันที่โอนชำระเงินสำเร็จ', 'วันที่โอนเงินสำเร็จ', 'วันที่โอนเงิน', 'วันที่ได้รับเงิน', 'วันที่ปรับปรุงเข้ายอดของฉัน', 'เวลาที่ชำระคำสั่งซื้อ', 'payout completed date', 'payout date', 'order settled time', 'settled time', 'settlement time', 'เวลาชำระบัญชี', 'release date', 'transaction date', 'วันที่ทำรายการ', 'statement date'] },
      actualPayout: { label: 'ยอดเงินที่ได้รับ (สุทธิ)', kind: 'sum', type: 'num', aliases: ['จำนวนเงินทั้งหมดที่โอนแล้ว', 'จำนวนเงินที่โอนแล้ว', 'จำนวนเงินที่โอน', 'ยอดเงินที่ได้รับ', 'ยอดการชำระเงินทั้งหมด', 'total released amount', 'released amount', 'total settlement amount', 'settlement amount', 'ยอดชำระทั้งหมด', 'ยอดเงินที่ชำระทั้งหมด', 'payout amount', 'รายได้สุทธิ'] },
      amount: { label: 'จำนวนเงิน (รายบรรทัด)', kind: 'sum', type: 'num', aliases: ['amount', 'amount(include vat)', 'amount (include vat)', 'จำนวนเงิน(รวมภาษี)', 'จำนวนเงิน (รวมภาษี)', 'จำนวนเงิน', 'ยอดเงิน'] },
      feeName: { label: 'ชื่อรายการเงิน', kind: 'first', type: 'text', aliases: ['fee name', 'feename', 'transaction type', 'ชื่อรายการธุรกรรม', 'ชื่อค่าธรรมเนียม'] },
      paidStatus: { label: 'สถานะการจ่าย', kind: 'first', type: 'text', aliases: ['paid status', 'paidstatus', 'สถานะการโอนเงิน', 'สถานะการจ่าย', 'สถานะการชำระ'] },
      grossSales: { label: 'ยอดขาย', kind: 'first', type: 'num', aliases: ['ราคาสินค้า', 'ยอดขายสินค้า', 'ราคาสินค้าเดิม', 'ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย', 'subtotal after seller discounts', 'product price', 'original price', 'total revenue', 'รายได้ทั้งหมด'] },
      // Shopee (ไฟล์รายได้): ยอดขาย = สินค้าราคาปกติ − ส่วนลดสินค้าจากผู้ขาย − เงินที่คืนผู้ซื้อ (ตรงกับหน้า Summary ของ Shopee)
      itemGross: { label: 'ราคาสินค้าก่อนส่วนลดร้าน', kind: 'first', type: 'num', aliases: ['สินค้าราคาปกติ'] },
      sellerDiscount: { label: 'ส่วนลดสินค้าจากร้าน', kind: 'first', type: 'num', aliases: ['ส่วนลดสินค้าจากผู้ขาย'] },
      refund: { label: 'ยอดคืนเงินให้ลูกค้า', kind: 'first', type: 'num', aliases: ['ยอดรวมเงินคืนหลังหักส่วนลดจากผู้ขาย', 'refund subtotal after seller discounts', 'จำนวนเงินที่ทำการคืนให้ผู้ซื้อ'] },
      feesTotal: { label: 'ค่าธรรมเนียมรวม', kind: 'first', type: 'num', aliases: ['ค่าธรรมเนียมทั้งหมด', 'total fees', 'total fee'] },
      fees: { label: 'ค่าธรรมเนียม (แยกหลายคอลัมน์)', kind: 'multi', type: 'num', aliases: ['ค่าคอมมิชชั่น', 'ค่าคอมมิชชัน', 'commission fee', 'ค่าธรรมเนียมบริการ', 'ค่าบริการ', 'service fee', 'ค่าธรรมเนียมการชำระเงิน', 'ค่าธรรมเนียมธุรกรรม', 'transaction fee', 'payment fee', 'platform commission fee', 'affiliate commission', 'ค่าคอมมิชชั่นแพลตฟอร์ม'] },
      orderDate: { label: 'วันที่สั่งซื้อ', kind: 'first', type: 'date', aliases: ['วันที่ทำการสั่งซื้อ', 'เวลาที่สร้างคำสั่งซื้อ', 'วันที่สร้างคำสั่งซื้อ', 'order creation date', 'order created time', 'created time', 'เวลาที่สร้าง'] },
      payoutRef: { label: 'เลขอ้างอิงการโอน', kind: 'first', type: 'text', aliases: ['หมายเลขอ้างอิงการโอน', 'รหัสรอบบิล', 'payout id', 'statement', 'statement number', 'settlement id'] },
    },
  };

  /* คอลัมน์ข้อมูลส่วนตัวของลูกค้า (ชื่อ ที่อยู่ เบอร์โทร อีเมล เลขผู้เสียภาษี ข้อความ ฯลฯ)
     → ถูกล้างทิ้งทันทีหลังอ่านไฟล์ ไม่เข้าโปรแกรม ไม่ถูกบันทึก ไม่ขึ้นคลาวด์ ไม่ออกไปกับไฟล์ Excel
     เทียบกับชื่อหัวคอลัมน์ที่ตัดช่องว่าง/วงเล็บ/ขีดออกแล้ว (I.norm) */
  I.PII = [
    /^customer/, /^shipping(name|address|phone|city|postcode|country|region)/, /^billing/, /nationalregistration/, /^taxcode$/, /^branchnumber$/,
    /taxinfo/, /taxid/, /buyerfaileddelivery(username|detail)/, /^recipient/, /phone/, /address/, /zipcode/, /postcode/, /^province$/, /^districts?$/,
    /email/, /buyerusername/, /buyermessage/, /sellernote/, /creatorhandle/, /^username/,
    /ชื่อผู้รับ/, /ชื่อผู้ใช้ผู้ซื้อ/, /โทรศัพท์/, /เบอร์/, /ที่อยู่/, /รหัสไปรษณีย์/, /^จังหวัด$/, /^เขต/, /^อำเภอ/, /^ตำบล/, /หมายเหตุจากผู้ซื้อ/, /^บันทึก$/,
    /ชื่อในบัญชี/, /บัญชีธนาคาร/, /ธนาคารของลูกค้า/, /เลขประจำตัวผู้เสียภาษี/, /ชื่อลูกค้า/, /อีเมล/,
  ];
  I.isPII = (header) => { const h = I.norm(header); return !!h && I.PII.some((re) => re.test(h)); };

  /* ลายเซ็นหัวคอลัมน์ ใช้เดาว่าไฟล์มาจากแพลตฟอร์มไหน */
  I.PLATFORM_HINTS = {
    shopee: {
      files: ['shopee', 'ช้อปปี้', 'order.all', 'income.', 'my_income', 'my income'],
      headers: ['สถานะการสั่งซื้อ', 'ตัวเลือกการจัดส่ง', 'เลขอ้างอิง sku (sku reference no.)', 'ชื่อผู้ใช้ (ผู้ซื้อ)', 'username (buyer)', 'order sn', 'วันที่โอนชำระเงินสำเร็จ',
        'จำนวนเงินทั้งหมดที่โอนแล้ว', 'total released amount', 'payout completed date', 'เวลาส่งสินค้า', 'เวลาที่ทำการสั่งซื้อสำเร็จ', 'ราคาขายสุทธิ', 'ค่าจัดส่งที่ชำระโดยผู้ซื้อ', 'shopee'],
    },
    lazada: {
      files: ['lazada', 'ลาซาด้า', 'statement', 'transaction_'],
      headers: ['order item id', 'orderitemid', 'seller sku', 'sellersku', 'paid price', 'paidprice', 'wallet credit', 'lazada id', 'fee name', 'paid status', 'order item no.',
        'trackingcode', 'shippingprovider', 'createtime', 'ordernumber', 'lazada sku', 'transaction number',
        'รหัสรอบบิล', 'ชื่อรายการธุรกรรม', 'สถานะการโอนเงิน', 'วันที่ปรับปรุงเข้ายอดของฉัน', 'รหัสสินค้าในคำสั่งซื้อ', 'wht amount', 'ระยะเวลาใบแจ้งยอด'],
    },
    tiktok: {
      files: ['tiktok', 'tik tok', 'ติ๊กต็อก', 'settlement', 'tts'],
      headers: ['order substatus', 'สถานะย่อยของคำสั่งซื้อ', 'sku subtotal after discount', 'buyer username', 'tracking id', 'cancel by', 'order/adjustment id', 'รหัสคำสั่งซื้อ/การปรับปรุง',
        'total settlement amount', 'order settled time', 'total revenue', 'shipping provider name', 'shipping fee after discount', 'platform commission fee',
        'หมายเลขคำสั่งซื้อ/การปรับ', 'ยอดการชำระเงินทั้งหมด', 'เวลาที่ชำระคำสั่งซื้อ', 'ค่าคอมมิชชั่น tiktok shop', 'ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย', 'ค่าธรรมเนียมการบริการ sfp'],
    },
  };
})(window.App);
