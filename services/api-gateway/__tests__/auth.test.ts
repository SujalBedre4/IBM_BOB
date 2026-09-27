import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/index';

const TEST_SECRET = 'test-secret-32-chars-minimum-len!';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

function makeToken(
  payload: object,
  opts: jwt.SignOptions = { expiresIn: '1h', algorithm: 'HS256' }
) {
  return jwt.sign(payload, TEST_SECRET, opts);
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
describe('POST /auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'admin@example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for an unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'unknown@example.com', password: 'any' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 for a known email with wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
describe('POST /auth/refresh', () => {
  it('returns 400 when token is missing', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token is required/i);
  });

  it('returns 401 for a tampered/invalid token', async () => {
    const res = await request(app).post('/auth/refresh').send({ token: 'not.a.token' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const expired = makeToken(
      { sub: 'user@example.com', email: 'user@example.com', role: 'user' },
      { expiresIn: -1, algorithm: 'HS256' }
    );
    const res = await request(app).post('/auth/refresh').send({ token: expired });
    expect(res.status).toBe(401);
  });

  it('returns a new token for a valid token', async () => {
    const token = makeToken({ sub: 'user@example.com', email: 'user@example.com', role: 'user' });
    const res = await request(app).post('/auth/refresh').send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('expiresIn', 3600);
  });
});

// ---------------------------------------------------------------------------
// validateJWT middleware
// ---------------------------------------------------------------------------
describe('validateJWT middleware (via /users/:id)', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/users/123');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  it('returns 401 when Authorization header is malformed (no Bearer prefix)', async () => {
    const res = await request(app).get('/users/123').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a syntactically invalid token', async () => {
    const res = await request(app).get('/users/123').set('Authorization', 'Bearer not.valid');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid token/i);
  });

  it('returns 401 for an expired token', async () => {
    const expired = makeToken(
      { sub: 'user@example.com', email: 'user@example.com', role: 'user' },
      { expiresIn: -1, algorithm: 'HS256' }
    );
    const res = await request(app).get('/users/123').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/token expired/i);
  });
});

// ---------------------------------------------------------------------------
// GET /users/:id
// ---------------------------------------------------------------------------
describe('GET /users/:id', () => {
  it('returns 403 when non-admin accesses a different user', async () => {
    const token = makeToken({
      sub: 'user@example.com',
      email: 'user@example.com',
      role: 'user',
    });
    const res = await request(app)
      .get('/users/other-user-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 when user accesses their own profile (sub matches)', async () => {
    const token = makeToken({ sub: 'my-id', email: 'user@example.com', role: 'user' });
    const res = await request(app)
      .get('/users/my-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('my-id');
  });

  it('returns 200 when admin accesses any user profile', async () => {
    const token = makeToken({ sub: 'admin@example.com', email: 'admin@example.com', role: 'admin' });
    const res = await request(app)
      .get('/users/some-other-user')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /users/:id  (requireRole('admin'))
// ---------------------------------------------------------------------------
describe('DELETE /users/:id', () => {
  it('returns 403 when a non-admin tries to delete a user', async () => {
    const token = makeToken({ sub: 'user@example.com', email: 'user@example.com', role: 'user' });
    const res = await request(app)
      .delete('/users/target-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 when admin deletes a user', async () => {
    const token = makeToken({ sub: 'admin@example.com', email: 'admin@example.com', role: 'admin' });
    const res = await request(app)
      .delete('/users/target-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});
