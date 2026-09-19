const { pgTable, serial, text, jsonb, timestamp, integer, boolean } = require('drizzle-orm/pg-core');

// NOTE: The primary key column is `id` in Postgres but exposed as `_id` in the
// JS object so API responses keep the same shape the frontend expects (Mongo `_id`).

const users = pgTable('users', {
  _id: serial('id').primaryKey(),
  username: text('username').notNull(),
  password: text('password').notNull(),
  email: text('email'),
  tel: text('tel'),
  position: text('position').notNull(),
  role_id: integer('role_id'),
  createDate: timestamp('create_date').notNull(),
  updateDate: timestamp('update_date').notNull(),
});

// Dynamic RBAC: roles ที่สร้าง/แก้เองได้ + รายการสิทธิ์ (permission keys) เก็บเป็น jsonb
const roles = pgTable('roles', {
  _id: serial('id').primaryKey(),
  name: text('name').notNull(),
  permissions: jsonb('permissions').notNull(),
  is_system: boolean('is_system').default(false),
  updateDate: timestamp('update_date').notNull(),
});

const masterBrand = pgTable('master_brand', {
  _id: serial('id').primaryKey(),
  brand_name: text('brand_name').notNull(),
  brand_description: text('brand_description'),
  brand_image: text('brand_image'),
  sort_order: integer('sort_order').default(0),
  updateDate: timestamp('update_date').notNull(),
});

const masterModel = pgTable('master_model', {
  _id: serial('id').primaryKey(),
  model_name: text('model_name').notNull(),
  brand_name: text('brand_name').notNull(),
  model_submodel: jsonb('model_submodel'),
  model_description: text('model_description'),
  model_image: jsonb('model_image'),
  updateDate: timestamp('update_date').notNull(),
});

const carDataDetail = pgTable('car_data_detail', {
  _id: serial('id').primaryKey(),
  cardt_title: text('cardt_title').notNull(),
  cardt_type: text('cardt_type').notNull(),
  cardt_description: text('cardt_description'),
  updateDate: timestamp('update_date').notNull(),
});

const carStore = pgTable('car_store', {
  _id: serial('id').primaryKey(),
  cars_title: text('cars_title').notNull(),
  brand_name: text('brand_name').notNull(),
  model_name: text('model_name').notNull(),
  cars_image_default: text('cars_image_default'),
  cars_image: jsonb('cars_image'),
  cars_video: jsonb('cars_video'),   // [{ url, name, size, uploadedAt }] — อัปโหลดตรงจาก browser เข้า Blob
  cars_detail: jsonb('cars_detail').notNull(),
  cars_subdetail: jsonb('cars_subdetail'),
  cars_description: text('cars_description'),
  // SELL = พร้อมขาย | RESERVE = จอง | SOLD = ขายแล้ว | INTAKE = รับเข้ามาแล้วยังไม่พร้อมขาย (ไม่โชว์หน้าเว็บ)
  cars_status: text('cars_status').notNull(),
  cars_tag: text('cars_tag'),
  license_plate: text('license_plate'),   // ทะเบียนรถ (ข้อมูลภายใน ไม่โชว์สาธารณะ)
  import_date: timestamp('import_date'),  // วันที่รถเข้าเต๊นท์ (admin กรอกเอง)
  // ── ข้อมูลรับรถเข้า (ตามสมุดจด "รับรถเข้า" + เอกสารสต๊อกสิ้นเดือน) ทั้งหมดเป็นข้อมูลภายใน ──
  intake_no: text('intake_no'),               // ลำดับคัน เช่น "31/72(69)"
  branch: text('branch'),                     // สาขาที่จอด: หนองฉาง | บ้านไร่
  plate_province: text('plate_province'),     // จังหวัดทะเบียน เช่น กำแพงเพชร
  registration_date: timestamp('registration_date'), // วันจดทะเบียน
  act_expiry: timestamp('act_expiry'),        // วันหมดอายุ พรบ./บัตร ("บัตรขาด")
  engine_no: text('engine_no'),               // เลขเครื่อง
  chassis_no: text('chassis_no'),             // เลขตัวถัง (VIN)
  prev_owner_name: text('prev_owner_name'),   // ชื่อเจ้าของเดิมในเล่ม
  prev_owner_address: text('prev_owner_address'), // ที่อยู่เจ้าของเดิม
  prev_owner_id_card: text('prev_owner_id_card'), // เลขบัตร ปชช. เจ้าของเดิม
  finance_quotes: text('finance_quotes'),     // ยอดจัดที่ประเมินได้ เช่น "TTB 270,000 / ทิสโก้ 290,000" หรือ "จัดไม่ได้"
  equipment: text('equipment'),               // อุปกรณ์ติดรถ/ของแถม เช่น "ยางใหม่ 3, กุญแจสำรอง, เบาะ 2"
  // ── ข้อมูลธุรกิจ (ภายใน) ──
  cost_price: integer('cost_price'),      // ราคาทุน (ลับ — เฉพาะสิทธิ์ cars.cost)
  sale_price: integer('sale_price'),      // ราคาขาย (ใช้คำนวณกำไร/รายงาน)
  tax_status: text('tax_status'),         // สถานะภาษี เช่น active/expired/none
  tax_expiry: timestamp('tax_expiry'),    // วันสิ้นอายุภาษี
  repair_notes: text('repair_notes'),     // โน้ตการซ่อมเชิงลึก (ภายใน)
  updateDate: timestamp('update_date').notNull(),
  createDate: timestamp('create_date'),
  bookingDate: timestamp('booking_date'),
  soldDate: timestamp('sold_date'),
});

