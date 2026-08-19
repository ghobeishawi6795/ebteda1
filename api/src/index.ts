import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authRoutes } from './routes/auth';
import { classRoutes } from './routes/classes';
import { assignmentRoutes } from './routes/assignments';
import { submissionRoutes } from './routes/submissions';
import { feedbackRoutes } from './routes/feedbacks';
import { fileRoutes } from './routes/files';
import { notificationRoutes } from './routes/notifications';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.FRONTEND_URL || '*',
  });
  return corsMiddleware(c, next);
});

app.get('/', (c) => {
  return c.json({
    ok: true,
    message: 'Homework API is running without R2',
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/classes', classRoutes);
app.route('/api/assignments', assignmentRoutes);
app.route('/api/submissions', submissionRoutes);
app.route('/api/feedbacks', feedbackRoutes);
app.route('/api/files', fileRoutes);
app.route('/api/notifications', notificationRoutes);

export default app;
