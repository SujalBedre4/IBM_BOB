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

  // sub is the user's email string (see auth.ts:43 and AGENTS.md).
  // Self-access check compares :id against both sub (email) and a numeric/uuid form
  // if present, so we normalise by accepting a match on either sub or email.
  const isSelf = requestingUser.sub === targetId || requestingUser.email === targetId;
  if (requestingUser.role !== 'admin' && !isSelf) {
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
