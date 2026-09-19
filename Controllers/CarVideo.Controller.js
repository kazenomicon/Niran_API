const createError = require('http-errors');
const crypto = require('crypto');
const { eq } = require('drizzle-orm');
const { HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { db, schema } = require('../database/db');
const r2 = require('../lib/r2');
const { serializeCar } = require('./CarStore.Controller');

const carStore = schema.carStore;

// วิดีโอไฟล์ใหญ่เกิน body limit ของ serverless function (~4.5MB)
// จึงให้ browser อัปโหลดตรงเข้า R2 ด้วย presigned URL แล้วค่อยส่ง url กลับมาผูกกับรถ
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB / ไฟล์
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

const videoPrefix = (carId) => `Category/${carId}/video/`;

module.exports = {
  MAX_VIDEO_BYTES,
  ALLOWED_VIDEO_TYPES,

  // ── POST /api/admin/cars/video/presign/:id ──
  // ออก presigned PUT URL ให้เบราว์เซอร์อัปไฟล์ตรงเข้า R2 (ไม่ผ่าน API)
  // route นี้อยู่หลัง middleware auth ตามปกติแล้ว — ต่างจากตอนใช้ Vercel Blob
  // ที่ SDK ส่ง header เองไม่ได้ เลยต้องแอบตรวจ token ใน clientPayload
  presign_car_video: async (req, res, next) => {
    try {
      const carId = Number(req.params.id);
      if (Number.isNaN(carId)) return next(createError(400, 'Invalid car id'));
      const { filename, contentType, size } = req.body ?? {};

      if (!ALLOWED_VIDEO_TYPES.includes(contentType)) {
        return next(createError(422, 'รองรับเฉพาะไฟล์ MP4 / MOV / WebM'));
      }
      if (Number(size) > MAX_VIDEO_BYTES) {
        return next(createError(422, 'ไฟล์ใหญ่เกิน 200MB'));
      }

      const [car] = await db.select({ _id: carStore._id }).from(carStore).where(eq(carStore._id, carId));
      if (!car) return next(createError(404, 'Product does not exist'));

      // ชื่อไฟล์สุ่มกันชนกันและกันชื่อไทย/อักขระแปลกทำ key พัง
      const ext = (String(filename || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = `${videoPrefix(carId)}${crypto.randomBytes(16).toString('hex')}.${ext}`;

      const { uploadUrl, publicUrl } = await r2.presignPut(key, contentType);
      res.send({ uploadUrl, publicUrl, key });
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  // ── POST /api/admin/update/cars/video/:id ── ผูก url ที่อัปโหลดแล้วเข้ากับรถ
  attach_car_video: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid Product Id'));
      const { url, name } = req.body ?? {};
      if (!url || typeof url !== 'string') return next(createError(422, 'url is required'));

      const [car] = await db.select().from(carStore).where(eq(carStore._id, id));
      if (!car) throw createError(404, 'Product does not exist');

      // กัน url ปลอม: ต้องเป็น object ใน bucket เรา และอยู่ใต้ path ของรถคันนี้
      const key = r2.keyFromUrl(url);
      if (!key || !key.startsWith(videoPrefix(id))) {
        return next(createError(422, 'Invalid storage url for this car'));
      }

      // เช็คของจริงใน R2 แทนที่จะเชื่อขนาดที่ client บอกมา
      let head;
      try {
        head = await r2.s3.send(new HeadObjectCommand({ Bucket: r2.BUCKET, Key: key }));
      } catch (e) {
        return next(createError(404, 'ยังไม่พบไฟล์ในที่เก็บ อาจอัปโหลดไม่สำเร็จ'));
      }
      if (head.ContentLength > MAX_VIDEO_BYTES) {
        await r2.s3.send(new DeleteObjectCommand({ Bucket: r2.BUCKET, Key: key }));
        return next(createError(422, 'ไฟล์ใหญ่เกิน 200MB'));
      }

      const videos = Array.isArray(car.cars_video) ? car.cars_video : [];
      if (videos.some((v) => v.url === url)) return res.send(serializeCar(car, req));
      videos.push({
        url,
        name: name || 'video',
        size: head.ContentLength || 0,
        uploadedAt: new Date().toISOString(),
      });

      const [result] = await db.update(carStore)
        .set({ cars_video: videos, updateDate: new Date() })
        .where(eq(carStore._id, id))
        .returning();
      res.send(serializeCar(result, req));
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  // ── POST /api/admin/delete/cars/video/:id ── ลบ url ออกจากรถ + ลบไฟล์ในที่เก็บ
  delete_car_video: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid Product Id'));
      const { url } = req.body ?? {};
      if (!url) return next(createError(422, 'url is required'));

      const [car] = await db.select().from(carStore).where(eq(carStore._id, id));
      if (!car) throw createError(404, 'Product does not exist');

      const videos = Array.isArray(car.cars_video) ? car.cars_video : [];
      if (!videos.some((v) => v.url === url)) return next(createError(404, 'Video not found on this car'));

      await r2.remove(url); // รองรับทั้ง url ใหม่ (R2) และของเก่าที่ยังไม่ได้ย้าย
      const [result] = await db.update(carStore)
        .set({ cars_video: videos.filter((v) => v.url !== url), updateDate: new Date() })
        .where(eq(carStore._id, id))
        .returning();
      res.send(serializeCar(result, req));
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },
};
