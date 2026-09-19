# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start with nodemon (auto-reload on changes)
npm start            # Start production server
npm run db:push      # Push Drizzle schema to Neon (create/sync tables)
npm run db:generate  # Generate SQL migration files from the schema
npm run db:studio    # Open Drizzle Studio
npm run seed         # Create the first ADMIN user (SEED_ADMIN_USER / SEED_ADMIN_PASS)
```

No test, lint, or build scripts are configured.

## Architecture

Express.js REST API following MVC pattern, backed by Neon (serverless Postgres) via Drizzle ORM.

```
Client → Routes → Middleware (JWT auth) → Controllers → Drizzle ORM → Neon Postgres
                                        → Cloudflare R2 (images via Multer + Sharp)
```

**Three route groups mounted in [index.js](index.js):**
- `/api/store` — public read-only car/brand/model browsing ([Routes/Car_Store.route.js](Routes/Car_Store.route.js))
- `/api/user` — login and token refresh ([Routes/User.route.js](Routes/User.route.js))
- `/api/admin` — protected CRUD for all entities ([Routes/Admin.route.js](Routes/Admin.route.js))

## Authentication

Two-token JWT system:
- **Access token** (7 days) — sent as `x-access-token` header or `Authorization`; verified in [middleware/auth.js](middleware/auth.js)
- **Refresh token** (30 days) — exchanged at `POST /api/user/refresh/token` via [middleware/auth_refreshToken.js](middleware/auth_refreshToken.js)
- Admin-only routes additionally check `user_position === "ADMIN"` in [middleware/authAdmin.js](middleware/authAdmin.js)

The first admin must be created with `npm run seed` (the `/api/admin/register` route is itself admin-protected).

## Database (Neon + Drizzle)

- Schema is defined in [database/schema.js](database/schema.js) and the Drizzle client in [database/db.js](database/db.js) using the `@neondatabase/serverless` HTTP driver (`drizzle-orm/neon-http`). The driver is stateless HTTP — no connection pooling/caching middleware is needed.
- Drizzle Kit config lives in [drizzle.config.js](drizzle.config.js). Run `npm run db:push` to create tables in Neon.
- **Primary keys:** every table uses a Postgres `serial` column named `id` in the DB, but it is exposed in JS/JSON as `_id` (see the `_id: serial('id')` mapping in the schema) so API responses keep the same shape as the old Mongo `_id`. Route params are integer ids (`Number(req.params.id)`), not ObjectId strings.
- **Flexible fields** are stored as `jsonb`: `car_store.cars_detail`, `car_store.cars_image`, `car_store.cars_subdetail`, `master_model.model_submodel`, `master_model.model_image`. Controllers `JSON.parse` these from multipart form fields before inserting.

## Data Models

| Table | Schema | Notes |
|-------|--------|-------|
| `users` | [database/schema.js](database/schema.js) | `position`: `"ADMIN"` or `""` |
| `car_store` | [database/schema.js](database/schema.js) | `brand_name`/`model_name` denormalized strings; `cars_image[]` (jsonb) holds storage URLs |
| `master_brand` | [database/schema.js](database/schema.js) | Brand name + logo image |
| `master_model` | [database/schema.js](database/schema.js) | `model_submodel[]` (jsonb) |
| `car_data_detail` | [database/schema.js](database/schema.js) | Spec sheet |

## Image Upload Flow

Storage is **Cloudflare R2** (S3-compatible) behind [lib/r2.js](lib/r2.js). Admin routes that handle images use this pipeline:
1. **Multer** (`storage: memoryStorage()`) buffers the file in memory
2. **Sharp** resizes to 1980×1080 JPEG
3. **`r2.put(key, buffer, contentType)`** uploads and returns the public URL
4. That full URL is stored directly in Postgres

`r2.remove(urls)` accepts both R2 and legacy Vercel Blob URLs, so deleting a record still cleans up files that predate the migration. Run [scripts/migrate-blob-to-r2.js](scripts/migrate-blob-to-r2.js) to move old files across (dry-run by default; `--apply` to commit; `--rollback <backup.json>` to undo the DB changes).

Path format inside the bucket: `Category/Default/{random}.{ext}` for default image, `Category/{carId}/{random}.{ext}` for gallery, `Category/Brand/{random}` for brand logo.

**Important:** `cars_image_default`, `cars_image[]`, and `brand_image` fields store **full public URLs** — the frontend uses these values directly as image `src` without constructing URLs.

The upload logic lives in [Controllers/CarStore.Controller.js](Controllers/CarStore.Controller.js) and [Controllers/MasterData.Controller.js](Controllers/MasterData.Controller.js).

## Video Upload Flow (different from images)

Vercel Functions cap request bodies at ~4.5MB, so videos cannot go through the multer→`r2.put()` path used for images. Videos are uploaded **straight from the browser** with a presigned URL:

1. Dashboard `FormEditVideo.js` POSTs to `/api/admin/cars/video/presign/:id`, which returns a **presigned PUT URL** ([Controllers/CarVideo.Controller.js](Controllers/CarVideo.Controller.js))
2. The browser `PUT`s the file **straight to R2**, never passing through this API (XHR is used so the progress bar works)
3. The browser then POSTs the resulting URL to `/api/admin/update/cars/video/:id`, persisting it in `car_store.cars_video` — a jsonb array of `{url, name, size, uploadedAt}`

All three routes sit behind the normal `auth` middleware and require `cars.edit`. `attach_car_video` re-checks the object with `HeadObject` rather than trusting the size the browser reported, and rejects any URL that is not under that car's own `Category/{id}/video/` prefix.

The bucket needs a **CORS policy allowing `PUT`** from the dashboard origin, or step 2 fails in the browser.

Limits (200MB/file; `video/mp4`, `video/quicktime`, `video/webm`) are enforced server-side when presigning and again on attach; the Dashboard mirrors them only for a friendlier error.

Bucket path format: `Category/{carId}/video/{random}.{ext}`.

## Vercel Deployment

Configured for Vercel serverless via [vercel.json](vercel.json). Key patterns:
- The Neon HTTP driver is stateless, so there is no connection to cache across warm instances — queries just work per-invocation.
- `app.listen` only runs locally (`require.main === module`); Vercel uses the exported `app`
- Swagger UI available at `/api-docs`
- After provisioning Neon (Vercel Marketplace), `DATABASE_URL` is auto-injected. Run `npm run db:push` once (locally, pointed at the same `DATABASE_URL`) to create the tables.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (local only) |
| `DATABASE_URL` | Neon Postgres connection string (pooled) |
| `TOKEN_KEY` | JWT signing secret |
| `REFRESH_TOKEN_KEY` | Refresh token signing secret |
| `R2_ACCOUNT_ID` / `R2_BUCKET` | Cloudflare R2 bucket identity |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token (Object Read & Write) |
| `R2_PUBLIC_BASE_URL` | Public base URL for serving files (r2.dev or custom domain) |
| `BLOB_READ_WRITE_TOKEN` | Legacy Vercel Blob — only for migrating/cleaning up old files |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASS` | Optional — credentials for `npm run seed` |
