const r2 = require('../lib/r2');
const createError = require('http-errors');
const crypto = require('crypto');
const { eq, desc } = require('drizzle-orm');
const { db, schema } = require('../database/db');

const Documents = schema.documents;

// เอกสารกลุ่มการเงิน (ดู/ดาวน์โหลดต้องมีสิทธิ์ documents.financial)
const FINANCIAL_TYPES = ['contract', 'receipt'];

const hasPerm = (req, key) =>
  !!(req.user && Array.isArray(req.user.permissions) && req.user.permissions.includes(key));

module.exports = {
  // รายการเอกสารของรถคันหนึ่ง (ซ่อนเอกสารการเงินถ้าไม่มีสิทธิ์)
  list_documents: async (req, res, next) => {
    try {
      const carId = Number(req.params.carId);
      if (Number.isNaN(carId)) return next(createError(400, 'Invalid car id'));
      let rows = await db.select().from(Documents).where(eq(Documents.car_id, carId)).orderBy(desc(Documents._id));
      if (!hasPerm(req, 'documents.financial')) {
        rows = rows.filter((d) => !FINANCIAL_TYPES.includes(d.doc_type));
      }
      // ไม่ส่ง blob_url ตรงๆ (ให้โหลดผ่าน endpoint ที่เช็คสิทธิ์)
      res.send(rows.map((d) => ({ _id: d._id, car_id: d.car_id, doc_type: d.doc_type, file_name: d.file_name, createDate: d.createDate })));
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  upload_document: async (req, res, next) => {
    try {
      const carId = Number(req.params.carId);
      if (Number.isNaN(carId)) return next(createError(400, 'Invalid car id'));
      if (!req.file) return next(createError(422, 'file is required'));
      const docType = req.body.doc_type || 'other';

      const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
      // path สุ่ม 24 hex (~96-bit) เดาไม่ได้ + ไม่เปิดเผย URL ต่อ client (โหลดผ่าน BE เท่านั้น)
      // NOTE: bucket R2 เปิด public อยู่ ความลับจึงมาจาก path ที่เดาไม่ได้ + BE เป็นคนเช็คสิทธิ์
      //       ถ้าต้องการ private จริง ให้ปิด Public Development URL แล้วใช้ presigned GET แทน
      const randomName = crypto.randomBytes(24).toString('hex');
      const fileUrl = await r2.put(`Documents/${carId}/${randomName}.${ext}`, req.file.buffer, req.file.mimetype);

      const [row] = await db.insert(Documents).values({
        car_id: carId,
        doc_type: docType,
        file_name: req.file.originalname,
        blob_url: fileUrl,
        uploaded_by: req.user ? Number(req.user.user_id) : null,
        createDate: new Date(),
      }).returning();

      res.send({ _id: row._id, car_id: row.car_id, doc_type: row.doc_type, file_name: row.file_name, createDate: row.createDate });
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  // ดาวน์โหลด/ดูไฟล์ผ่าน BE (เช็คสิทธิ์ + stream ไฟล์ private)
  download_document: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid document id'));
      const [doc] = await db.select().from(Documents).where(eq(Documents._id, id));
      if (!doc) return next(createError(404, 'Document not found'));
      if (FINANCIAL_TYPES.includes(doc.doc_type) && !hasPerm(req, 'documents.financial')) {
        return next(createError(403, 'ไม่มีสิทธิ์เข้าถึงเอกสารการเงิน'));
      }

      const result = await r2.getStream(doc.blob_url);
      if (!result || !result.stream) return next(createError(404, 'File not found in storage'));
      if (result.contentType) res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name || 'file')}"`);
      // SDK ของ S3 คืน Node stream อยู่แล้ว ไม่ต้องแปลงผ่าน Readable.fromWeb เหมือน Vercel Blob
      result.stream.pipe(res);
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  delete_document: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid document id'));
      const [doc] = await db.delete(Documents).where(eq(Documents._id, id)).returning();
      if (!doc) return next(createError(404, 'Document not found'));
      try { await r2.remove(doc.blob_url); } catch (e) { console.log('storage del:', e.message); }
      res.send({ status: 'success', _id: id });
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },
};
