const express = require('express');
const router = express.Router();
const multer = require("multer")

const authAdmin = require("../middleware/authAdmin");
const requirePermission = require("../middleware/requirePermission");
const CarStoreController = require('../Controllers/CarStore.Controller');
const CarVideoController = require('../Controllers/CarVideo.Controller');
const MasterDataController = require('../Controllers/MasterData.Controller');
const UserController = require('../Controllers/User.Controller');
const RoleController = require('../Controllers/Role.Controller');
const DocumentController = require('../Controllers/Document.Controller');
const CustomerController = require('../Controllers/Customer.Controller');
const ReportController = require('../Controllers/Report.Controller');
const SalesController = require('../Controllers/Sales.Controller');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage })

/**
 * @swagger
 * tags:
 *   - name: Admin - Cars
 *     description: จัดการข้อมูลรถ (ต้องล็อกอิน)
 *   - name: Admin - Brands
 *     description: จัดการยี่ห้อรถ (ต้องล็อกอิน)
 *   - name: Admin - Models
 *     description: จัดการรุ่นรถ (ต้องล็อกอิน)
 *   - name: Admin - Car Detail
 *     description: จัดการสเปครถ (ต้องล็อกอิน)
 *   - name: Admin - Users
 *     description: จัดการผู้ใช้ (เฉพาะ ADMIN เท่านั้น)
 */

