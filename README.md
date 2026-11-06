# Ember & Oak — เว็บจองโต๊ะ

เว็บจองโต๊ะร้านอาหาร (HTML/CSS/JS) เก็บข้อมูลการจองลง **Google Sheets** ผ่าน Google Apps Script

```
index.html / styles.css / script.js   หน้าเว็บ
config.js                             ใส่ลิงก์ API ของ Google Apps Script
apps-script/Code.gs                   โค้ดฝั่ง Google Sheets (backend)
```

ถ้ายังไม่ได้ใส่ลิงก์ใน `config.js` เว็บจะทำงานแบบ **โหมดเดโม** เก็บการจองไว้ในเบราว์เซอร์เท่านั้น

## เชื่อม Google Sheets

### 1. สร้าง Google Sheet
1. เปิด https://sheets.new สร้างชีตใหม่ ตั้งชื่อเช่น `Ember & Oak Bookings`
2. เมนู **ส่วนขยาย (Extensions) → Apps Script**

### 2. วางโค้ด
1. ลบโค้ดเดิมใน `Code.gs` ทั้งหมด
2. คัดลอกเนื้อหาจากไฟล์ `apps-script/Code.gs` ในโปรเจกต์นี้ไปวาง แล้วกด 💾 บันทึก
3. (แนะนำ) ไปที่ ⚙️ **Project Settings** ตั้ง Time zone เป็น `(GMT+07:00) Bangkok`

### 3. Deploy เป็น Web app
1. กด **Deploy → New deployment**
2. กดรูปเฟือง ⚙️ ข้าง "Select type" → เลือก **Web app**
3. ตั้งค่า
   - **Execute as:** Me (อีเมลของคุณ)
   - **Who has access:** **Anyone**
4. กด **Deploy** → กด **Authorize access** → เลือกบัญชี Google
   - ถ้าขึ้นว่า "Google hasn't verified this app" ให้กด **Advanced → Go to ... (unsafe)** → **Allow**
     (เป็นสคริปต์ของคุณเอง จึงปลอดภัย)
5. คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

### 4. ใส่ลิงก์ในเว็บ
แก้ไฟล์ `config.js`

```js
window.BOOKING_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/xxxxxxxx/exec',
};
```

แล้ว commit + push → Render จะอัปเดตเว็บให้อัตโนมัติ

### 5. ทดสอบ
จองโต๊ะ 1 ครั้งบนเว็บ แล้วดูใน Google Sheet จะมีแท็บ **Bookings** เพิ่มขึ้นพร้อมข้อมูลการจอง

## การใช้งานฝั่งร้าน
- ทุกการจองจะเป็น 1 แถวในแท็บ `Bookings`
- ยกเลิกการจองแทนลูกค้า: แก้ช่อง **สถานะ** เป็น `ยกเลิก` โต๊ะจะว่างทันที
- ระบบกันจองโต๊ะเดียวกันซ้อนกันภายใน 2 ชั่วโมงให้อัตโนมัติ
- อย่าเปลี่ยนชื่อแท็บหรือลำดับคอลัมน์

## หมายเหตุ
- **ทุกครั้งที่แก้ `Code.gs`** ต้อง Deploy ใหม่: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
  (ลิงก์ `/exec` เดิมยังใช้ได้)
- ถ้าแก้โต๊ะใน `script.js` (`TABLES`) ต้องแก้ `TABLE_SEATS` ใน `Code.gs` ให้ตรงกันด้วย
- API ส่งกลับให้หน้าเว็บเฉพาะ "โต๊ะ + เวลา" ที่ถูกจอง ไม่เปิดเผยชื่อหรือเบอร์โทรลูกค้า
