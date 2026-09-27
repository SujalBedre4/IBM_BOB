import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: 'admin' | 'user' | 'service';
  iat: number;
  exp: number;
}

/**
 * Validate a JWT Bearer token from the Authorization header.
 * Attaches the decoded payload to req.user on success.
 */
export function validateJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as JWTPayload;
    (req as any).user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    next(err);
  }
}

/**
 * Require a specific role. Must be used AFTER validateJWT.
 */
export function requireRole(role: JWTPayload['role']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JWTPayload | undefined;
    if (!user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (user.role !== role && user.role !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
