import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const authRouter = Router();

interface LoginBody {
  email: string;
  password: string;
}

const MOCK_USERS: Record<string, { passwordHash: string; role: 'admin' | 'user' }> = {
  'admin@example.com': {
    passwordHash: '$2a$10$placeholder_hash_for_demo',
    role: 'admin',
  },
};

/**
 * POST /auth/login
 * Issues a JWT on valid credentials.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginBody;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = MOCK_USERS[email];
  if (!user) {
    // Constant-time response to prevent user enumeration
    await bcrypt.compare(password, '$2a$10$invalidhashpadding00000000000000');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { sub: email, email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1h', algorithm: 'HS256' }
  );

  return res.json({ token, expiresIn: 3600 });
});

/**
 * POST /auth/refresh
 * Exchanges a valid (non-expired) token for a new one.
 */
authRouter.post('/refresh', (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const newToken = jwt.sign(
      { sub: payload.sub, email: payload.email, role: payload.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
    return res.json({ token: newToken, expiresIn: 3600 });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});
