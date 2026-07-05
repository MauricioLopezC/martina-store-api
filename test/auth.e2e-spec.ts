import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { LoginResponseDto } from '../src/auth/dto/login-response.dto';
import { MeDto } from '../src/auth/dto/me.dto';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './utils/create-test-app';
import { body } from './utils/typed-body';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const run = Date.now().toString(36);

  const testUser = {
    name: 'Test User',
    email: `test-e2e-${run}@example.com`,
    password: 'password123',
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email = $1', [
      testUser.email,
    ]);
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates a user and does not expose the password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201)
        .expect((res) => {
          const data = body<Partial<User>>(res);
          expect(data.email).toBe(testUser.email);
          expect(data.password).toBeUndefined();
        });
    });

    it('returns 400 with missing required fields', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testUser.email })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns 401 with wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('returns 401 with unknown email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: testUser.password })
        .expect(401);
    });

    it('returns access_token with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(201)
        .expect((res) => {
          const data = body<LoginResponseDto>(res);
          expect(data.access_token).toBeDefined();
          expect(typeof data.access_token).toBe('string');
        });
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      accessToken = body<LoginResponseDto>(res).access_token;
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('returns 401 with invalid token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(401);
    });

    it('returns user data with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          const data = body<MeDto>(res);
          expect(data.email).toBe(testUser.email);
          expect(data.userId).toBeDefined();
          expect(data.role).toBe('user');
        });
    });
  });
});
