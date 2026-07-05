import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let regularToken: string;
  let regularUserId: number;
  const createdCategoryIds: number[] = [];

  const run = Date.now().toString(36);

  const adminUser = {
    name: 'Admin Categories Test',
    email: `admin-categories-e2e-${run}@example.com`,
    password: 'admin1234',
  };
  const regularUser = {
    name: 'Regular Categories Test',
    email: `regular-categories-e2e-${run}@example.com`,
    password: 'password123',
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    const hashed = await bcrypt.hash(adminUser.password, 10);
    await dataSource.query(
      `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'admin')`,
      [adminUser.name, adminUser.email, hashed],
    );
    const adminLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    adminToken = adminLoginRes.body.access_token;

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(regularUser);
    regularUserId = registerRes.body.id;
    const regularLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: regularUser.email, password: regularUser.password });
    regularToken = regularLoginRes.body.access_token;
  });

  afterAll(async () => {
    if (createdCategoryIds.length) {
      await dataSource.query('DELETE FROM categories WHERE id = ANY($1)', [
        createdCategoryIds,
      ]);
    }
    await dataSource.query('DELETE FROM users WHERE id = $1', [regularUserId]);
    await dataSource.query('DELETE FROM users WHERE email = $1', [
      adminUser.email,
    ]);
    await app.close();
  });

  describe('POST /categories', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Sin Auth' })
        .expect(401);
    });

    it('devuelve 403 con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'No permitido' })
        .expect(403);
    });

    it('devuelve 400 con nombre vacío', () => {
      return request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('crea la categoría y auto-genera el slug', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Categoria E2E ${run}` })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.slug).toBe(`categoria-e2e-${run}`);
      createdCategoryIds.push(res.body.id);
    });
  });

  describe('GET /categories', () => {
    it('es pública y devuelve las categorías creadas', async () => {
      const res = await request(app.getHttpServer())
        .get('/categories')
        .expect(200);

      const ids = res.body.map((c: { id: number }) => c.id);
      expect(ids).toEqual(expect.arrayContaining(createdCategoryIds));
    });
  });

  describe('GET /categories/:id', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .get(`/categories/${createdCategoryIds[0]}`)
        .expect(401);
    });

    it('devuelve la categoría con cualquier usuario autenticado', () => {
      return request(app.getHttpServer())
        .get(`/categories/${createdCategoryIds[0]}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(createdCategoryIds[0]);
        });
    });

    it('devuelve 404 para una categoría inexistente', () => {
      return request(app.getHttpServer())
        .get('/categories/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('devuelve 403 con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .patch(`/categories/${createdCategoryIds[0]}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'No permitido' })
        .expect(403);
    });

    it('actualiza la categoría como admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/categories/${createdCategoryIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Descripción actualizada' })
        .expect(200);

      expect(res.body.description).toBe('Descripción actualizada');
    });

    it('devuelve 404 para una categoría inexistente', () => {
      return request(app.getHttpServer())
        .patch('/categories/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'x' })
        .expect(404);
    });
  });

  describe('DELETE /categories/:id', () => {
    let toDeleteId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Categoria Para Borrar E2E ${run}` })
        .expect(201);
      toDeleteId = res.body.id;
    });

    it('devuelve 403 con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .delete(`/categories/${toDeleteId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);
    });

    it('elimina la categoría como admin', async () => {
      await request(app.getHttpServer())
        .delete(`/categories/${toDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/categories/${toDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
