import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { canAccessRelatedRecord } from '../lib/notify';

export const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const role = c.get('role');

  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return c.json({ ok: false, error: 'فایل ارسال نشده است.' }, 400);
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm',
    'application/pdf',
  ];

  if (!allowedTypes.includes(file.type)) {
    return c.json({ ok: false, error: 'نوع فایل مجاز نیست.' }, 400);
  }

  const maxSize = 2 * 1024 * 1024;

  if (file.size > maxSize) {
    return c.json({ ok: false, error: 'حجم فایل نباید بیشتر از ۲ مگابایت باشد.' }, 400);
  }

  const relatedType = formData.get('relatedType') as string;
  const relatedId = formData.get('relatedId') as string;

  if (!relatedType || !relatedId) {
    return c.json({ ok: false, error: 'relatedType و relatedId الزامی هستند.' }, 400);
  }

  if (!['assignment', 'submission', 'feedback'].includes(relatedType)) {
    return c.json({ ok: false, error: 'relatedType معتبر نیست.' }, 400);
  }

  const hasAccess = await canAccessRelatedRecord(
    c.env,
    userId,
    role,
    relatedType as 'assignment' | 'submission' | 'feedback',
    relatedId
  );

  if (!hasAccess) {
    return c.json({ ok: false, error: 'دسترسی به این مورد ندارید.' }, 403);
  }

  const data = await file.arrayBuffer();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `
      INSERT INTO files (
        id,
        related_type,
        related_id,
        uploaded_by,
        file_name,
        content_type,
        size,
        data,
        storage_provider
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'd1')
    `
  )
    .bind(
      id,
      relatedType,
      relatedId,
      userId,
      file.name,
      file.type,
      file.size,
      data
    )
    .run();

  return c.json({
    ok: true,
    fileId: id,
    url: `/api/files/${id}`,
  });
});

fileRoutes.get('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const role = c.get('role');
  const fileId = c.req.param('id');

  const file: any = await c.env.DB.prepare(
    `
      SELECT data, content_type, file_name, related_type, related_id, uploaded_by
      FROM files
      WHERE id = ?
    `
  )
    .bind(fileId)
    .first();

  if (!file || !file.data) {
    return c.json({ ok: false, error: 'فایل پیدا نشد.' }, 404);
  }

  const isUploader = file.uploaded_by === userId;

  const hasAccess =
    isUploader ||
    (await canAccessRelatedRecord(
      c.env,
      userId,
      role,
      file.related_type,
      file.related_id
    ));

  if (!hasAccess) {
    return c.json({ ok: false, error: 'دسترسی به این فایل ندارید.' }, 403);
  }

  const body = new Uint8Array(file.data as ArrayBuffer);

  return c.body(body, 200, {
    'Content-Type': file.content_type || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  });
});
