// ── Cloudflare R2 (S3-compatible) ────────────────────────────────────────────
// ใช้แทน @vercel/blob เพราะ R2 ไม่คิดค่า egress และพื้นที่ฟรีเยอะกว่ามาก
//
// สำคัญ: ระหว่าง/หลังย้าย ฐานข้อมูลอาจมี URL ปนกันทั้งของเก่า (Vercel Blob)
// และของใหม่ (R2) ฟังก์ชันลบจึงต้องรู้จักทั้งสองแบบ ไม่งั้นลบรถแล้วไฟล์เก่าค้างทิ้งไว้
const {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const isConfigured = () => !!(ACCOUNT_ID && BUCKET && PUBLIC_BASE && process.env.R2_ACCESS_KEY_ID);

/** สร้าง public URL จาก key — ต้อง encode ทีละส่วนเพื่อกันชื่อไฟล์ภาษาไทย/มีช่องว่าง */
const publicUrl = (key) => `${PUBLIC_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;

/** แปลง public URL กลับเป็น key (คืน null ถ้าไม่ใช่ URL ของ R2 เรา) */
function keyFromUrl(url) {
  if (!url || !PUBLIC_BASE) return null;
  if (!url.startsWith(`${PUBLIC_BASE}/`)) return null;
  return decodeURIComponent(url.slice(PUBLIC_BASE.length + 1));
}

const isR2Url = (url) => keyFromUrl(url) !== null;
const isVercelBlobUrl = (url) => /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(url || '');

/** อัปโหลด buffer/stream ขึ้น R2 แล้วคืน public URL */
async function put(key, body, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    // ไฟล์รูป/วิดีโอไม่เปลี่ยนเนื้อหา (ชื่อมี random suffix) แคชยาวได้
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return publicUrl(key);
}

/** ลบไฟล์จาก URL (รับได้ทั้ง R2 และ Vercel Blob เก่า, เดี่ยวหรือเป็น array) */
async function remove(urls) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!list.length) return;

  const r2Keys = [];
  const legacy = [];
  for (const u of list) {
    const k = keyFromUrl(u);
    if (k) r2Keys.push(k);
    else if (isVercelBlobUrl(u)) legacy.push(u);
  }

  for (const Key of r2Keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
    } catch (e) {
      console.log('R2 delete failed:', Key, e.message); // ลบไม่ได้ก็ไม่ควรทำให้ทั้ง request ล้ม
    }
  }

  // ไฟล์ที่ยังไม่ได้ย้ายออกจาก Vercel Blob
  if (legacy.length) {
    try {
      const { del } = require('@vercel/blob');
      await del(legacy);
    } catch (e) {
      console.log('Vercel Blob delete failed:', e.message);
    }
  }
}

/** ดึงไฟล์เป็น stream (ใช้ตอนดาวน์โหลดเอกสารผ่าน API เพื่อคุมสิทธิ์) */
async function getStream(url) {
  const Key = keyFromUrl(url);
  if (!Key) return null;
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key }));
  return { stream: out.Body, contentType: out.ContentType, size: out.ContentLength };
}

/** presigned PUT — ให้เบราว์เซอร์อัปไฟล์ใหญ่ (วิดีโอ) ตรงเข้า R2 ไม่ผ่าน API */
async function presignPut(key, contentType, expiresIn = 900) {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn });
  return { uploadUrl, publicUrl: publicUrl(key) };
}

module.exports = {
  s3, BUCKET, PUBLIC_BASE,
  isConfigured, publicUrl, keyFromUrl, isR2Url, isVercelBlobUrl,
  put, remove, getStream, presignPut,
  ListObjectsV2Command,
};
