import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const classRoutes = new Hono<{ Bindings: Env }>();

classRoutes.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const role = c.get('role');

  if (role === 'teacher' || role === 'admin') {
    const result = await c.env.DB.prepare(
      `
        SELECT *
        FROM classes
        WHERE teacher_id = ?
          AND is_active = 1
        ORDER BY created_at DESC
      `
    )
      .bind(userId)
      .all();

    return c.json({ ok: true, classes: result.results });
  }

  if (role === 'parent') {
    const result = await c.env.DB.prepare(
      `
        SELECT DISTINCT c.*
        FROM classes c
        JOIN class_students cs ON cs.class_id = c.id
        JOIN parent_student ps ON ps.student_id = cs.student_id
        WHERE ps.parent_id = ?
          AND c.is_active = 1
        ORDER BY c.created_at DESC
      `
    )
      .bind(userId)
      .all();

    return c.json({ ok: true, classes: result.results });
  }

  if (role === 'student') {
    const result = await c.env.DB.prepare(
      `
        SELECT c.*
        FROM classes c
        JOIN class_students cs ON cs.class_id = c.id
        WHERE cs.student_id = ?
          AND c.is_active = 1
        ORDER BY c.created_at DESC
      `
    )
      .bind(userId)
      .all();

    return c.json({ ok: true, classes: result.results });
  }

  return c.json({ ok: true, classes: [] });
});

classRoutes.post('/', authMiddleware, requireRole('teacher', 'admin'), async (c) => {
  const teacherId = c.get('userId');
  const body = await c.req.json().catch(() => ({}));

  if (!body.name) {
    return c.json({ ok: false, error: 'نام کلاس الزامی است.' }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `
      INSERT INTO classes (
        id,
        name,
        grade_level,
        teacher_id,
        academic_year
      )
      VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      id,
      body.name,
      body.gradeLevel ?? null,
      teacherId,
      body.academicYear ?? null
    )
    .run();

  return c.json({
    ok: true,
    id,
  });
});

classRoutes.get('/:id/students', authMiddleware, requireRole('teacher', 'admin'), async (c) => {
  const classId = c.req.param('id');

  const result = await c.env.DB.prepare(
    `
      SELECT u.id, u.first_name, u.last_name
      FROM users u
      JOIN class_students cs ON cs.student_id = u.id
      WHERE cs.class_id = ?
      ORDER BY u.first_name
    `
  )
    .bind(classId)
    .all();

  return c.json({
    ok: true,
    students: result.results,
  });
});

classRoutes.post('/:id/students', authMiddleware, requireRole('teacher', 'admin'), async (c) => {
  const teacherId = c.get('userId');
  const classId = c.req.param('id');

  const classRow: any = await c.env.DB.prepare(
    `
      SELECT *
      FROM classes
      WHERE id = ?
        AND teacher_id = ?
    `
  )
    .bind(classId, teacherId)
    .first();

  if (!classRow) {
    return c.json({ ok: false, error: 'کلاس پیدا نشد.' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));

  if (!body.firstName || !body.lastName) {
    return c.json({ ok: false, error: 'نام و نام خانوادگی دانش‌آموز الزامی است.' }, 400);
  }

  const studentId = crypto.randomUUID();

  await c.env.DB.prepare(
    `
      INSERT INTO users (
        id,
        first_name,
        last_name,
        role,
        phone
      )
      VALUES (?, ?, ?, 'student', NULL)
    `
  )
    .bind(studentId, body.firstName, body.lastName)
    .run();

  await c.env.DB.prepare(
    `
      INSERT INTO class_students (
        class_id,
        student_id
      )
      VALUES (?, ?)
    `
  )
    .bind(classId, studentId)
    .run();

  if (body.parentPhone) {
    let parent: any = await c.env.DB.prepare(
      `
        SELECT id
        FROM users
        WHERE phone = ?
      `
    )
      .bind(body.parentPhone)
      .first();

    let parentId = parent?.id;

    if (!parentId) {
      parentId = crypto.randomUUID();

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
        .bind(parentId, 'والدین', body.lastName || '', body.parentPhone)
        .run();
    }

    await c.env.DB.prepare(
      `
        INSERT OR IGNORE INTO parent_student (
          parent_id,
          student_id
        )
        VALUES (?, ?)
      `
    )
      .bind(parentId, studentId)
      .run();
  }

  return c.json({
    ok: true,
    studentId,
  });
});