// ──────────────────────────────────────────────
// Cars
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/create/cars:
 *   post:
 *     summary: สร้างรายการรถใหม่
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [cars_title, brand_name, model_name, cars_detail, image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: รูปภาพหลักของรถ
 *               cars_title:
 *                 type: string
 *                 example: Toyota Camry 2024
 *               brand_name:
 *                 type: string
 *                 example: Toyota
 *               model_name:
 *                 type: string
 *                 example: Camry
 *               cars_detail:
 *                 type: string
 *                 description: JSON string ของข้อมูลสเปค
 *                 example: '{"year":"2024","color":"ขาว","mileage":"50000"}'
 *               cars_subdetail:
 *                 type: string
 *                 description: JSON string ของรายละเอียดเพิ่มเติม (array)
 *                 example: '[]'
 *               cars_description:
 *                 type: string
 *               cars_tag:
 *                 type: string
 *     responses:
 *       200:
 *         description: สร้างรถสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CarStore'
 *       401:
 *         description: ไม่มีสิทธิ์เข้าถึง
 *       422:
 *         description: ข้อมูลไม่ครบหรือไม่ถูกต้อง
 */
router.post('/create/cars', upload.single('image'), CarStoreController.create_car_store);

/**
 * @swagger
 * /api/admin/update/cars/{id}:
 *   post:
 *     summary: อัปเดตข้อมูลรถ
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *         description: ID (เลข integer) ของรถ
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: รูปภาพใหม่ (ถ้าต้องการเปลี่ยน)
 *               cars_image_default:
 *                 type: string
 *                 description: full Blob URL ของรูปเดิม (ส่งมาเพื่อให้ระบบลบรูปเก่าเมื่ออัปโหลดรูปใหม่)
 *                 example: https://xxxx.public.blob.vercel-storage.com/Category/Default/abc123.jpeg
 *               cars_title:
 *                 type: string
 *                 example: Toyota Camry 2024 (ปรับราคา)
 *               brand_name:
 *                 type: string
 *                 example: Toyota
 *               model_name:
 *                 type: string
 *                 example: Camry
 *               cars_detail:
 *                 type: string
 *                 description: JSON string ของข้อมูลสเปค
 *                 example: '{"year":"2024","color":"ดำ","mileage":"42000","price":"1390000"}'
 *               cars_subdetail:
 *                 type: string
 *                 description: JSON string (array)
 *                 example: '[{"label":"ประกัน","value":"ชั้น 1 ถึง 2025"}]'
 *               cars_description:
 *                 type: string
 *                 example: รถบ้านมือเดียว เข้าศูนย์ตลอด
 *               cars_status:
 *                 type: string
 *                 enum: [SELL, SOLD, BOOKING]
 *                 example: BOOKING
 *               cars_tag:
 *                 type: string
 *                 example: ป้ายแดง
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CarStore'
 *       404:
 *         description: ไม่พบรถที่ระบุ
 */
router.post('/update/cars/:id', upload.single('image'), CarStoreController.update_car_store);

/**
 * @swagger
 * /api/admin/update/cars/image/gallery/{id}:
 *   post:
 *     summary: เพิ่มรูปภาพ gallery ให้รถ
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image, cars_image]
 *             properties:
 *               image:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: รูปภาพ gallery (สูงสุด 10 รูป)
 *               cars_image:
 *                 type: string
 *                 description: JSON array ของ full Blob URL รูปที่มีอยู่แล้ว (รูปใหม่จะถูก push ต่อท้าย)
 *                 example: '["https://xxxx.public.blob.vercel-storage.com/Category/1/existing.jpeg"]'
 *     responses:
 *       200:
 *         description: เพิ่มรูปสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CarStore'
 */
router.post('/update/cars/image/gallery/:id', upload.array('image', 10), CarStoreController.update_car_store_image_gallery);

/**
 * @swagger
 * /api/admin/delete/cars/image/gallery/{id}:
 *   post:
 *     summary: ลบรูปภาพ gallery ออกจากรถ
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cars_image_delete, cars_image]
 *             properties:
 *               cars_image_delete:
 *                 type: array
 *                 items: { type: string }
 *                 description: รายการ full Blob URL ที่ต้องการลบ
 *                 example: ["https://xxxx.public.blob.vercel-storage.com/Category/1/abc123.jpeg"]
 *               cars_image:
 *                 type: array
 *                 items: { type: string }
 *                 description: รายการ full Blob URL ที่เหลือหลังลบ
 *                 example: []
 *     responses:
 *       200:
 *         description: ลบรูปสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CarStore'
 */
router.post('/delete/cars/image/gallery/:id', CarStoreController.delete_car_store_image_gallery);

/**
 * @swagger
 * /api/admin/update/cars/video/{id}:
 *   post:
 *     summary: ผูกวิดีโอที่อัปโหลดแล้วเข้ากับรถ
 *     description: |
 *       เรียกหลังจาก browser อัปโหลดไฟล์ตรงเข้า Vercel Blob เสร็จแล้ว
 *       (ดู `POST /api/upload/car-video/token`) — ตัวไฟล์ไม่ได้ผ่าน API นี้ ส่งมาแค่ URL
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 description: full Blob URL ที่ได้จาก upload() (ต้องอยู่ใต้ path Category/{id}/video/)
 *                 example: https://xxxx.public.blob.vercel-storage.com/Category/1/video/walkaround-abc123.mp4
 *               name:
 *                 type: string
 *                 example: walkaround.mp4
 *               size:
 *                 type: integer
 *                 example: 18452301
 *     responses:
 *       200:
 *         description: ผูกวิดีโอสำเร็จ
 *       404:
 *         description: ไม่พบรถที่ระบุ
 *       422:
 *         description: url ไม่ถูกต้อง
 */
router.post('/update/cars/video/:id', requirePermission('cars.edit'), CarVideoController.attach_car_video);

/**
 * @swagger
 * /api/admin/delete/cars/video/{id}:
 *   post:
 *     summary: ลบวิดีโอออกจากรถ (ลบไฟล์ใน Blob ด้วย)
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 example: https://xxxx.public.blob.vercel-storage.com/Category/1/video/walkaround-abc123.mp4
 *     responses:
 *       200:
 *         description: ลบวิดีโอสำเร็จ
 *       404:
 *         description: ไม่พบรถ หรือไม่พบวิดีโอนี้บนรถคันนั้น
 */
router.post('/delete/cars/video/:id', requirePermission('cars.edit'), CarVideoController.delete_car_video);

/**
 * @swagger
 * /api/admin/delete/cars/{id}:
 *   get:
 *     summary: ลบรถ (เฉพาะ ADMIN)
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CarStore'
 *       403:
 *         description: ไม่มีสิทธิ์ ADMIN
 *       404:
 *         description: ไม่พบรถที่ระบุ
 */
router.get('/delete/cars/:id', authAdmin, CarStoreController.delete_car_store);

/**
 * @swagger
 * /api/admin/cars/all:
 *   get:
 *     summary: ดูรถทั้งหมด (สำหรับ admin)
 *     tags: [Admin - Cars]
 *     security:
 *       - AccessToken: []
 *     responses:
 *       200:
 *         description: รายการรถทั้งหมด
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CarStore'
 */
router.get('/cars/all', CarStoreController.get_all_car_store);

/**
 * @swagger
 * /api/admin/cars/{id}:
 *   get:
 *     summary: ดูรถตาม id (แบบ admin — เห็นราคาทุน/กำไร/โน้ตซ่อม ตามสิทธิ์)
 *     tags: [Admin - Cars]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200: { description: ข้อมูลรถ (รวมข้อมูลภายในตามสิทธิ์) }
 */
router.get('/cars/:id', CarStoreController.get_car_by_id);

// ──────────────────────────────────────────────
// Models
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/create/model:
 *   post:
 *     summary: สร้างรุ่นรถใหม่
 *     tags: [Admin - Models]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [model_name, brand_name]
 *             properties:
 *               model_name:
 *                 type: string
 *                 example: Camry
 *               brand_name:
 *                 type: string
 *                 example: Toyota
 *               model_submodel:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["2.0 G", "2.5 HV"]
 *               model_description:
 *                 type: string
 *     responses:
 *       200:
 *         description: สร้างสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 */
router.post('/create/model', MasterDataController.Model_Api.create_model)

/**
 * @swagger
 * /api/admin/update/model/{id}:
 *   post:
 *     summary: อัปเดตรุ่นรถ
 *     tags: [Admin - Models]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               model_name:
 *                 type: string
 *                 example: Camry
 *               brand_name:
 *                 type: string
 *                 example: Toyota
 *               model_submodel:
 *                 type: string
 *                 description: JSON string ของ array sub-model
 *                 example: '["2.0 G","2.5 HV","2.5 HV Premium"]'
 *               model_description:
 *                 type: string
 *                 example: รุ่นปรับโฉมปี 2024
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 *       404:
 *         description: ไม่พบรุ่นรถ
 */
router.post('/update/model/:id', MasterDataController.Model_Api.update_model)

/**
 * @swagger
 * /api/admin/delete/model/{id}:
 *   get:
 *     summary: ลบรุ่นรถ
 *     tags: [Admin - Models]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *       404:
 *         description: ไม่พบรุ่นรถ
 */
router.get('/delete/model/:id', MasterDataController.Model_Api.delete_model)

// ──────────────────────────────────────────────
// Brands
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/create/brand:
 *   post:
 *     summary: สร้างยี่ห้อรถใหม่
 *     tags: [Admin - Brands]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [brand_name]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: โลโก้ยี่ห้อรถ
 *               brand_name:
 *                 type: string
 *                 example: Toyota
 *               brand_description:
 *                 type: string
 *                 example: แบรนด์รถยนต์จากญี่ปุ่น
 *     responses:
 *       200:
 *         description: สร้างสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Brand'
 */
router.post('/create/brand', upload.single('image'), MasterDataController.Brand_Api.create_brand)

/**
 * @swagger
 * /api/admin/update/brand/{id}:
 *   post:
 *     summary: อัปเดตยี่ห้อรถ
 *     tags: [Admin - Brands]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: โลโก้ใหม่ (ถ้าต้องการเปลี่ยน)
 *               brand_name:
 *                 type: string
 *                 example: Toyota
 *               brand_description:
 *                 type: string
 *                 example: แบรนด์รถยนต์จากญี่ปุ่น
 *               brand_image:
 *                 type: string
 *                 description: full Blob URL ของโลโก้เดิม (ส่งมาเพื่อให้ลบรูปเก่าเมื่ออัปโหลดรูปใหม่)
 *                 example: https://xxxx.public.blob.vercel-storage.com/Category/Brand/abc123
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Brand'
 *       404:
 *         description: ไม่พบยี่ห้อรถ
 */
router.post('/update/brand/:id', upload.single('image'), MasterDataController.Brand_Api.update_brand)

/**
 * @swagger
 * /api/admin/delete/brand/{id}:
 *   get:
 *     summary: ลบยี่ห้อรถ
 *     tags: [Admin - Brands]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *       404:
 *         description: ไม่พบยี่ห้อรถ
 */
router.get('/delete/brand/:id', MasterDataController.Brand_Api.delete_brand)

/**
 * @swagger
 * /api/admin/brand/reorder:
 *   post:
 *     summary: จัดลำดับยี่ห้อรถใหม่ทั้งชุด
 *     tags: [Admin - Brands]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: integer }
 *                 description: รายการ id ของยี่ห้อ เรียงตามลำดับที่ต้องการ
 *                 example: [24, 13, 3]
 *     responses:
 *       200:
 *         description: จัดลำดับสำเร็จ
 */
router.post('/brand/reorder', MasterDataController.Brand_Api.reorder_brand)

// ──────────────────────────────────────────────
// Roles & Permissions (RBAC) — ต้องมีสิทธิ์ users.manage
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/permissions:
 *   get:
 *     summary: รายการสิทธิ์ทั้งหมด (permission catalog) สำหรับเรนเดอร์ checkbox
 *     tags: [Admin - Roles]
 *     security: [{ AccessToken: [] }]
 *     responses:
 *       200: { description: กลุ่มสิทธิ์ }
 */
router.get('/permissions', RoleController.get_permission_catalog);

/**
 * @swagger
 * /api/admin/roles:
 *   get:
 *     summary: รายการ role ทั้งหมด
 *     tags: [Admin - Roles]
 *     security: [{ AccessToken: [] }]
 *     responses:
 *       200: { description: รายการ role }
 */
router.get('/roles', RoleController.get_all_roles);

/**
 * @swagger
 * /api/admin/create/role:
 *   post:
 *     summary: สร้าง role ใหม่
 *     tags: [Admin - Roles]
 *     security: [{ AccessToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: หัวหน้าฝ่ายขาย }
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["cars.view", "cars.edit", "customers.manage"]
 *     responses:
 *       200: { description: สร้างสำเร็จ }
 */
router.post('/create/role', requirePermission('users.manage'), RoleController.create_role);

/**
 * @swagger
 * /api/admin/update/role/{id}:
 *   post:
 *     summary: แก้ไข role (ชื่อ/สิทธิ์)
 *     tags: [Admin - Roles]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200: { description: แก้ไขสำเร็จ }
 */
router.post('/update/role/:id', requirePermission('users.manage'), RoleController.update_role);

/**
 * @swagger
 * /api/admin/delete/role/{id}:
 *   get:
 *     summary: ลบ role (ลบ role ระบบ/ที่มีผู้ใช้อยู่ไม่ได้)
 *     tags: [Admin - Roles]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 2 }
 *     responses:
 *       200: { description: ลบสำเร็จ }
 */
router.get('/delete/role/:id', requirePermission('users.manage'), RoleController.delete_role);

// ──────────────────────────────────────────────
// Car Detail
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/create/car/detail:
 *   post:
 *     summary: สร้างข้อมูลสเปครถใหม่
 *     tags: [Admin - Car Detail]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cardt_title, cardt_type]
 *             properties:
 *               cardt_title:
 *                 type: string
 *                 example: ระบบเครื่องยนต์
 *               cardt_type:
 *                 type: string
 *                 description: ประเภท/หมวดของสเปค
 *                 example: engine
 *               cardt_description:
 *                 type: string
 *                 example: เครื่องยนต์ 2.5L 4 สูบ เกียร์อัตโนมัติ 8 สปีด
 *     responses:
 *       200:
 *         description: สร้างสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CarDetail'
 */
