const r2 = require('../lib/r2');
const createError = require('http-errors');
const crypto = require('crypto');
const sharp = require('sharp');
const { eq, desc, notInArray } = require('drizzle-orm');
const { db, schema } = require('../database/db');

const carStore = schema.carStore;

// สถานะที่ "ไม่" ให้โผล่หน้าเว็บสาธารณะ
// SOLD  = ขายแล้ว (ลูกค้าไม่ต้องเห็นในรายการขาย)
// INTAKE = เพิ่งรับเข้ามา ยังไม่พร้อมปล่อยขาย
const HIDDEN_PUBLIC_STATUS = ['SOLD', 'INTAKE'];

// ฟิลด์ภายในที่ห้ามหลุดออก public API (ข้อมูลรับรถเข้า/เจ้าของเดิม/ต้นทุน)
const INTERNAL_ONLY_FIELDS = [
  'license_plate', 'intake_no', 'branch', 'plate_province', 'registration_date', 'act_expiry',
  'engine_no', 'chassis_no', 'prev_owner_name', 'prev_owner_address', 'prev_owner_id_card',
  'finance_quotes', 'equipment',
];

// ตัดฟิลด์ภายในออกตามสิทธิ์:
// - public (ไม่ล็อกอิน): ตัด cost/sale/repair/tax ออกหมด
// - staff ที่ไม่มีสิทธิ์ cars.cost: ตัดราคาทุน + กำไร (เห็นราคาขาย/ซ่อม/ภาษีได้)
// - มีสิทธิ์ cars.cost: เห็นครบ + คำนวณกำไร
function serializeCar(car, req) {
  const c = { ...car };
  const loggedIn = !!(req && req.user);
  const canCost = !!(req && req.user && Array.isArray(req.user.permissions) && req.user.permissions.includes('cars.cost'));
  if (!loggedIn) {
    delete c.cost_price; delete c.sale_price; delete c.repair_notes; delete c.tax_status; delete c.tax_expiry;
    // ข้อมูลภายใน (ทะเบียน/เลขเครื่อง/เจ้าของเดิม/ยอดจัด ฯลฯ) ห้ามหลุดหน้าเว็บสาธารณะ
    for (const f of INTERNAL_ONLY_FIELDS) delete c[f];
  } else if (!canCost) {
    delete c.cost_price;
  } else if (c.sale_price != null && c.cost_price != null) {
    c.profit = c.sale_price - c.cost_price;
  }
  return c;
}

// อ่านฟิลด์ธุรกิจจาก body (multipart → string) แปลงชนิดให้ถูก
function readBusinessFields(body, updates) {
  if (body.import_date !== undefined) updates.import_date = body.import_date ? new Date(body.import_date) : null;
  if (body.cost_price !== undefined) updates.cost_price = body.cost_price === '' ? null : Number(body.cost_price);
  if (body.sale_price !== undefined) updates.sale_price = body.sale_price === '' ? null : Number(body.sale_price);
  if (body.tax_status !== undefined) updates.tax_status = body.tax_status || null;
  if (body.tax_expiry !== undefined) updates.tax_expiry = body.tax_expiry ? new Date(body.tax_expiry) : null;
  if (body.repair_notes !== undefined) updates.repair_notes = body.repair_notes || null;
  if (body.license_plate !== undefined) updates.license_plate = body.license_plate || null;
  // ── ข้อมูลรับรถเข้า ──
  for (const k of ['intake_no', 'branch', 'plate_province', 'engine_no', 'chassis_no',
    'prev_owner_name', 'prev_owner_address', 'prev_owner_id_card', 'finance_quotes', 'equipment']) {
    if (body[k] !== undefined) updates[k] = body[k] || null;
  }
  for (const k of ['registration_date', 'act_expiry']) {
    if (body[k] !== undefined) updates[k] = body[k] ? new Date(body[k]) : null;
  }
}