// Singleton row holding the public "contact / dealer" config (branches, socials, line QR).
// Stored as one jsonb blob so the shape can evolve without migrations.
const contactInfo = pgTable('contact_info', {
  _id: serial('id').primaryKey(),
  data: jsonb('data').notNull(),
  updateDate: timestamp('update_date').notNull(),
});

// เอกสารแนบต่อรถ (เก็บไฟล์ใน Vercel Blob แบบ private)
const documents = pgTable('documents', {
  _id: serial('id').primaryKey(),
  car_id: integer('car_id').notNull(),
  doc_type: text('doc_type').notNull(),   // tax | insurance | contract | receipt | other
  file_name: text('file_name'),           // ชื่อไฟล์ต้นฉบับ
  blob_url: text('blob_url').notNull(),    // private blob url
  uploaded_by: integer('uploaded_by'),
  createDate: timestamp('create_date').notNull(),
});

// CRM: ข้อมูลลูกค้า + วันครบกำหนดไว้แจ้งเตือน (in-app alert)
const customers = pgTable('customers', {
  _id: serial('id').primaryKey(),
  name: text('name').notNull(),
  tel: text('tel'),
  tel2: text('tel2'),                              // เบอร์สำรอง (สมุดจดมีหลายเบอร์ต่อคน)
  email: text('email'),
  id_card: text('id_card'),                        // เลขบัตรประชาชน
  // ที่อยู่แยกส่วนตามสมุดจด: "33 ม.7 ต.นาแวง อ.บ้านดุง จ.อุดรธานี"
  addr_no: text('addr_no'),                        // บ้านเลขที่
  addr_moo: text('addr_moo'),                      // หมู่
  addr_tambon: text('addr_tambon'),                // ตำบล
  addr_amphoe: text('addr_amphoe'),                // อำเภอ
  addr_province: text('addr_province'),            // จังหวัด
  addr_zipcode: text('addr_zipcode'),              // รหัสไปรษณีย์
  note: text('note'),
  car_id: integer('car_id'),                       // รถที่ซื้อ/เกี่ยวข้อง (ถ้ามี)
  insurance_expiry: timestamp('insurance_expiry'), // ประกันหมดอายุ
  next_service_date: timestamp('next_service_date'), // นัดเช็คระยะครั้งถัดไป
  status: text('status'),                          // lead: interested | negotiating | closed (ว่าง = ลูกค้าทั่วไป)
  source: text('source'),                          // ที่มา เช่น website | walkin | manual
  createDate: timestamp('create_date').notNull(),
  updateDate: timestamp('update_date').notNull(),
});

