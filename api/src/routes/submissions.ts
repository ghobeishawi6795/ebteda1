import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { notifyUsers } from '../lib/notify';

export const submissionRoutes = new Hono<{ Bindings: Env }>();

submissionRoutes.post('/assignments/:assignmentId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const role = c.get('role');
  const assignmentId = c.req.param('assignmentId');

  const body = await c.req.json().catch(() => ({}));
  const studentId = body?.studentId as string;
  const textContent = body?.textContent as string | undefined;

  if (!studentId) {
    return c.json({ ok: false, error: 'studentId الزامی است.' }, 400);
  }

  if (role === 'parent') {
    const link: any = await c.env.DB.prepare(
      `
        SELECT 1
        FROM parent_student
        WHERE parent_id = ?
          AND student_id = ?
      `
    )
      .bind(userId, studentId)
      .first();

    if (!link) {
      return c.json({ ok: false, error: 'این دانش‌آموز به حساب شما متصل نیست.' }, 403);
    }
  } else if (role === 'student') {
    if (userId !== studentId) {
      return c.json({ ok: false, error: 'دسترسی غیرمجاز است.' }, 403);
    }
  } else {
    return c.json({ ok: false, error: 'فقط والدین یا دانش‌آموز می‌توانند تکلیف ارسال کنند.' }, 403);
  }

  const assignment: any = await c.env.DB.prepare(
    `
      SELECT *
      FROM assignments
      WHERE id = ?
        AND status = 'published'
    `
  )
    .bind(assignmentId)
    .first();

  if (!assignment) {
    return c.json({ ok: false, error: 'تکلیف پیدا نشد.' }, 404);
  }

  const studentInClass: any = await c.env.DB.prepare(
    `
      SELECT cs.student_id
      FROM class_students cs
      JOIN assignments a ON a.class_id = cs.class_id
      WHERE a.id = ?
        AND cs.student_id = ?
    `
  )
    .bind(assignmentId, studentId)
    .first();

  if (!studentInClass) {
    return c.json({ ok: false, error: 'دانش‌آموز در کلاس این تکلیف ثبت نشده است.' }, 403);
  }

  const isLate = assignment.due_at && new Date(assignment.due_at) < new Date();

  const status = isLate ? 'late_submitted' : 'submitted';
  const submissionId = crypto.randomUUID();

  await c.env.DB.prepare(
    `
      INSERT INTO submissions (
        id,
        assignment_id,
        student_id,
        submitted_by_user_id,
        text_content,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(assignment_id, student_id) DO UPDATE SET
        text_content = excluded.text_content,
        status = excluded.status,
        updated_at = datetime('now')
    `
  )
    .bind(
      submissionId,
      assignmentId,
      studentId,
      userId,
      textContent ?? null,
      status
    )
    .run();

  await notifyUsers(
    c.env,
    [assignment.teacher_id],
    'ارسال جدید تکلیف',
    assignment.title
  );

  return c.json({
    ok: true,
    submissionId,
    status,
  });
});

submissionRoutes.get('/assignments/:assignmentId', authMiddleware, requireRole('teacher', 'admin'), async (c) => {
  const teacherId = c.get('userId');
  const assignmentId = c.req.param('assignmentId');

  const assignment: any = await c.env.DB.prepare(
    `
      SELECT a.id
      FROM assignments a
      JOIN classes c ON c.id = a.class_id
      WHERE a.id = ?
        AND c.teacher_id = ?
    `
  )
    .bind(assignmentId, teacherId)
    .first();

  if (!assignment) {
    return c.json({ ok: false, error: 'تکلیف پیدا نشد.' }, 404);
  }

  const result = await c.env.DB.prepare(
    `
      SELECT
        s.*,
        u.first_name || ' ' || u.last_name AS student_name
      FROM submissions s
      JOIN users u ON u.id = s.student_id
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at DESC
    `
  )
    .bind(assignmentId)
    .all();

  return c.json({
    ok: true,
    submissions: result.results,
  });
});