router.post('/create/car/detail', MasterDataController.Car_Detail_Api.create_car_detail)

/**
 * @swagger
 * /api/admin/update/car/detail/{id}:
 *   post:
 *     summary: อัปเดตสเปครถ
 *     tags: [Admin - Car Detail]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cardt_title:
 *                 type: string
 *                 example: ระบบเครื่องยนต์
 *               cardt_type:
 *                 type: string
 *                 example: engine
 *               cardt_description:
 *                 type: string
 *                 example: เครื่องยนต์ 2.5L 4 สูบ เกียร์อัตโนมัติ 8 สปีด
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CarDetail'
 *       404:
 *         description: ไม่พบข้อมูล
 */
router.post('/update/car/detail/:id', MasterDataController.Car_Detail_Api.update_car_detail)

/**
 * @swagger
 * /api/admin/delete/car/detail/{id}:
 *   get:
 *     summary: ลบสเปครถ
 *     tags: [Admin - Car Detail]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *       404:
 *         description: ไม่พบข้อมูล
 */
router.get('/delete/car/detail/:id', MasterDataController.Car_Detail_Api.delete_car_detail)

// ──────────────────────────────────────────────
// Users (ADMIN only)
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/register:
 *   post:
 *     summary: สร้างผู้ใช้ใหม่ (เฉพาะ ADMIN)
 *     tags: [Admin - Users]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: staff01
 *               password:
 *                 type: string
 *                 example: "password123"
 *               position:
 *                 type: string
 *                 enum: [ADMIN, ""]
 *                 example: ""
 *     responses:
 *       200:
 *         description: สร้างผู้ใช้สำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: ไม่มีสิทธิ์ ADMIN
 */
