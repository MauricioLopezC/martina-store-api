import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs/promises';
import * as path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AppExceptionFilter } from '../src/common/filters/app-exception.filter';

const fakeJpegBuffer = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('fake-image-content'),
]);

describe('Products catalog (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let productId: number;
  const createdProductIds: number[] = [];
  const createdCategoryIds: number[] = [];
  const uploadedFiles: string[] = [];

  const run = Date.now().toString(36);

  const adminUser = {
    name: 'Admin Catalog Test',
    email: `admin-catalog-e2e-${run}@example.com`,
    password: 'admin1234',
  };

  beforeAll(async () => {
    jest.setTimeout(30000);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();

    dataSource = moduleFixture.get(DataSource);

    const hashed = await bcrypt.hash(adminUser.password, 10);
    await dataSource.query(
      `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'admin')`,
      [adminUser.name, adminUser.email, hashed],
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    adminToken = loginRes.body.access_token;
  });

  afterAll(async () => {
    if (createdProductIds.length) {
      await dataSource.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds]);
    }
    if (createdCategoryIds.length) {
      await dataSource.query('DELETE FROM categories WHERE id = ANY($1)', [createdCategoryIds]);
    }
    await dataSource.query('DELETE FROM users WHERE email = $1', [adminUser.email]);

    const localDest = process.env.STORAGE_LOCAL_DEST ?? 'uploads';
    for (const url of uploadedFiles) {
      const filename = url.split('/').pop();
      if (filename) {
        await fs.unlink(path.resolve(localDest, filename)).catch(() => undefined);
      }
    }

    await app.close();
  });

  describe('POST /products — admin crea un producto', () => {
    it('crea el producto y auto-genera el slug', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Remera Test E2E ${run}`, description: 'Producto de prueba e2e', status: 'draft' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(`Remera Test E2E ${run}`);
      expect(res.body.slug).toBe(`remera-test-e2e-${run}`);
      expect(res.body.status).toBe('draft');

      productId = res.body.id;
      createdProductIds.push(productId);
    });

    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .post('/products')
        .send({ name: 'Sin Auth', status: 'draft' })
        .expect(401);
    });

    it('devuelve 403 con token de usuario no-admin', async () => {
      const regularEmail = `regular-e2e-${run}@example.com`;

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Regular User', email: regularEmail, password: 'password123' });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: regularEmail, password: 'password123' });

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${loginRes.body.access_token}`)
        .send({ name: 'No permitido', status: 'draft' })
        .expect(403);

      await dataSource.query('DELETE FROM users WHERE id = $1', [registerRes.body.id]);
    });

    it('devuelve 409 si el slug ya existe', async () => {
      const { body: existing } = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      return request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Otro nombre', slug: existing.slug, status: 'draft' })
        .expect(409);
    });

    it('crea el producto con variantes en una sola request', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Remera Con Variantes E2E ${run}`,
          status: 'draft',
          variants: [
            { sku: `RCV-S-${run}`, price: 1500, stock: 10 },
            { sku: `RCV-M-${run}`, price: 1500, stock: 5 },
          ],
        })
        .expect(201);

      expect(res.body.variants).toHaveLength(2);
      expect(res.body.variants.map((v: { sku: string }) => v.sku)).toEqual(
        expect.arrayContaining([`RCV-S-${run}`, `RCV-M-${run}`]),
      );

      createdProductIds.push(res.body.id);
    });

    it('devuelve 409 si alguna variante usa un SKU duplicado', async () => {
      const base = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Producto SKU Base E2E ${run}`,
          status: 'draft',
          variants: [{ sku: `SKU-DUP-${run}`, price: 1000 }],
        })
        .expect(201);

      createdProductIds.push(base.body.id);

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Producto SKU Duplicado E2E ${run}`,
          status: 'draft',
          variants: [{ sku: `SKU-DUP-${run}`, price: 1500 }],
        })
        .expect(409);
    });
  });

  describe('POST /products/:id/images — admin sube imagen al producto', () => {
    it('sube la imagen y la asigna al producto', async () => {
      const res = await request(app.getHttpServer())
        .post(`/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', fakeJpegBuffer, {
          filename: 'remera-azul.jpg',
          contentType: 'image/jpeg',
        })
        .field('position', '0')
        .field('isCover', 'true')
        .field('altText', 'Remera azul vista frontal')
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.productId).toBe(productId);
      expect(res.body.url).toContain('remera-azul.jpg');
      expect(res.body.isCover).toBe(true);
      expect(res.body.position).toBe(0);
      expect(res.body.altText).toBe('Remera azul vista frontal');

      uploadedFiles.push(res.body.url);
    });

    it('la imagen aparece en el listado del producto', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.images).toHaveLength(1);
      expect(res.body.images[0].isCover).toBe(true);
      expect(res.body.images[0].url).toContain('remera-azul.jpg');
    });

    it('devuelve 404 si el producto no existe', () => {
      return request(app.getHttpServer())
        .post('/products/99999/images')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', fakeJpegBuffer, { filename: 'x.jpg', contentType: 'image/jpeg' })
        .expect(404);
    });

    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .post(`/products/${productId}/images`)
        .attach('file', Buffer.from('x'), { filename: 'x.jpg', contentType: 'image/jpeg' })
        .expect(401);
    });
  });

  describe('GET /products?categoryId= — filtra productos por categoría', () => {
    let categoryId: number;
    let otherCategoryId: number;
    let inCategoryIds: number[];
    let outsideProductId: number;

    beforeAll(async () => {
      const categoryRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Categoria Filtro E2E ${run}` })
        .expect(201);
      categoryId = categoryRes.body.id;
      createdCategoryIds.push(categoryId);

      const otherCategoryRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Categoria Otra E2E ${run}` })
        .expect(201);
      otherCategoryId = otherCategoryRes.body.id;
      createdCategoryIds.push(otherCategoryId);

      const inCategory = await Promise.all(
        [1, 2, 3].map((n) =>
          request(app.getHttpServer())
            .post('/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `Producto Filtro ${n} E2E ${run}`,
              status: 'published',
              categoryIds: [categoryId, otherCategoryId],
            })
            .expect(201),
        ),
      );
      inCategoryIds = inCategory.map((res) => res.body.id);
      createdProductIds.push(...inCategoryIds);

      const outside = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Producto Sin Categoria E2E ${run}`,
          status: 'published',
          categoryIds: [otherCategoryId],
        })
        .expect(201);
      outsideProductId = outside.body.id;
      createdProductIds.push(outsideProductId);
    });

    it('devuelve solo los productos asociados a la categoría, con todas sus categorías', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products?categoryId=${categoryId}&limit=100`)
        .expect(200);

      expect(res.body.total).toBe(inCategoryIds.length);
      const returnedIds = res.body.data.map((p: { id: number }) => p.id);
      expect(returnedIds.sort()).toEqual([...inCategoryIds].sort());
      expect(returnedIds).not.toContain(outsideProductId);

      for (const product of res.body.data) {
        const categoryIds = product.categories.map((c: { id: number }) => c.id);
        expect(categoryIds).toEqual(expect.arrayContaining([categoryId, otherCategoryId]));
      }
    });

    it('combina el filtro con la paginación', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products?categoryId=${categoryId}&page=1&limit=2`)
        .expect(200);

      expect(res.body.total).toBe(inCategoryIds.length);
      expect(res.body.data).toHaveLength(2);
    });

    it('devuelve data vacía y total 0 para una categoría inexistente', async () => {
      const res = await request(app.getHttpServer()).get('/products?categoryId=999999').expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });
});
