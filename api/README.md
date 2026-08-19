# Homework API (مکتب)

## نصب و اجرا روی Cloudflare

1. نصب پکیج‌ها:
   ```
   npm install
   ```

2. لاگین به Cloudflare:
   ```
   npx wrangler login
   ```

3. ساخت دیتابیس D1:
   ```
   npx wrangler d1 create homework-db
   ```
   خروجی این دستور یک `database_id` می‌دهد — آن را در `wrangler.toml` جای `PASTE_YOUR_D1_DATABASE_ID` بگذارید.

4. ساخت KV namespace (برای OTP):
   ```
   npx wrangler kv namespace create OTP
   ```
   `id` خروجی را در `wrangler.toml` جای `PASTE_YOUR_KV_ID` بگذارید.

5. اجرای اسکیمای دیتابیس:
   ```
   npx wrangler d1 execute homework-db --remote --file=./db/schema.sql
   npx wrangler d1 execute homework-db --remote --file=./db/seed.sql
   ```

6. تنظیم JWT secret به‌صورت امن (به‌جای مقدار .dev.vars):
   ```
   npx wrangler secret put JWT_SECRET
   ```

7. اجرای محلی برای تست:
   ```
   npm run dev
   ```

8. دیپلوی روی Cloudflare:
   ```
   npm run deploy
   ```

## نکات
- فایل `.dev.vars` فقط برای تست محلی است؛ در `wrangler secret put` مقدار واقعی JWT_SECRET را ست کنید.
- `SMS_PROVIDER=mock` یعنی کد OTP فقط در لاگ (`wrangler tail`) چاپ می‌شود؛ برای پیامک واقعی باید provider واقعی وصل کنید.
- فایل‌ها (عکس/صدا/پی‌دی‌اف) فعلاً داخل جدول `files` در D1 به‌صورت BLOB ذخیره می‌شوند (بدون R2)، با محدودیت حجم ۲ مگابایت.