router.post('/register', authAdmin, UserController.user_register);

/**
 * @swagger
 * /api/admin/user/all:
 *   get:
 *     summary: ดูรายการผู้ใช้ทั้งหมด (เฉพาะ ADMIN)
 *     tags: [Admin - Users]
 *     security:
 *       - AccessToken: []
 *     responses:
 *       200:
 *         description: รายการผู้ใช้ (ไม่แสดง password)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       403:
 *         description: ไม่มีสิทธิ์ ADMIN
 */
/**
 * @swagger
 * /api/admin/me:
 *   get:
 *     summary: ข้อมูล + สิทธิ์ของผู้ใช้ที่ล็อกอินอยู่
 *     description: ใช้ให้ Dashboard sync สิทธิ์ล่าสุด ไม่ต้องรอ login ใหม่
 *     tags: [Admin - Users]
 *     security:
 *       - AccessToken: []
 *     responses:
 *       200: { description: ข้อมูลผู้ใช้ + permissions }
 */
router.get('/me', UserController.get_me);

router.get('/user/all', authAdmin, UserController.get_all_user);

/**
 * @swagger
 * /api/admin/update/user/{id}:
 *   post:
 *     summary: อัปเดตข้อมูลผู้ใช้ (เฉพาะ ADMIN)
 *     tags: [Admin - Users]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: staff01
 *               password:
 *                 type: string
 *                 description: ส่งมาเฉพาะเมื่อต้องการเปลี่ยนรหัสผ่าน
 *                 example: newpassword123
 *               email:
 *                 type: string
 *                 example: staff01@niran.com
 *               tel:
 *                 type: string
 *                 example: "0812345678"
 *               position:
 *                 type: string
 *                 enum: [ADMIN, ""]
 *                 example: ""
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: ไม่มีสิทธิ์ ADMIN
 *       404:
 *         description: ไม่พบผู้ใช้ หรือ username ซ้ำ
 */
