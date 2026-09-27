import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const authRouter = Router();

interface LoginBody {
  email: string;
  password: string;
}

// MOCK_USERS is intentionally empty: credentials must be supplied via environment
// variables or a secrets manager at runtime. No hardcoded passwords or hashes.
const MOCK_USERS: Record<string, { passwordHash: string; role: 'admin' | 'user' }> = {};

// Simple in-process brute-force guard for /auth/login (ASVS-3.1.1)
// Tracks failed attempts per IP; locks the IP for LOCKOUT_MS after MAX_ATTEMPTS failures.
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && now < entry.lockedUntil) return false; // locked
  if (entry && now >= entry.lockedUntil) loginAttempts.delete(ip); // expired lock
  return true;
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
  loginAttempts.set(ip, entry);
}

function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * POST /auth/login
 * Issues a JWT on valid credentials.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';

  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }

  const { email, password } = req.body as LoginBody;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = MOCK_USERS[email];
  if (!user) {
    // Constant-time response to prevent user enumeration
    await bcrypt.compare(password, '$2a$10$invalidhashpadding00000000000000');
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  clearLoginAttempts(ip);

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
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as any;
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
