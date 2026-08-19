import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';
import type { Env } from '../types';

type AuthVariables = {
  userId: string;
  role: string;
  phone?: string;
};

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const header = c.req.header('Authorization');

  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const token = header.replace('Bearer ', '');

  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    if (!payload.sub) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    c.set('userId', payload.sub as string);
    c.set('role', payload.role as string);
    c.set('phone', payload.phone as string | undefined);

    await next();
  } catch {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }
});

export const requireRole = (...roles: string[]) =>
  createMiddleware<{
    Bindings: Env;
    Variables: AuthVariables;
  }>(async (c, next) => {
    const role = c.get('role');

    if (!role || !roles.includes(role)) {
      return c.json({ ok: false, error: 'Forbidden' }, 403);
    }

    await next();
  });
