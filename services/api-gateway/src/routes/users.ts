import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';

export const usersRouter = Router();

/**
 * GET /users/:id
 * Returns a user profile. Admin or self only.
 */
usersRouter.get('/:id', (req: Request, res: Response) => {
  const requestingUser = (req as any).user;
  const targetId = req.params.id;

  if (requestingUser.role !== 'admin' && requestingUser.sub !== targetId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // In production this would query a database
  return res.json({ id: targetId, email: requestingUser.email, role: requestingUser.role });
});

/**
 * DELETE /users/:id
 * Admin only — delete a user account.
 */
usersRouter.delete('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const targetId = req.params.id;
  // In production: soft-delete from database
  return res.json({ message: `User ${targetId} deleted`, deletedAt: new Date().toISOString() });
});
