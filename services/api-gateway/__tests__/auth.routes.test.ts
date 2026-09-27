import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

describe('POST /auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'pass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('email and password are required');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('email and password are required');
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('email and password are required');
  });

  it('returns 401 when email does not exist', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'unknown@example.com', password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 when password is wrong for existing email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('does not enumerate users — same 401 for unknown vs wrong password', async () => {
    const unknown = await request(app)
      .post('/auth/login')
      .send({ email: 'noone@example.com', password: 'x' });
    const wrongPwd = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'x' });
    expect(unknown.status).toBe(401);
    expect(wrongPwd.status).toBe(401);
    // Both return the same opaque error message
    expect(unknown.body.error).toBe(wrongPwd.body.error);
  });
});

describe('POST /auth/refresh', () => {
  it('returns 400 when token field is missing', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('token is required');
  });

  it('returns 401 for an invalid token string', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ token: 'garbage.token.value' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('returns 401 for an expired token', async () => {
    const expiredToken = jwt.sign(
      { sub: 'u1', email: 'u@example.com', role: 'user' },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .post('/auth/refresh')
      .send({ token: expiredToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('returns a new token when a valid token is provided', async () => {
    const validToken = jwt.sign(
      { sub: 'u1', email: 'u@example.com', role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .post('/auth/refresh')
      .send({ token: validToken });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.expiresIn).toBe(3600);
    // Decoded payload should preserve sub, email, role
    const decoded = jwt.verify(res.body.token, JWT_SECRET) as any;
    expect(decoded.sub).toBe('u1');
    expect(decoded.email).toBe('u@example.com');
    expect(decoded.role).toBe('user');
  });

  it('returns a token signed with the same secret', async () => {
    const validToken = jwt.sign(
      { sub: 'u2', email: 'v@example.com', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .post('/auth/refresh')
      .send({ token: validToken });
    expect(res.status).toBe(200);
    expect(() => jwt.verify(res.body.token, JWT_SECRET)).not.toThrow();
  });
});
