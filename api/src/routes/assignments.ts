import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { notifyUsers, getStudentAndGuardianIdsForClass } from '../lib/notify';

export const assignmentRoutes = new Hono<{ Bindings: Env }>();

assignmentRoutes.post('/', authMiddleware, requireRole('teacher', 'admin'), async (c) => {
  const teacherId = c.get('userId');
  const body = await c.req.json().catch(() => ({}));

  if (!body.classId || !body.title) {
    return c.json({ ok: false, error: 'classId و title الزامی هستند.' }, 400);
  }

  const classRow: any = await c.env.DB.prepare(
    `
      SELECT id
      FROM classes
      WHERE id = ?
        AND teacher_id = ?
    `
  )
    .bind(body.classId, teacherId)
    .first();

  if (!classRow) {
    return c.json({ ok: false, error: 'کلاس معتبر نیست.' }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `
      INSERT INTO assignments (
        id,
        class_id,
        subject_id,
        teacher_id,
        title,
        description,
        due_at,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `
  )
    .bind(
      id,
      body.classId,
      body.subjectId ?? null,
      teacherId,
      body.title,
      body.description ?? null,
      body.dueAt ?? null
    )
    .run();

  return c.json({
    ok: true,
    id,
  });
});

assignmentRoutes.post('/:id/publish', authMiddleware, requireRole('teacher', 'admin'), async (c) => {
  const teacherId = c.get('userId');
  const assignmentId = c.req.param('id');

  const result = await c.env.DB.prepare(
    `
      UPDATE assignments
      SET status = 'published',
          updated_at = datetime('now')
      WHERE id = ?
        AND teacher_id = ?
    `
  )
    .bind(assignmentId, teacherId)
    .run();

  if (!result.meta.changes) {
    return c.json({ ok: false, error: 'تکلیف پیدا نشد.' }, 404);
  }

  const assignment: any = await c.env.DB.prepare(
    `
      SELECT class_id, title
      FROM assignments
      WHERE id = ?
    `
  )
    .bind(assignmentId)
    .first();

  if (assignment) {
    const recipientIds = await getStudentAndGuardianIdsForClass(
      c.env,
      assignment.class_id
    );

    await notifyUsers(
      c.env,
      recipientIds,
      'تکلیف جدید منتشر شد',
      assignment.title
    );
  }

  return c.json({
    ok: true,
  });
});

assignmentRoutes.get('/class/:classId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const role = c.get('role');
  const classId = c.req.param('classId');

  if (role === 'teacher' || role === 'admin') {
    const classRow: any = await c.env.DB.prepare(
      `
        SELECT id
        FROM classes
        WHERE id = ?
          AND teacher_id = ?
      `
    )
      .bind(classId, userId)
      .first();

    if (!classRow) {
      return c.json({ ok: false, error: 'دسترسی به این کلاس وجود ندارد.' }, 403);
    }

    const result = await c.env.DB.prepare(
      `
        SELECT *
        FROM assignments
        WHERE class_id = ?
        ORDER BY created_at DESC
      `
    )
      .bind(classId)
      .all();

    return c.json({ ok: true, assignments: result.results });
  }

  const canView: any = await c.env.DB.prepare(
    `
      SELECT 1 AS ok
      FROM class_students cs
      WHERE cs.class_id = ?
        AND cs.student_id = ?

      UNION

      SELECT 1 AS ok
      FROM class_students cs
      JOIN parent_student ps ON ps.student_id = cs.student_id
      WHERE cs.class_id = ?
        AND ps.parent_id = ?

      LIMIT 1
    `
  )
    .bind(classId, userId, classId, userId)
    .first();

  if (!canView) {
    return c.json({ ok: false, error: 'دسترسی به این کلاس وجود ندارد.' }, 403);
  }

  const result = await c.env.DB.prepare(
    `
      SELECT *
      FROM assignments
      WHERE class_id = ?
        AND status = 'published'
      ORDER BY created_at DESC
    `
  )
    .bind(classId)
    .all();

  return c.json({ ok: true, assignments: result.results });
});
