import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

export const notificationRoutes = new Hono<{ Bindings: Env }>();

notificationRoutes.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');

  const result = await c.env.DB.prepare(
    `
      SELECT *
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `
  )
    .bind(userId)
    .all();

  return c.json({
    ok: true,
    notifications: result.results,
  });
});

notificationRoutes.post('/:id/read', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const notificationId = c.req.param('id');

  await c.env.DB.prepare(
    `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ?
        AND user_id = ?
    `
  )
    .bind(notificationId, userId)
    .run();

  return c.json({
    ok: true,
  });
});

notificationRoutes.post('/read-all', authMiddleware, async (c) => {
  const userId = c.get('userId');

  await c.env.DB.prepare(
    `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ?
    `
  )
    .bind(userId)
    .run();

  return c.json({
    ok: true,
  });
});