// บันทึกการขาย (ผูกลูกค้า + รถ)
const sales = pgTable('sales', {
  _id: serial('id').primaryKey(),
  car_id: integer('car_id').notNull(),
  customer_id: integer('customer_id'),              // ผูกลูกค้าเดิมใน CRM (ถ้ามี — ไม่บังคับ)
  customer_name: text('customer_name'),             // กรอกชื่อลูกค้าตรงนี้ได้เลย (ไม่ต้องมีใน CRM)
  customer_tel: text('customer_tel'),               // เบอร์ติดต่อลูกค้า
  customer_address: text('customer_address'),        // ที่อยู่ลูกค้า
  sale_date: timestamp('sale_date').notNull(),
  sale_price: integer('sale_price'),
  deposit: integer('deposit'),                      // เงินจอง (จ่ายก่อนวันโอน)
  down_payment: integer('down_payment'),
  finance_amount: integer('finance_amount'),
  payment_type: text('payment_type'),               // cash (ซื้อสด) | bank (จัดไฟแนนซ์/ธนาคาร)
  installment_amount: integer('installment_amount'), // ค่างวดต่อเดือน
  installment_months: integer('installment_months'), // จำนวนงวด (เดือน)
  advance_installments: integer('advance_installments'), // จำนวนงวดที่หักล่วงหน้า (ตามสัญญา)
  first_installment_date: timestamp('first_installment_date'), // วันเริ่มผ่อนงวดแรก ("เริ่ม 1/9/69")
  // ฟิลด์ต่อไปนี้มาจากที่ผู้ใช้จริงเขียนยัดไว้ในช่องหมายเหตุ
  finance_bank: text('finance_bank'),               // ธนาคาร/ไฟแนนซ์ที่จัด ("จัด TTB", "จัดทิสโก้")
  contract_no: text('contract_no'),                 // เลขที่สัญญา (สมุดจด: 030-1497)
  outstanding_down: integer('outstanding_down'),    // ค้างดาวน์/ลูกหนี้ ("ค้างดาวน์ 27,000")
  insurance_type: text('insurance_type'),           // ป.1 | ป.2 | ป.3 | พรบ | none
  insurance_cost: integer('insurance_cost'),        // ค่าประกัน ("ป1 22255")
  trade_in: text('trade_in'),                       // รถตีเทิน ("มีรถตีเทิน ซูซูกิ ciaz")
  trade_in_value: integer('trade_in_value'),        // มูลค่าที่ตีเทิน
  transfer_date: timestamp('transfer_date'),         // วันที่โอนเล่ม
  note: text('note'),
  created_by: integer('created_by'),
  updateDate: timestamp('update_date'),              // แก้ไขล่าสุด (รองรับปุ่มแก้ไข)
  createDate: timestamp('create_date').notNull(),
});

// ค่าใช้จ่าย/ต้นทุนซ่อมต่อคัน (รายการ)
const expenses = pgTable('expenses', {
  _id: serial('id').primaryKey(),
  car_id: integer('car_id').notNull(),
  title: text('title').notNull(),
  amount: integer('amount').notNull(),
  expense_date: timestamp('expense_date'),
  note: text('note'),
  createDate: timestamp('create_date').notNull(),
});

// สรุปสต๊อกรายเดือน — ให้คีทับเองได้เมื่อข้อมูลอัตโนมัติไม่ครบ
// (รถเก่าหลายคันไม่มีวันที่รถเข้า/วันที่ขาย ระบบจึงคำนวณย้อนหลังได้ไม่ครบ)
const stockMonths = pgTable('stock_months', {
  _id: serial('id').primaryKey(),
  month: text('month').notNull(),              // 'YYYY-MM'
  opening_override: integer('opening_override'), // ยอดยกมาที่คีเอง (ว่าง = ใช้ค่าที่ระบบคำนวณ)
  in_override: integer('in_override'),           // ซื้อเข้าที่คีเอง
  out_override: integer('out_override'),         // ตัดสต๊อก/ขายออกที่คีเอง
  note: text('note'),
  updated_by: integer('updated_by'),
  updateDate: timestamp('update_date').notNull(),
});

module.exports = { users, roles, masterBrand, masterModel, carDataDetail, carStore, contactInfo, documents, customers, sales, expenses, stockMonths };
