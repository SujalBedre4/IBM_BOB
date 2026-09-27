import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

function makeToken(sub: string, role: 'admin' | 'user' | 'service', email = 'u@example.com') {
  return jwt.sign({ sub, email, role }, JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' } as any);
}

describe('GET /users/:id', () => {
  it('returns 200 with user data when user requests their own profile', async () => {
    const token = makeToken('user42', 'user', 'user42@example.com');
    const res = await request(app)
      .get('/users/user42')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user42');
    expect(res.body.email).toBe('user42@example.com');
    expect(res.body.role).toBe('user');
  });

  it('returns 200 when admin requests any user profile', async () => {
    const token = makeToken('adminUser', 'admin', 'admin@example.com');
    const res = await request(app)
      .get('/users/anyone')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('anyone');
  });

  it('returns 403 when non-admin user requests another user profile', async () => {
    const token = makeToken('user1', 'user', 'user1@example.com');
    const res = await request(app)
      .get('/users/user2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied');
  });

  it('returns 401 when request has no Authorization header', async () => {
    const res = await request(app).get('/users/user1');
    expect(res.status).toBe(401);
  });

  it('returns 200 when service role user requests their own profile', async () => {
    const token = makeToken('svc1', 'service', 'svc@example.com');
    const res = await request(app)
      .get('/users/svc1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('svc1');
  });

  it('returns 403 when service role user requests another user profile', async () => {
    const token = makeToken('svc1', 'service', 'svc@example.com');
    const res = await request(app)
      .get('/users/other')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied');
  });
});

describe('DELETE /users/:id', () => {
  it('returns 200 with deletion confirmation when admin deletes a user', async () => {
    const token = makeToken('admin1', 'admin', 'admin@example.com');
    const res = await request(app)
      .delete('/users/target123')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('target123');
    expect(res.body.deletedAt).toBeDefined();
  });

  it('returns 403 when a regular user attempts to delete any user', async () => {
    const token = makeToken('user1', 'user', 'user1@example.com');
    const res = await request(app)
      .delete('/users/user1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('returns 403 when a service role attempts to delete a user', async () => {
    const token = makeToken('svc1', 'service', 'svc@example.com');
    const res = await request(app)
      .delete('/users/someone')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('returns 401 when request has no Authorization header', async () => {
    const res = await request(app).delete('/users/user1');
    expect(res.status).toBe(401);
  });
});
