import type { Env } from '../types';

export async function notifyUsers(
  env: Env,
  userIds: string[],
  title: string,
  body?: string
) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);

  if (uniqueIds.length === 0) {
    return;
  }

  const stmt = env.DB.prepare(
    `
      INSERT INTO notifications (
        id,
        user_id,
        title,
        body,
        type
      )
      VALUES (?, ?, ?, ?, 'in_app')
    `
  );

  await env.DB.batch(
    uniqueIds.map((userId) =>
      stmt.bind(crypto.randomUUID(), userId, title, body ?? null)
    )
  );
}

export async function getGuardianIdsForStudent(
  env: Env,
  studentId: string
): Promise<string[]> {
  const result = await env.DB.prepare(
    `
      SELECT parent_id
      FROM parent_student
      WHERE student_id = ?
    `
  )
    .bind(studentId)
    .all();

  return (result.results as any[]).map((row) => row.parent_id as string);
}

export async function canAccessRelatedRecord(
  env: Env,
  userId: string,
  role: string,
  relatedType: 'assignment' | 'submission' | 'feedback',
  relatedId: string
): Promise<boolean> {
  if (role === 'teacher' || role === 'admin') {
    if (relatedType === 'assignment') {
      const row = await env.DB.prepare(
        `
          SELECT 1
          FROM assignments a
          JOIN classes c ON c.id = a.class_id
          WHERE a.id = ?
            AND c.teacher_id = ?
        `
      )
        .bind(relatedId, userId)
        .first();
      return !!row;
    }

    if (relatedType === 'submission') {
      const row = await env.DB.prepare(
        `
          SELECT 1
          FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
          JOIN classes c ON c.id = a.class_id
          WHERE s.id = ?
            AND c.teacher_id = ?
        `
      )
        .bind(relatedId, userId)
        .first();
      return !!row;
    }

    if (relatedType === 'feedback') {
      const row = await env.DB.prepare(
        `
          SELECT 1
          FROM feedbacks f
          JOIN submissions s ON s.id = f.submission_id
          JOIN assignments a ON a.id = s.assignment_id
          JOIN classes c ON c.id = a.class_id
          WHERE f.id = ?
            AND c.teacher_id = ?
        `
      )
        .bind(relatedId, userId)
        .first();
      return !!row;
    }

    return false;
  }

  // student / parent
  const studentFilter =
    role === 'student'
      ? 'cs.student_id = ?'
      : 'ps.parent_id = ?';

  if (relatedType === 'assignment') {
    const query =
      role === 'student'
        ? `
            SELECT 1
            FROM assignments a
            JOIN class_students cs ON cs.class_id = a.class_id
            WHERE a.id = ?
              AND a.status = 'published'
              AND cs.student_id = ?
          `
        : `
            SELECT 1
            FROM assignments a
            JOIN class_students cs ON cs.class_id = a.class_id
            JOIN parent_student ps ON ps.student_id = cs.student_id
            WHERE a.id = ?
              AND a.status = 'published'
              AND ps.parent_id = ?
          `;

    const row = await env.DB.prepare(query).bind(relatedId, userId).first();
    return !!row;
  }

  if (relatedType === 'submission') {
    const query =
      role === 'student'
        ? `
            SELECT 1
            FROM submissions s
            WHERE s.id = ?
              AND s.student_id = ?
          `
        : `
            SELECT 1
            FROM submissions s
            JOIN parent_student ps ON ps.student_id = s.student_id
            WHERE s.id = ?
              AND ps.parent_id = ?
          `;

    const row = await env.DB.prepare(query).bind(relatedId, userId).first();
    return !!row;
  }

  if (relatedType === 'feedback') {
    const query =
      role === 'student'
        ? `
            SELECT 1
            FROM feedbacks f
            JOIN submissions s ON s.id = f.submission_id
            WHERE f.id = ?
              AND s.student_id = ?
          `
        : `
            SELECT 1
            FROM feedbacks f
            JOIN submissions s ON s.id = f.submission_id
            JOIN parent_student ps ON ps.student_id = s.student_id
            WHERE f.id = ?
              AND ps.parent_id = ?
          `;

    const row = await env.DB.prepare(query).bind(relatedId, userId).first();
    return !!row;
  }

  return false;
}

export async function getStudentAndGuardianIdsForClass(
  env: Env,
  classId: string
): Promise<string[]> {
  const result = await env.DB.prepare(
    `
      SELECT cs.student_id AS id
      FROM class_students cs
      WHERE cs.class_id = ?

      UNION

      SELECT ps.parent_id AS id
      FROM class_students cs
      JOIN parent_student ps ON ps.student_id = cs.student_id
      WHERE cs.class_id = ?
    `
  )
    .bind(classId, classId)
    .all();

  return (result.results as any[]).map((row) => row.id as string);
}