router.post('/update/user/:id', authAdmin, UserController.update_user);

/**
 * @swagger
 * /api/admin/delete/user/{id}:
 *   get:
 *     summary: ลบผู้ใช้ (เฉพาะ ADMIN)
 *     tags: [Admin - Users]
 *     security:
 *       - AccessToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *       403:
 *         description: ไม่มีสิทธิ์ ADMIN
 *       404:
 *         description: ไม่พบผู้ใช้
 */
router.get('/delete/user/:id', authAdmin, UserController.delete_user)

// ──────────────────────────────────────────────
// Documents (แนบไฟล์ต่อรถ — private Blob)
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/documents/{carId}:
 *   get:
 *     summary: รายการเอกสารของรถ (ซ่อนเอกสารการเงินถ้าไม่มีสิทธิ์)
 *     tags: [Admin - Documents]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: carId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: รายการเอกสาร }
 */
router.get('/documents/:carId', requirePermission('documents.view'), DocumentController.list_documents);

/**
 * @swagger
 * /api/admin/documents/{carId}:
 *   post:
 *     summary: อัปโหลดเอกสารแนบรถ
 *     tags: [Admin - Documents]
 *     security: [{ AccessToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, doc_type]
 *             properties:
 *               file: { type: string, format: binary }
 *               doc_type: { type: string, enum: [tax, insurance, contract, receipt, other] }
 *     responses:
 *       200: { description: อัปโหลดสำเร็จ }
 */
router.post('/documents/:carId', requirePermission('documents.manage'), upload.single('file'), DocumentController.upload_document);

/**
 * @swagger
 * /api/admin/document/download/{id}:
 *   get:
 *     summary: ดาวน์โหลด/ดูไฟล์เอกสาร (stream ผ่าน BE + เช็คสิทธิ์)
 *     tags: [Admin - Documents]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: ไฟล์ }
 */
router.get('/document/download/:id', requirePermission('documents.view'), DocumentController.download_document);

/**
 * @swagger
 * /api/admin/delete/document/{id}:
 *   get:
 *     summary: ลบเอกสาร
 *     tags: [Admin - Documents]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: ลบสำเร็จ }
 */
router.get('/delete/document/:id', requirePermission('documents.manage'), DocumentController.delete_document);

// ──────────────────────────────────────────────
// CRM: ลูกค้า + แจ้งเตือน (Alert Center)
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/customers:
 *   get:
 *     summary: รายการลูกค้าทั้งหมด
 *     tags: [Admin - CRM]
 *     security: [{ AccessToken: [] }]
 *     responses:
 *       200: { description: รายการลูกค้า }
 */
router.get('/customers', requirePermission('customers.manage'), CustomerController.Customer_Api.get_all_customer);

