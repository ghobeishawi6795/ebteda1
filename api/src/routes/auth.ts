import { Hono } from 'hono';
import { SignJWT } from 'jose';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/request-otp', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phone = body?.phone as string;

  if (!phone || !/^09\d{9}$/.test(phone)) {
    return c.json({ ok: false, error: 'شماره موبایل معتبر نیست.' }, 400);
  }

  const rateKey = `rate:${phone}`;
  const rateExists = await c.env.OTP.get(rateKey);

  if (rateExists) {
    return c.json({ ok: false, error: 'لطفاً کمی صبر کنید.' }, 429);
  }

  await c.env.OTP.put(rateKey, '1', {
    expirationTtl: 120,
  });

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  await c.env.OTP.put(`otp:${phone}`, code, {
    expirationTtl: 300,
  });

  if (c.env.SMS_PROVIDER === 'mock') {
    console.log(`OTP for ${phone}: ${code}`);
  }

  return c.json({
    ok: true,
    message: 'کد ارسال شد.',
  });
});

authRoutes.post('/verify-otp', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phone = body?.phone as string;
  const code = body?.code as string;
  const name = body?.name as string | undefined;

  if (!phone || !code) {
    return c.json({ ok: false, error: 'شماره و کد الزامی است.' }, 400);
  }

  const savedCode = await c.env.OTP.get(`otp:${phone}`);

  if (!savedCode || savedCode !== code) {
    return c.json({ ok: false, error: 'کد اشتباه است یا منقضی شده.' }, 400);
  }

  await c.env.OTP.delete(`otp:${phone}`);

  let user: any = await c.env.DB.prepare(
    `
      SELECT *
      FROM users
      WHERE phone = ?
        AND is_active = 1
    `
  )
    .bind(phone)
    .first();

  if (!user) {
    const id = crypto.randomUUID();
    const parts = (name || 'کاربر جدید').split(' ');
    const firstName = parts[0] || 'کاربر';
    const lastName = parts.slice(1).join(' ') || 'جدید';

    await c.env.DB.prepare(
      `
        INSERT INTO users (
          id,
          first_name,
          last_name,
          role,
          phone
        )
        VALUES (?, ?, ?, 'parent', ?)
      `
    )
      .bind(id, firstName, lastName, phone)
      .run();

    user = await c.env.DB.prepare(
      `
        SELECT *
        FROM users
        WHERE phone = ?
      `
    )
      .bind(phone)
      .first();
  }

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);

  const token = await new SignJWT({
    role: user.role,
    phone: user.phone,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime('7d')
    .sign(secret);

  return c.json({
    ok: true,
    token,
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      phone: user.phone,
    },
  });
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');

  const user: any = await c.env.DB.prepare(
    `
      SELECT id, first_name, last_name, role, phone
      FROM users
      WHERE id = ?
        AND is_active = 1
    `
  )
    .bind(userId)
    .first();

  if (!user) {
    return c.json({ ok: false, error: 'کاربر یافت نشد.' }, 404);
  }

  return c.json({
    ok: true,
    user,
  });
});
