const r2 = require('../lib/r2');
const createError = require('http-errors');
const crypto = require('crypto');
const sharp = require('sharp');
const { eq, asc } = require('drizzle-orm');
const { db, schema } = require('../database/db');

const Brand = schema.masterBrand;
const Model = schema.masterModel;
const Detail = schema.carDataDetail;
const ContactInfo = schema.contactInfo;

module.exports = {
  Contact_Api: {
    // public: คืนค่า config ติดต่อ (object เดียว) — ถ้ายังไม่มีคืน {}
    get_contact: async (req, res, next) => {
      try {
        const [row] = await db.select().from(ContactInfo).limit(1);
        res.send(row ? row.data : {});
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    // admin: upsert ทั้งก้อน (singleton)
    update_contact: async (req, res, next) => {
      try {
        const data = req.body || {};
        const date = new Date();
        const [existing] = await db.select().from(ContactInfo).limit(1);
        let result;
        if (existing) {
          [result] = await db.update(ContactInfo)
            .set({ data, updateDate: date })
            .where(eq(ContactInfo._id, existing._id))
            .returning();
        } else {
          [result] = await db.insert(ContactInfo)
            .values({ data, updateDate: date })
            .returning();
        }
        res.send(result.data);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },
  },

  Model_Api: {
    get_all_model: async (req, res, next) => {
      try {
        const results = await db.select().from(Model);
        res.send(results);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    get_model_by_id: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const [result] = await db.select().from(Model).where(eq(Model._id, id));
        res.send(result ?? null);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    create_model: async (req, res, next) => {
      try {
        const body = req.body;
        const values = {
          model_name: body.model_name,
          brand_name: body.brand_name,
          model_submodel: body.model_submodel
            ? (typeof body.model_submodel === 'string' ? JSON.parse(body.model_submodel) : body.model_submodel)
            : [],
          model_description: body.model_description,
          model_image: body.model_image
            ? (typeof body.model_image === 'string' ? JSON.parse(body.model_image) : body.model_image)
            : [],
          updateDate: new Date(),
        };
        const [result] = await db.insert(Model).values(values).returning();
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    update_model: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const body = req.body;
        const updates = {};
        for (const k of ['model_name', 'brand_name', 'model_description']) {
          if (body[k] !== undefined) updates[k] = body[k];
        }
        if (body.model_submodel) {
          updates.model_submodel = typeof body.model_submodel === 'string' ? JSON.parse(body.model_submodel) : body.model_submodel;
        }
        if (body.model_image) {
          updates.model_image = typeof body.model_image === 'string' ? JSON.parse(body.model_image) : body.model_image;
        }
        updates.updateDate = new Date();

        const [result] = await db.update(Model).set(updates).where(eq(Model._id, id)).returning();
        if (!result) throw createError(404, 'Product does not exist');
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    delete_model: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const [result] = await db.delete(Model).where(eq(Model._id, id)).returning();
        if (!result) throw createError(404, 'Product does not exist.');
        // ลบรูปรุ่น (ถ้ามี) จาก Blob ตามไปด้วย
        if (Array.isArray(result.model_image) && result.model_image.length > 0) {
          try { await r2.remove(result.model_image); } catch (e) { console.log('model_image del:', e.message); }
        }
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },
  },

  Brand_Api: {
    get_all_brand: async (req, res, next) => {
      try {
        const results = await db.select().from(Brand).orderBy(asc(Brand.sort_order), asc(Brand.brand_name));
        res.send(results);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    // จัดลำดับยี่ห้อใหม่ทั้งชุด — body: { ids: [brandId เรียงตามลำดับที่ต้องการ] }
    reorder_brand: async (req, res, next) => {
      try {
        const ids = req.body.ids;
        if (!Array.isArray(ids)) return next(createError(400, 'ids must be an array'));
        const date = new Date();
        for (let i = 0; i < ids.length; i++) {
          await db.update(Brand).set({ sort_order: i, updateDate: date }).where(eq(Brand._id, Number(ids[i])));
        }
        res.send({ status: 'success', count: ids.length });
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    get_brand_by_id: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const [result] = await db.select().from(Brand).where(eq(Brand._id, id));
        res.send(result ?? null);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    create_brand: async (req, res, next) => {
      try {
        const body = req.body;
        const values = {
          brand_name: body.brand_name,
          brand_description: body.brand_description,
          updateDate: new Date(),
        };
        if (req.file) {
          const randomName = crypto.randomBytes(16).toString('hex');
          const buffer = await sharp(req.file.buffer).toBuffer();
          const url = await r2.put(`Category/Brand/${randomName}`, buffer, req.file.mimetype);
          values.brand_image = url;
        }
        const [result] = await db.insert(Brand).values(values).returning();
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    update_brand: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const body = req.body;
        const updates = {};
        for (const k of ['brand_name', 'brand_description']) {
          if (body[k] !== undefined) updates[k] = body[k];
        }
        if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order);
        updates.updateDate = new Date();

        if (req.file) {
          // ลบรูปเดิม (brand_image ที่ frontend ส่งมาเป็น full URL)
          if (body.brand_image) {
            await r2.remove(body.brand_image);
          }
          const randomName = crypto.randomBytes(16).toString('hex');
          const buffer = await sharp(req.file.buffer).toBuffer();
          const url = await r2.put(`Category/Brand/${randomName}`, buffer, req.file.mimetype);
          updates.brand_image = url;
        }

        const [result] = await db.update(Brand).set(updates).where(eq(Brand._id, id)).returning();
        if (!result) throw createError(404, 'Product does not exist');
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    delete_brand: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const [result] = await db.delete(Brand).where(eq(Brand._id, id)).returning();
        if (!result) throw createError(404, 'Product does not exist.');
        if (result.brand_image) {
          await r2.remove(result.brand_image);
        }
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },
  },

  Car_Detail_Api: {
    get_all_car_detail: async (req, res, next) => {
      try {
        const results = await db.select().from(Detail);
        res.send(results);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    create_car_detail: async (req, res, next) => {
      try {
        const body = req.body;
        const values = {
          cardt_title: body.cardt_title,
          cardt_type: body.cardt_type,
          cardt_description: body.cardt_description,
          updateDate: new Date(),
        };
        const [result] = await db.insert(Detail).values(values).returning();
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    update_car_detail: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const body = req.body;
        const updates = {};
        for (const k of ['cardt_title', 'cardt_type', 'cardt_description']) {
          if (body[k] !== undefined) updates[k] = body[k];
        }
        updates.updateDate = new Date();

        const [result] = await db.update(Detail).set(updates).where(eq(Detail._id, id)).returning();
        if (!result) throw createError(404, 'Product does not exist');
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },

    delete_car_detail: async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) return next(createError(400, 'Invalid Product id'));
        const [result] = await db.delete(Detail).where(eq(Detail._id, id)).returning();
        if (!result) throw createError(404, 'Product does not exist.');
        res.send(result);
      } catch (error) {
        console.log(error.message);
        next(error);
      }
    },
  },
};
