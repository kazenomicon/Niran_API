/**
 * ย้ายไฟล์รูป/วิดีโอ/เอกสาร จาก Vercel Blob -> Cloudflare R2
 * แล้วแก้ URL ที่เก็บไว้ในฐานข้อมูลให้ชี้ที่ใหม่
 *
 *   node scripts/migrate-blob-to-r2.js            # dry-run (ไม่เขียนอะไรเลย)
 *   node scripts/migrate-blob-to-r2.js --apply    # ทำจริง
 *   node scripts/migrate-blob-to-r2.js --rollback <backup.json>
 *
 * ปลอดภัย:
 *  - dry-run เป็นค่าเริ่มต้น
 *  - สำรอง URL เดิมทุกคอลัมน์ลงไฟล์ก่อนเขียน DB (ใช้ย้อนกลับได้)
 *  - ไม่ลบไฟล์ต้นทางบน Vercel Blob (เก็บไว้เป็น fallback)
 *  - รันซ้ำได้ ไฟล์ที่ย้ายแล้วจะถูกข้าม
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const r2 = require('../lib/r2');

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes('--apply');
const ROLLBACK_IDX = process.argv.indexOf('--rollback');
const CONCURRENCY = 6;

const isBlob = (u) => r2.isVercelBlobUrl(u);
/** ดึง path จาก blob URL มาใช้เป็น key ของ R2 เพื่อคงโครงสร้างโฟลเดอร์เดิม */
const keyFor = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

/** อ่าน URL ทั้งหมดที่ระบบเก็บไว้ พร้อมตำแหน่งที่มันอยู่ */
async function collect() {
  const cars = await sql`SELECT id, cars_image_default, cars_image, cars_video FROM car_store ORDER BY id`;
  const brands = await sql`SELECT id, brand_image FROM master_brand ORDER BY id`;
  const docs = await sql`SELECT id, blob_url FROM documents ORDER BY id`;
  const refs = [];
  for (const c of cars) {
    if (c.cars_image_default) refs.push({ t: 'car_default', id: c.id, url: c.cars_image_default });
    (Array.isArray(c.cars_image) ? c.cars_image : []).forEach((u, i) =>
      u && refs.push({ t: 'car_gallery', id: c.id, i, url: u }));
    (Array.isArray(c.cars_video) ? c.cars_video : []).forEach((v, i) =>
      v?.url && refs.push({ t: 'car_video', id: c.id, i, url: v.url }));
  }
  for (const b of brands) if (b.brand_image) refs.push({ t: 'brand', id: b.id, url: b.brand_image });
  for (const d of docs) if (d.blob_url) refs.push({ t: 'doc', id: d.id, url: d.blob_url });
  return { cars, brands, docs, refs };
}

async function rollback(file) {
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('ย้อนกลับจาก', file, '—', bk.cars.length, 'รถ,', bk.brands.length, 'ยี่ห้อ,', bk.docs.length, 'เอกสาร');
  for (const c of bk.cars) {
    await sql`UPDATE car_store SET cars_image_default=${c.cars_image_default},
      cars_image=${JSON.stringify(c.cars_image)}::jsonb, cars_video=${JSON.stringify(c.cars_video)}::jsonb
      WHERE id=${c.id}`;
  }
  for (const b of bk.brands) await sql`UPDATE master_brand SET brand_image=${b.brand_image} WHERE id=${b.id}`;
  for (const d of bk.docs) await sql`UPDATE documents SET blob_url=${d.blob_url} WHERE id=${d.id}`;
  console.log('ย้อนกลับ URL ในฐานข้อมูลเรียบร้อย (ไฟล์บน R2 ไม่ได้ลบ)');
}

