import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

describe('Attributes (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let regularToken: string;
  let regularUserId: number;
  let attributeId: number;
  const createdAttributeIds: number[] = [];

  const run = Date.now().toString(36);

  const adminUser = {
    name: 'Admin Attributes Test',
    email: `admin-attributes-e2e-${run}@example.com`,
    password: 'admin1234',
  };
  const regularUser = {
    name: 'Regular Attributes Test',
    email: `regular-attributes-e2e-${run}@example.com`,
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
    if (createdAttributeIds.length) {
      await dataSource.query('DELETE FROM attributes WHERE id = ANY($1)', [
        createdAttributeIds,
      ]);
    }
    await dataSource.query('DELETE FROM users WHERE id = $1', [regularUserId]);
    await dataSource.query('DELETE FROM users WHERE email = $1', [
      adminUser.email,
    ]);
    await app.close();
  });

  describe('POST /attributes', () => {
    it('devuelve 403 con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .post('/attributes')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'No permitido' })
        .expect(403);
    });

    it('devuelve 400 con nombre vacío', () => {
      return request(app.getHttpServer())
        .post('/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('crea el atributo', async () => {
      const res = await request(app.getHttpServer())
        .post('/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Color E2E ${run}` })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(`Color E2E ${run}`);
      attributeId = res.body.id;
      createdAttributeIds.push(attributeId);
    });
  });

  describe('GET /attributes', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/attributes').expect(401);
    });

    it('devuelve el listado con cualquier usuario autenticado', async () => {
      const res = await request(app.getHttpServer())
        .get('/attributes')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      const ids = res.body.map((a: { id: number }) => a.id);
      expect(ids).toContain(attributeId);
    });
  });

  describe('GET /attributes/:id', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .get(`/attributes/${attributeId}`)
        .expect(401);
    });

    it('devuelve el atributo con cualquier usuario autenticado', () => {
      return request(app.getHttpServer())
        .get(`/attributes/${attributeId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(attributeId);
        });
    });

    it('devuelve 404 para un atributo inexistente', () => {
      return request(app.getHttpServer())
        .get('/attributes/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /attributes/:id', () => {
    it('devuelve 403 con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .patch(`/attributes/${attributeId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'No permitido' })
        .expect(403);
    });

    it('actualiza el atributo como admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/attributes/${attributeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Color Actualizado E2E ${run}` })
        .expect(200);

      expect(res.body.name).toBe(`Color Actualizado E2E ${run}`);
    });
  });

  describe('POST /attributes/:id/values', () => {
    it('devuelve 403 con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .post(`/attributes/${attributeId}/values`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ value: 'Rojo' })
        .expect(403);
    });

    it('crea el valor del atributo', async () => {
      const res = await request(app.getHttpServer())
        .post(`/attributes/${attributeId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Rojo' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.value).toBe('Rojo');
      expect(res.body.attributeId).toBe(attributeId);
    });
  });

  describe('PATCH /attributes/:id/values/:valueId and DELETE', () => {
    let valueId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/attributes/${attributeId}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Azul' })
        .expect(201);
      valueId = res.body.id;
    });

    it('devuelve 403 al actualizar con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .patch(`/attributes/${attributeId}/values/${valueId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ value: 'No permitido' })
        .expect(403);
    });

    it('actualiza el valor del atributo como admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/attributes/${attributeId}/values/${valueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Azul Marino' })
        .expect(200);

      expect(res.body.value).toBe('Azul Marino');
    });

    it('devuelve 403 al eliminar con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .delete(`/attributes/${attributeId}/values/${valueId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);
    });

    it('elimina el valor del atributo como admin', () => {
      return request(app.getHttpServer())
        .delete(`/attributes/${attributeId}/values/${valueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('DELETE /attributes/:id', () => {
    let toDeleteId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Talle E2E ${run}` })
        .expect(201);
      toDeleteId = res.body.id;
    });

    it('devuelve 403 con token de usuario no-admin', () => {
      return request(app.getHttpServer())
        .delete(`/attributes/${toDeleteId}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);
    });

    it('elimina el atributo como admin', async () => {
      await request(app.getHttpServer())
        .delete(`/attributes/${toDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/attributes/${toDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