module.exports = {
  serializeCar,

  create_car_store: async (req, res, next) => {
    try {
      const body = req.body;
      const date = new Date();

      // รูปไม่บังคับ — รถที่เพิ่งรับเข้า (INTAKE) ยังไม่ได้ถ่ายรูป ค่อยมาใส่ทีหลังได้
      let imageUrl = null;
      if (req.file) {
        const ext = req.file.mimetype.split("/")[1];
        const randomName = crypto.randomBytes(16).toString('hex');
        const buffer = await sharp(req.file.buffer).resize({ height: 1080, width: 1980, fit: "contain" }).toBuffer();
        const url = await r2.put(`Category/Default/${randomName}.${ext}`, buffer, req.file.mimetype);
        imageUrl = url;
      }

      // รับสถานะจาก body ได้ (หน้า "รับรถเข้า" ส่ง INTAKE มา) ค่าเริ่มต้นคือพร้อมขาย
      const ALLOWED_STATUS = ['SELL', 'RESERVE', 'SOLD', 'INTAKE'];
      const status = ALLOWED_STATUS.includes(body.cars_status) ? body.cars_status : 'SELL';

      const values = {
        cars_title: body.cars_title,
        brand_name: body.brand_name,
        model_name: body.model_name,
        cars_image_default: imageUrl,
        cars_image: [],
        cars_video: [],
        cars_detail: body.cars_detail ? JSON.parse(body.cars_detail) : {},
        cars_subdetail: body.cars_subdetail ? JSON.parse(body.cars_subdetail) : [],
        cars_description: body.cars_description,
        cars_status: status,
        cars_tag: body.cars_tag,
        updateDate: date,
        createDate: date,
      };
      readBusinessFields(body, values);

      const [result] = await db.insert(carStore).values(values).returning();
      res.send(serializeCar(result, req));
    } catch (error) {
      console.log(error.message);
      if (error.code === '23502') {
        next(createError(422, error.message));
        return;
      }
      next(error);
    }
  },

  get_all_car_store: async (req, res, next) => {
    try {
      const query = req.query;
      let q = db.select().from(carStore).$dynamic();

      // route นี้ใช้ร่วมกันทั้ง /api/store/cars (สาธารณะ) และ /api/admin/cars/all (หลัง auth)
      // ฝั่งสาธารณะต้องไม่เห็นรถที่ขายแล้วและรถที่ยังไม่พร้อมขาย
      if (!req.user) q = q.where(notInArray(carStore.cars_status, HIDDEN_PUBLIC_STATUS));

      if (query.updateDate) q = q.orderBy(desc(carStore.updateDate));
      else if (query.createDate) q = q.orderBy(desc(carStore.createDate));

      const size = Number(query.size);
      const page = Number(query.page);
      if (!Number.isNaN(size) && size > 0) {
        q = q.limit(size);
        if (!Number.isNaN(page) && page >= 0) q = q.offset(page * size);
      }

      const results = await q;
      res.send(results.map((r) => serializeCar(r, req)));
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  get_car_by_id: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
      const [result] = await db.select().from(carStore).where(eq(carStore._id, id));
      // รถที่ยังไม่พร้อมขายเป็นข้อมูลภายใน — เปิดดูจากหน้าเว็บตรง ๆ ไม่ได้
      // (รถ SOLD ยังเปิดได้ ลิงก์เก่าที่ลูกค้าเคยแชร์จะไม่พัง แค่ไม่โผล่ในรายการ)
      // ใช้ res.json เพื่อให้ได้ body "null" ที่ client parse ได้ (res.send(null) ส่ง body ว่าง แล้ว .json() พัง)
      if (result && !req.user && result.cars_status === 'INTAKE') return res.json(null);
      res.json(result ? serializeCar(result, req) : null);
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  update_car_store: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid Product Id'));
      const body = req.body ?? {};

      const updates = {};
      for (const k of ['cars_title', 'brand_name', 'model_name', 'cars_description', 'cars_status', 'cars_tag']) {
        if (body[k] !== undefined) updates[k] = body[k];
      }
      if (body.cars_detail) updates.cars_detail = JSON.parse(body.cars_detail);
      if (body.cars_subdetail) updates.cars_subdetail = JSON.parse(body.cars_subdetail);
      // timestamp columns — accept the date the FE sends (e.g. when status → BOOKING/SOLD)
      for (const k of ['bookingDate', 'soldDate', 'createDate']) {
        if (body[k] !== undefined) updates[k] = body[k] ? new Date(body[k]) : null;
      }
      readBusinessFields(body, updates);
      updates.updateDate = new Date();

      if (req.file) {
        const ext = req.file.mimetype.split("/")[1];
        const randomName = crypto.randomBytes(16).toString('hex');
        const buffer = await sharp(req.file.buffer).resize({ height: 1080, width: 1980, fit: "contain" }).toBuffer();

        // ลบรูปเดิม (cars_image_default ที่ frontend ส่งมาเป็น full URL)
        if (body.cars_image_default) {
          await r2.remove(body.cars_image_default);
        }

        const url = await r2.put(`Category/Default/${randomName}.${ext}`, buffer, req.file.mimetype);
        updates.cars_image_default = url;
      }

      const [result] = await db.update(carStore).set(updates).where(eq(carStore._id, id)).returning();
      if (!result) throw createError(404, 'Product does not exist');
      res.send(serializeCar(result, req));
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  update_car_store_image_gallery: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid Product Id'));
      const imagelist = req.files;
      const body = req.body;
      const cars_image = JSON.parse(body.cars_image);

      for (const file of imagelist) {
        const ext = file.mimetype.split("/")[1];
        const randomName = crypto.randomBytes(16).toString('hex');
        const buffer = await sharp(file.buffer).resize({ height: 1080, width: 1980, fit: "contain" }).toBuffer();

        const url = await r2.put(`Category/${id}/${randomName}.${ext}`, buffer, file.mimetype);
        cars_image.push(url);
      }

      const [result] = await db.update(carStore)
        .set({ cars_image, updateDate: new Date() })
        .where(eq(carStore._id, id))
        .returning();
      if (!result) throw createError(404, 'Product does not exist');
      res.send(result);
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  delete_car_store_image_gallery: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
      const body = req.body;

      // cars_image_delete เป็น array ของ full Blob URL
      if (body.cars_image_delete && body.cars_image_delete.length > 0) {
        await r2.remove(body.cars_image_delete);
      }

      const updates = { updateDate: new Date() };
      if (body.cars_image !== undefined) {
        updates.cars_image = Array.isArray(body.cars_image) ? body.cars_image : JSON.parse(body.cars_image);
      }

      const [result] = await db.update(carStore).set(updates).where(eq(carStore._id, id)).returning();
      res.send(result ?? null);
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  delete_car_store: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
      const [result] = await db.delete(carStore).where(eq(carStore._id, id)).returning();
      if (!result) throw createError(404, 'Product does not exist.');

      const urlsToDelete = [];
      if (result.cars_image_default) urlsToDelete.push(result.cars_image_default);
      if (Array.isArray(result.cars_image) && result.cars_image.length > 0) {
        urlsToDelete.push(...result.cars_image);
      }
      if (Array.isArray(result.cars_video) && result.cars_video.length > 0) {
        urlsToDelete.push(...result.cars_video.map((v) => v.url).filter(Boolean));
      }

      // ลบเอกสารที่ผูกกับรถคันนี้ตามไปด้วย (row + ไฟล์ใน Blob)
      const docs = await db.select().from(schema.documents).where(eq(schema.documents.car_id, id));
      for (const d of docs) if (d.blob_url) urlsToDelete.push(d.blob_url);
      if (docs.length > 0) await db.delete(schema.documents).where(eq(schema.documents.car_id, id));

      if (urlsToDelete.length > 0) {
        await r2.remove(urlsToDelete);
      }

      res.send(serializeCar(result, req));
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

};
