import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { notifyUsers, getGuardianIdsForStudent } from '../lib/notify';

export const feedbackRoutes = new Hono<{ Bindings: Env }>();

feedbackRoutes.post('/submissions/:submissionId', authMiddleware, requireRole('teacher', 'admin'), async (c) => {
  const teacherId = c.get('userId');
  const submissionId = c.req.param('submissionId');

  const body = await c.req.json().catch(() => ({}));

  const submission: any = await c.env.DB.prepare(
    `
      SELECT s.id, s.student_id, a.title
      FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = ?
        AND c.teacher_id = ?
    `
  )
    .bind(submissionId, teacherId)
    .first();

  if (!submission) {
    return c.json({ ok: false, error: 'ارسالیه پیدا نشد.' }, 404);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `
      INSERT INTO feedbacks (
        id,
        submission_id,
        teacher_id,
        descriptive_grade,
        comment
      )
      VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      id,
      submissionId,
      teacherId,
      body.descriptiveGrade ?? null,
      body.comment ?? null
    )
    .run();

  await c.env.DB.prepare(
    `
      UPDATE submissions
      SET status = 'reviewed',
          updated_at = datetime('now')
      WHERE id = ?
    `
  )
    .bind(submissionId)
    .run();

  const guardianIds = await getGuardianIdsForStudent(
    c.env,
    submission.student_id
  );

  await notifyUsers(
    c.env,
    [submission.student_id, ...guardianIds],
    'بازخورد جدید ثبت شد',
    submission.title
  );

  return c.json({
    ok: true,
    id,
  });
});
