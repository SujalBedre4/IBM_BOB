import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { validateJWT } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3001' }));
app.use(express.json({ limit: '10kb' }));

// Health endpoint — no auth required
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/auth', authRouter);

// Protected routes
app.use('/users', validateJWT, usersRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export { app };

if (require.main === module) {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  app.listen(PORT, () => {
    console.log(`api-gateway listening on port ${PORT}`);
  });
}
