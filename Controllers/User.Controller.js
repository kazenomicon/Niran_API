const createError = require('http-errors');
const bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
const { eq } = require('drizzle-orm');
const { db, schema } = require('../database/db');

const users = schema.users;

// รวมสิทธิ์จาก role ของ user (fallback: ADMIN เก่าที่ยังไม่มี role → สิทธิ์เต็ม)
async function getPermissions(user) {
  if (user.role_id) {
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles._id, user.role_id));
    if (role && Array.isArray(role.permissions)) return role.permissions;
  }
  if (user.position === 'ADMIN') return require('../config/permissions').ALL_PERMISSIONS;
  return [];
}

module.exports = {

  user_register: async (req, res, next) => {
    try {
      const body = req.body;
      const [finduser] = await db.select().from(users).where(eq(users.username, body.username));
      if (!finduser) {
        const encryptedPassword = await bcrypt.hash(body.password, 10);
        const date = new Date();
        const [result] = await db.insert(users).values({
          username: body.username,
          password: encryptedPassword,
          position: body.position,
          role_id: body.role_id !== undefined ? Number(body.role_id) : null,
          createDate: date,
          updateDate: date,
        }).returning();
        res.send(result);
      } else {
        res.send({ error: "Invalid User Data" });
      }
    } catch (error) {
      console.log(error.message);
      if (error.code === '23502') {
        next(createError(422, error.message));
        return;
      }
      next(error);
    }
  },

  get_all_user: async (req, res, next) => {
    try {
      const results = await db.select({
        _id: users._id,
        username: users.username,
        email: users.email,
        tel: users.tel,
        position: users.position,
        role_id: users.role_id,
        createDate: users.createDate,
        updateDate: users.updateDate,
      }).from(users);
      res.send(results);
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  user_login: async (req, res, next) => {
    const params = req.body;
    try {
      const [result] = await db.select().from(users).where(eq(users.username, params.username));
      if (result && (await bcrypt.compare(params.password, result.password))) {

        const access_token = jwt.sign(
          { user_id: result._id, user_name: result.username, user_position: result.position },
          process.env.TOKEN_KEY,
          { expiresIn: "7d" }
        );

        const refresh_token = jwt.sign(
          { user_id: result._id },
          process.env.REFRESH_TOKEN_KEY,
          { expiresIn: "30d" }
        );
        // แนบสิทธิ์จาก role ให้ FE ใช้ gate เมนู/ปุ่ม
        result.permissions = await getPermissions(result);
        result.access_token = access_token;
        result.refresh_token = refresh_token;
        res.send({ result, access_token, refresh_token });
      } else {
        throw createError(404, "This username can't login");
      }
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  user_refresh_login: async (req, res, next) => {
    try {
      // user_id comes from the verified refresh token (auth_refreshToken middleware)
      const userId = Number(req.user?.user_id ?? req.body.user_id);
      if (Number.isNaN(userId)) throw createError(400, 'Invalid user id');

      const [result] = await db.select().from(users).where(eq(users._id, userId));
      if (result) {

        const access_token = jwt.sign(
          { user_id: result._id, user_name: result.username, user_position: result.position },
          process.env.TOKEN_KEY,
          { expiresIn: "7d" }
        );

        const refresh_token = jwt.sign(
          { user_id: result._id },
          process.env.REFRESH_TOKEN_KEY,
          { expiresIn: "30d" }
        );
        result.permissions = await getPermissions(result);
        result.access_token = access_token;
        result.refresh_token = refresh_token;
        res.send({ result, access_token, refresh_token });
      } else {
        throw createError(404, "This username can't login");
      }
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  update_user: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid User id'));
      const body = req.body;

      const updates = {};
      for (const k of ['username', 'email', 'tel', 'position']) {
        if (body[k] !== undefined) updates[k] = body[k];
      }
      if (body.role_id !== undefined) updates.role_id = body.role_id === null ? null : Number(body.role_id);
      if (body.password) {
        updates.password = await bcrypt.hash(body.password, 10);
      }
      updates.updateDate = new Date();

      // username must stay unique (allow keeping your own)
      if (body.username) {
        const [existing] = await db.select().from(users).where(eq(users.username, body.username));
        if (existing && existing._id !== id) {
          throw createError(404, "This username can't be used");
        }
      }

      const [result] = await db.update(users).set(updates).where(eq(users._id, id)).returning();
      if (!result) throw createError(404, 'User does not exist');
      res.send(result);
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  // สิทธิ์ของผู้ใช้ที่ล็อกอินอยู่ ณ ปัจจุบัน
  // Dashboard เก็บ permissions ไว้ใน localStorage ตั้งแต่ตอน login เท่านั้น
  // ถ้าแอดมินเปลี่ยน role ให้ทีหลัง ฝั่งหน้าเว็บจะยังใช้ของเก่าจนกว่าจะ login ใหม่
  // (และถ้า localStorage ไม่มีคีย์นี้ เมนูจะหายเกือบหมด) endpoint นี้ให้ดึงของสดมา sync ได้
  get_me: async (req, res, next) => {
    try {
      const userId = Number(req.user?.user_id);
      if (Number.isNaN(userId)) return next(createError(400, 'Invalid user id'));
      const [user] = await db.select().from(users).where(eq(users._id, userId));
      if (!user) return next(createError(404, 'User does not exist.'));

      let role_name = null;
      if (user.role_id) {
        const [role] = await db.select().from(schema.roles).where(eq(schema.roles._id, user.role_id));
        if (role) role_name = role.name;
      }
      res.send({
        _id: user._id,
        username: user.username,
        position: user.position,
        role_id: user.role_id,
        role_name,
        permissions: await getPermissions(user),
      });
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  },

  delete_user: async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return next(createError(400, 'Invalid User id'));
      const [result] = await db.delete(users).where(eq(users._id, id)).returning();
      if (!result) throw createError(404, 'User does not exist.');
      res.send(result);
    } catch (error) {
      console.log(error.message);
      next(error);
    }
  }

};