/**
 * @swagger
 * /api/admin/create/customer:
 *   post:
 *     summary: เพิ่มลูกค้า
 *     tags: [Admin - CRM]
 *     security: [{ AccessToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               tel: { type: string }
 *               email: { type: string }
 *               note: { type: string }
 *               car_id: { type: integer }
 *               insurance_expiry: { type: string, format: date }
 *               next_service_date: { type: string, format: date }
 *     responses:
 *       200: { description: เพิ่มสำเร็จ }
 */
router.post('/create/customer', requirePermission('customers.manage'), CustomerController.Customer_Api.create_customer);

/**
 * @swagger
 * /api/admin/update/customer/{id}:
 *   post:
 *     summary: แก้ไขลูกค้า
 *     tags: [Admin - CRM]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: แก้ไขสำเร็จ }
 */
router.post('/update/customer/:id', requirePermission('customers.manage'), CustomerController.Customer_Api.update_customer);

/**
 * @swagger
 * /api/admin/delete/customer/{id}:
 *   get:
 *     summary: ลบลูกค้า
 *     tags: [Admin - CRM]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: ลบสำเร็จ }
 */
router.get('/delete/customer/:id', requirePermission('customers.manage'), CustomerController.Customer_Api.delete_customer);

/**
 * @swagger
 * /api/admin/alerts:
 *   get:
 *     summary: แจ้งเตือนสิ่งที่ใกล้ครบกำหนด (ภาษี/ประกัน/เช็คระยะ)
 *     tags: [Admin - CRM]
 *     security: [{ AccessToken: [] }]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, example: 30 }
 *     responses:
 *       200: { description: "{ count, alerts[] }" }
 */
router.get('/alerts', requirePermission('alerts.view'), CustomerController.get_alerts);

/**
 * @swagger
 * /api/admin/reports/summary:
 *   get:
 *     summary: สรุปภาพรวมธุรกิจ (สต๊อก/ยอดขาย/กำไร/รถค้าง/ภาษีใกล้ครบ)
 *     tags: [Admin - Reports]
 *     security: [{ AccessToken: [] }]
 *     responses:
 *       200: { description: สรุปตัวเลข }
 */
router.get('/reports/summary', requirePermission('reports.view'), ReportController.get_summary);

// ──────────────────────────────────────────────
// Sales (บันทึกการขาย) + Expenses (ค่าใช้จ่ายต่อคัน) — สิทธิ์การเงิน cars.cost
// ──────────────────────────────────────────────
router.get('/sales', requirePermission('cars.cost'), SalesController.Sales_Api.list_sales);
router.get('/sale/:id', requirePermission('cars.cost'), SalesController.Sales_Api.get_sale);
router.post('/create/sale', requirePermission('cars.cost'), SalesController.Sales_Api.create_sale);
router.post('/update/sale/:id', requirePermission('cars.cost'), SalesController.Sales_Api.update_sale);
router.get('/delete/sale/:id', requirePermission('cars.cost'), SalesController.Sales_Api.delete_sale);

router.get('/expenses/:carId', requirePermission('cars.cost'), SalesController.Expense_Api.list_expenses);
router.post('/expenses/:carId', requirePermission('cars.cost'), SalesController.Expense_Api.create_expense);
router.get('/delete/expense/:id', requirePermission('cars.cost'), SalesController.Expense_Api.delete_expense);

// ──────────────────────────────────────────────
// Contact / site settings (เต๊นท์รถ)
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/update/contact:
 *   post:
 *     summary: บันทึกข้อมูลติดต่อ/เต๊นท์รถทั้งก้อน (สาขา, โซเชียล, QR)
 *     tags: [Admin - Contact]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               branches:
 *                 - title: สาขา 1 สาขาบ้านไร่
 *                   place: 191 ม.1 ต.ทัพหลวง อ.บ้านไร่ จ.อุทัยธานี
 *                   tel: ["081-9727551 เจ๊ชมพู่", "098-7536681 นุ้ย"]
 *                   map_link: https://maps.google.com/...
 *               socials:
 *                 - type: facebook
 *                   name: นิรันดร์คาร์เซ็นเตอร์
 *                   link: https://facebook.com/...
 *               line_qr: https://qr-official.line.me/gs/....png
 *     responses:
 *       200:
 *         description: บันทึกสำเร็จ (คืน object ที่บันทึก)
 *       401:
 *         description: ไม่มีสิทธิ์เข้าถึง
 */
router.post('/update/contact', MasterDataController.Contact_Api.update_contact);

module.exports = router;
