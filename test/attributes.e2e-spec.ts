import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { LoginResponseDto } from '../src/auth/dto/login-response.dto';
import { Attribute } from '../src/catalog/attributes/entities/attribute.entity';
import { AttributeValue } from '../src/catalog/attributes/entities/attribute-value.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './utils/create-test-app';
import { body } from './utils/typed-body';

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
    adminToken = body<LoginResponseDto>(adminLoginRes).access_token;

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(regularUser);
    regularUserId = body<User>(registerRes).id;
    const regularLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: regularUser.email, password: regularUser.password });
    regularToken = body<LoginResponseDto>(regularLoginRes).access_token;
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

      const data = body<Attribute>(res);
      expect(data.id).toBeDefined();
      expect(data.name).toBe(`Color E2E ${run}`);
      attributeId = data.id;
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

      const ids = body<Attribute[]>(res).map((a) => a.id);
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
          expect(body<Attribute>(res).id).toBe(attributeId);
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

      expect(body<Attribute>(res).name).toBe(`Color Actualizado E2E ${run}`);
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

      const data = body<AttributeValue>(res);
      expect(data.id).toBeDefined();
      expect(data.value).toBe('Rojo');
      expect(data.attributeId).toBe(attributeId);
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
      valueId = body<AttributeValue>(res).id;
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

      expect(body<AttributeValue>(res).value).toBe('Azul Marino');
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
      toDeleteId = body<Attribute>(res).id;
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
