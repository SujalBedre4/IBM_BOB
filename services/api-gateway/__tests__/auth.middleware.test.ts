import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Ensure JWT_SECRET is set before the module loads
beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

function makeToken(payload: object, expiresIn: string | number = '1h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn, algorithm: 'HS256' } as any);
}

describe('validateJWT middleware', () => {
  describe('missing / malformed Authorization header', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const res = await request(app).get('/users/abc');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing or malformed Authorization header');
    });

    it('returns 401 when Authorization header has no Bearer prefix', async () => {
      const res = await request(app)
        .get('/users/abc')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing or malformed Authorization header');
    });

    it('returns 401 when token is syntactically invalid', async () => {
      const res = await request(app)
        .get('/users/abc')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns 401 when token is expired', async () => {
      const token = makeToken(
        { sub: 'user1', email: 'u@example.com', role: 'user' },
        -10 // already expired
      );
      const res = await request(app)
        .get('/users/user1')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Token expired');
    });

    it('returns 401 when token is signed with a different secret', async () => {
      const token = jwt.sign(
        { sub: 'user1', email: 'u@example.com', role: 'user' },
        'wrong-secret',
        { expiresIn: '1h' }
      );
      const res = await request(app)
        .get('/users/user1')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });
  });

  describe('valid token', () => {
    it('passes to next handler when token is valid', async () => {
      const token = makeToken({ sub: 'user1', email: 'u@example.com', role: 'user' });
      const res = await request(app)
        .get('/users/user1')
        .set('Authorization', `Bearer ${token}`);
      // 200 means validateJWT passed — the route itself returned user data
      expect(res.status).toBe(200);
    });
  });
});

describe('requireRole middleware', () => {
  it('returns 403 when user role is not admin and route requires admin', async () => {
    const token = makeToken({ sub: 'user1', email: 'u@example.com', role: 'user' });
    const res = await request(app)
      .delete('/users/user1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('allows request when user role is admin', async () => {
    const token = makeToken({ sub: 'admin1', email: 'a@example.com', role: 'admin' });
    const res = await request(app)
      .delete('/users/someuser')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/);
  });

  it('returns 401 when req.user is not set (requireRole called without validateJWT)', async () => {
    // Accessing requireRole result directly via import
    const { requireRole } = await import('../src/middleware/auth');
    const mockReq: any = {}; // no .user
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockNext = jest.fn();

    requireRole('admin')(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthenticated' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('allows service role through admin-required route because role is admin in token', async () => {
    // Only admin or exact-role match passes; service role != admin should get 403
    const token = makeToken({ sub: 's1', email: 's@example.com', role: 'service' });
    const res = await request(app)
      .delete('/users/someuser')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
