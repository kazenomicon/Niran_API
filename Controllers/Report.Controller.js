const { eq } = require('drizzle-orm');
const createError = require('http-errors');
const { db, schema } = require('../database/db');

// วันที่ที่ถือว่า "รถเข้าสต๊อก" — ใช้วันที่รถเข้าที่แอดมินกรอก ถ้าไม่มีก็ใช้วันที่สร้างรายการ
const inDate = (c) => c.import_date || c.createDate;
// วันที่ที่ถือว่า "ตัดออกจากสต๊อก"
const outDate = (c) => c.soldDate;
const ym = (d) => (d ? new Date(d).toISOString().slice(0, 7) : null);

// สรุปภาพรวมธุรกิจ (ต้องมีสิทธิ์ reports.view — เห็นตัวเลขการเงิน)
module.exports = {
  // ── สต๊อกรายเดือน: ยกมา + ซื้อเข้า - ขายออก = คงเหลือ ──
  // คำนวณจากข้อมูลจริง แต่คีทับได้ทุกช่อง เพราะรถเก่าหลายคันไม่มีวันที่รถเข้า/วันที่ขาย
  get_stock_month: async (req, res, next) => {
    try {
      const month = String(req.query.month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) return next(createError(422, 'month ต้องอยู่ในรูปแบบ YYYY-MM'));

      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);

      const cars = await db.select().from(schema.carStore);
      const expenses = await db.select().from(schema.expenses);

      const brief = (c) => ({
        _id: c._id, intake_no: c.intake_no, title: c.cars_title, plate: c.license_plate,
        branch: c.branch, status: c.cars_status,
        in_date: inDate(c), out_date: outDate(c),
        cost_price: c.cost_price, sale_price: c.sale_price,
      });

      const opening = [], purchased = [], soldOut = [], closing = [];
      const noInDate = [], soldNoDate = [];

      for (const c of cars) {
        const din = inDate(c);
        const dout = outDate(c);
        const isSold = c.cars_status === 'SOLD';

        if (!c.import_date) noInDate.push(brief(c));
        if (isSold && !dout) soldNoDate.push(brief(c));

        // เข้าสต๊อกก่อนต้นเดือน และยังไม่ถูกตัดออกก่อนต้นเดือน
        if (din && new Date(din) < start && (!dout || new Date(dout) >= start)) opening.push(brief(c));
        if (din && new Date(din) >= start && new Date(din) < end) purchased.push(brief(c));
        if (dout && new Date(dout) >= start && new Date(dout) < end) soldOut.push(brief(c));
        if (din && new Date(din) < end && (!dout || new Date(dout) >= end)) closing.push(brief(c));
      }

      // ค่าใช้จ่ายที่ลงในเดือนนี้
      const monthExpenses = expenses.filter((e) => {
        const d = e.expense_date || e.createDate;
        return d && new Date(d) >= start && new Date(d) < end;
      });
      const expenseTotal = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const expenseByCar = {};
      for (const e of monthExpenses) {
        expenseByCar[e.car_id] = (expenseByCar[e.car_id] || 0) + (e.amount || 0);
      }

      // ค่าที่คีทับเอง (ถ้ามี)
      const [override] = await db.select().from(schema.stockMonths).where(eq(schema.stockMonths.month, month));

      const auto = { opening: opening.length, in: purchased.length, out: soldOut.length };
      const eff = {
        opening: override?.opening_override ?? auto.opening,
        in: override?.in_override ?? auto.in,
        out: override?.out_override ?? auto.out,
      };
      const sum = (list, k) => list.reduce((s, c) => s + (c[k] || 0), 0);

      res.send({
        month,
        // ตัวเลขที่ใช้จริง (คีทับแล้วถ้ามี) + ตัวเลขที่ระบบคำนวณได้ ไว้เทียบกัน
        summary: {
          opening: eff.opening,
          purchased_in: eff.in,
          total: eff.opening + eff.in,
          sold_out: eff.out,
          closing: eff.opening + eff.in - eff.out,
        },
        auto_calculated: { ...auto, closing: auto.opening + auto.in - auto.out, closing_verify: closing.length },
        override: override
          ? { opening: override.opening_override, in: override.in_override, out: override.out_override, note: override.note }
          : null,
        value: {
          opening_cost: sum(opening, 'cost_price'),
          purchased_cost: sum(purchased, 'cost_price'),
          sold_revenue: sum(soldOut, 'sale_price'),
          closing_cost: sum(closing, 'cost_price'),
          expenses: expenseTotal,
        },
        lists: { opening, purchased, sold_out: soldOut, closing },
        expenses: { total: expenseTotal, count: monthExpenses.length, by_car: expenseByCar },
        // จุดที่ข้อมูลไม่ครบ -> ตัวเลขอัตโนมัติอาจคลาด ให้คีทับ
        data_gaps: {
          cars_without_in_date: noInDate.length,
          sold_without_out_date: soldNoDate.length,
          cars_without_cost: cars.filter((c) => c.cost_price == null).length,
          total_cars: cars.length,
          samples: { no_in_date: noInDate.slice(0, 10), sold_no_date: soldNoDate.slice(0, 10) },
        },
      });
    } catch (error) { console.log(error.message); next(error); }
  },

  // คีตัวเลขสต๊อกเอง (ทับค่าที่ระบบคำนวณ) — ส่ง null เพื่อกลับไปใช้ค่าอัตโนมัติ
  save_stock_month: async (req, res, next) => {
    try {
      const month = String(req.body.month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) return next(createError(422, 'month ต้องอยู่ในรูปแบบ YYYY-MM'));
      const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
      const values = {
        month,
        opening_override: num(req.body.opening_override),
        in_override: num(req.body.in_override),
        out_override: num(req.body.out_override),
        note: req.body.note || null,
        updated_by: req.user ? Number(req.user.user_id) : null,
        updateDate: new Date(),
      };
      const [existing] = await db.select().from(schema.stockMonths).where(eq(schema.stockMonths.month, month));
      const [row] = existing
        ? await db.update(schema.stockMonths).set(values).where(eq(schema.stockMonths._id, existing._id)).returning()
        : await db.insert(schema.stockMonths).values(values).returning();
      res.send(row);
    } catch (error) { console.log(error.message); next(error); }
  },

  get_summary: async (req, res, next) => {
    try {
      const now = new Date();
      const cars = await db.select().from(schema.carStore);

      let stockCount = 0, stockCost = 0, stockSale = 0;
      let soldCount = 0, revenue = 0, profit = 0, reservedCount = 0;
      let intakeCount = 0, intakeCost = 0;
      const statusBreakdown = {};
      const brandCount = {};
      const aging = [];

      for (const c of cars) {
        const st = c.cars_status || 'SELL';
        statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
        brandCount[c.brand_name] = (brandCount[c.brand_name] || 0) + 1;

        if (st === 'SOLD') {
          soldCount++;
          if (c.sale_price != null) revenue += c.sale_price;
          if (c.sale_price != null && c.cost_price != null) profit += c.sale_price - c.cost_price;
        } else if (st === 'SELL') {
          // พร้อมขาย
          stockCount++;
          if (c.cost_price != null) stockCost += c.cost_price;
          if (c.sale_price != null) stockSale += c.sale_price;
          // นับอายุสต๊อกจากวันที่รถเข้า (ถ้า admin กรอก) ไม่งั้นใช้วันที่สร้าง
          const since = c.import_date || c.createDate;
          if (since) {
            const days = Math.floor((now.getTime() - new Date(since).getTime()) / 86400000);
            if (days >= 90) aging.push({ _id: c._id, title: c.cars_title, days });
          }
        } else if (st === 'INTAKE') {
          // รับเข้ามาแล้วแต่ยังไม่พร้อมขาย — เป็นเงินจมเหมือนกัน แต่ไม่ใช่สต๊อกที่ขายได้
          intakeCount++;
          if (c.cost_price != null) intakeCost += c.cost_price;
        } else {
          // จอง/RESERVE/อื่น ๆ
          reservedCount++;
        }
      }

      const by_brand = Object.entries(brandCount)
        .map(([brand, count]) => ({ brand, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      aging.sort((a, b) => b.days - a.days);

      // นับแจ้งเตือนภาษีรถที่ใกล้ครบ (<=30 วัน) เพื่อโชว์ในรายงาน
      let taxDueCount = 0;
      for (const c of cars) {
        if (c.tax_expiry) {
          const dl = Math.ceil((new Date(c.tax_expiry).getTime() - now.getTime()) / 86400000);
          if (dl <= 30) taxDueCount++;
        }
      }

      res.send({
        totalCars: cars.length,
        stock: { count: stockCount, value_cost: stockCost, value_sale: stockSale },
        sold: { count: soldCount, revenue, profit },
        reserved: { count: reservedCount },
        intake: { count: intakeCount, value_cost: intakeCost },
        status_breakdown: statusBreakdown,
        by_brand,
        aging: aging.slice(0, 10),
        aging_count: aging.length,
        tax_due_count: taxDueCount,
      });
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },
};