(async () => {
  if (ROLLBACK_IDX !== -1) return rollback(process.argv[ROLLBACK_IDX + 1]);
  if (!r2.isConfigured()) throw new Error('R2 env ไม่ครบ');

  const { cars, brands, docs, refs } = await collect();
  const todo = refs.filter((r) => isBlob(r.url));
  const already = refs.filter((r) => r2.isR2Url(r.url));
  const other = refs.filter((r) => !isBlob(r.url) && !r2.isR2Url(r.url));

  console.log(`พบ URL ทั้งหมด ${refs.length} รายการ`);
  console.log(`  ต้องย้าย (Vercel Blob) : ${todo.length}`);
  console.log(`  อยู่บน R2 แล้ว          : ${already.length}`);
  if (other.length) console.log(`  ไม่รู้จัก (ข้าม)        : ${other.length}`);
  const byType = {};
  todo.forEach((r) => (byType[r.t] = (byType[r.t] || 0) + 1));
  console.log('  แยกตามประเภท:', JSON.stringify(byType));

  if (!todo.length) return console.log('\nไม่มีอะไรต้องย้าย');
  if (!APPLY) {
    console.log('\n[DRY-RUN] ยังไม่เขียนอะไร — ตัวอย่าง 3 รายการแรก:');
    todo.slice(0, 3).forEach((r) => console.log(`  ${r.t}#${r.id}\n    เดิม: ${r.url}\n    ใหม่: ${r2.publicUrl(keyFor(r.url))}`));
    return console.log('\nสั่งจริงด้วย: node scripts/migrate-blob-to-r2.js --apply');
  }

  // สำรองก่อนแตะ DB
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(__dirname, '..', `_r2-migration-backup-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ cars, brands, docs }, null, 2));
  console.log('\nสำรอง URL เดิมไว้ที่:', backupFile);

  // คัดลอกไฟล์
  console.log(`\nกำลังคัดลอก ${todo.length} ไฟล์ (พร้อมกันครั้งละ ${CONCURRENCY})...`);
  let ok = 0, fail = 0;
  const map = new Map();
  await mapLimit(todo, CONCURRENCY, async (ref) => {
    const key = keyFor(ref.url);
    try {
      const res = await fetch(ref.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || 'application/octet-stream';
      const newUrl = await r2.put(key, buf, ct);
      map.set(ref.url, newUrl);
      if (++ok % 50 === 0) console.log(`  ...${ok}/${todo.length}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${ref.t}#${ref.id} ${key} -> ${e.message}`);
    }
  });
  console.log(`คัดลอกสำเร็จ ${ok} / ล้มเหลว ${fail}`);
  if (!ok) return console.log('ไม่มีไฟล์ย้ายสำเร็จ ยกเลิกการแก้ฐานข้อมูล');

  // แก้ URL ในฐานข้อมูล (เฉพาะแถวที่เปลี่ยนจริง)
  console.log('\nกำลังแก้ URL ในฐานข้อมูล...');
  const sub = (u) => (u && map.get(u)) || u;
  let rows = 0;
  for (const c of cars) {
    const d = sub(c.cars_image_default);
    const g = (Array.isArray(c.cars_image) ? c.cars_image : []).map(sub);
    const v = (Array.isArray(c.cars_video) ? c.cars_video : []).map((x) => (x?.url ? { ...x, url: sub(x.url) } : x));
    const changed = d !== c.cars_image_default
      || JSON.stringify(g) !== JSON.stringify(c.cars_image || [])
      || JSON.stringify(v) !== JSON.stringify(c.cars_video || []);
    if (!changed) continue;
    await sql`UPDATE car_store SET cars_image_default=${d},
      cars_image=${JSON.stringify(g)}::jsonb, cars_video=${JSON.stringify(v)}::jsonb WHERE id=${c.id}`;
    rows++;
  }
  for (const b of brands) {
    const n = sub(b.brand_image);
    if (n === b.brand_image) continue;
    await sql`UPDATE master_brand SET brand_image=${n} WHERE id=${b.id}`; rows++;
  }
  for (const d of docs) {
    const n = sub(d.blob_url);
    if (n === d.blob_url) continue;
    await sql`UPDATE documents SET blob_url=${n} WHERE id=${d.id}`; rows++;
  }
  console.log(`อัปเดต ${rows} แถว`);
  console.log(`\nเสร็จแล้ว — ถ้าผิดพลาดย้อนกลับด้วย:\n  node scripts/migrate-blob-to-r2.js --rollback ${backupFile}`);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
