import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs/promises';
import * as path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

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
    app = await createTestApp();
    dataSource = app.get(DataSource);

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
      await dataSource.query('DELETE FROM products WHERE id = ANY($1)', [
        createdProductIds,
      ]);
    }
    if (createdCategoryIds.length) {
      await dataSource.query('DELETE FROM categories WHERE id = ANY($1)', [
        createdCategoryIds,
      ]);
    }
    await dataSource.query('DELETE FROM users WHERE email = $1', [
      adminUser.email,
    ]);

    const localDest = process.env.STORAGE_LOCAL_DEST ?? 'uploads';
    for (const url of uploadedFiles) {
      const filename = url.split('/').pop();
      if (filename) {
        await fs
          .unlink(path.resolve(localDest, filename))
          .catch(() => undefined);
      }
    }

    await app.close();
  });

  describe('POST /products — admin crea un producto', () => {
    it('crea el producto y auto-genera el slug', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Remera Test E2E ${run}`,
          description: 'Producto de prueba e2e',
          status: 'draft',
        })
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
        .send({
          name: 'Regular User',
          email: regularEmail,
          password: 'password123',
        });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: regularEmail, password: 'password123' });

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${loginRes.body.access_token}`)
        .send({ name: 'No permitido', status: 'draft' })
        .expect(403);

      await dataSource.query('DELETE FROM users WHERE id = $1', [
        registerRes.body.id,
      ]);
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
        .attach('file', fakeJpegBuffer, {
          filename: 'x.jpg',
          contentType: 'image/jpeg',
        })
        .expect(404);
    });

    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .post(`/products/${productId}/images`)
        .attach('file', Buffer.from('x'), {
          filename: 'x.jpg',
          contentType: 'image/jpeg',
        })
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
        expect(categoryIds).toEqual(
          expect.arrayContaining([categoryId, otherCategoryId]),
        );
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
      const res = await request(app.getHttpServer())
        .get('/products?categoryId=999999')
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET /products/admin — listado con filtro por status para admins', () => {
    let draftProductId: number;
    let archivedProductId: number;
    let publishedProductId: number;

    beforeAll(async () => {
      const draftRes = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Producto Draft Admin E2E ${run}`, status: 'draft' })
        .expect(201);
      draftProductId = draftRes.body.id;
      createdProductIds.push(draftProductId);

      const archivedRes = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Producto Archived Admin E2E ${run}`,
          status: 'archived',
        })
        .expect(201);
      archivedProductId = archivedRes.body.id;
      createdProductIds.push(archivedProductId);

      const publishedRes = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Producto Published Admin E2E ${run}`,
          status: 'published',
        })
        .expect(201);
      publishedProductId = publishedRes.body.id;
      createdProductIds.push(publishedProductId);
    });

    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/products/admin').expect(401);
    });

    it('devuelve 403 con token de usuario no-admin', async () => {
      const regularEmail = `regular-admin-list-e2e-${run}@example.com`;

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Regular User',
          email: regularEmail,
          password: 'password123',
        });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: regularEmail, password: 'password123' });

      await request(app.getHttpServer())
        .get('/products/admin')
        .set('Authorization', `Bearer ${loginRes.body.access_token}`)
        .expect(403);

      await dataSource.query('DELETE FROM users WHERE id = $1', [
        registerRes.body.id,
      ]);
    });

    it('sin status, un admin ve productos en cualquier estado', async () => {
      const res = await request(app.getHttpServer())
        .get('/products/admin?limit=100')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const returnedIds = res.body.data.map((p: { id: number }) => p.id);
      expect(returnedIds).toEqual(
        expect.arrayContaining([
          draftProductId,
          archivedProductId,
          publishedProductId,
        ]),
      );
    });

    it('con status=draft, solo devuelve productos en borrador', async () => {
      const res = await request(app.getHttpServer())
        .get('/products/admin?status=draft&limit=100')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const returnedIds = res.body.data.map((p: { id: number }) => p.id);
      expect(returnedIds).toContain(draftProductId);
      expect(returnedIds).not.toContain(archivedProductId);
      expect(returnedIds).not.toContain(publishedProductId);
      for (const product of res.body.data) {
        expect(product.status).toBe('draft');
      }
    });
  });

  describe('GET /products/slug/:slug — busca un producto por slug', () => {
    let publishedSlugProductId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Producto Slug E2E ${run}`, status: 'published' })
        .expect(201);
      publishedSlugProductId = res.body.id;
      createdProductIds.push(publishedSlugProductId);
    });

    it('devuelve el producto sin necesidad de token', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/slug/producto-slug-e2e-${run}`)
        .expect(200);

      expect(res.body.id).toBe(publishedSlugProductId);
    });

    it('devuelve 404 para un producto en estado draft', () => {
      return request(app.getHttpServer())
        .get(`/products/slug/remera-test-e2e-${run}`)
        .expect(404);
    });

    it('devuelve 404 para un slug inexistente', () => {
      return request(app.getHttpServer())
        .get('/products/slug/no-existe-e2e')
        .expect(404);
    });
  });

  describe('GET /products/:id — detalle del producto', () => {
    it('devuelve el detalle sin necesidad de token', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);

      expect(res.body.id).toBe(productId);
      expect(res.body.variants).toBeDefined();
      expect(res.body.images).toBeDefined();
      expect(res.body.categories).toBeDefined();
    });

    it('devuelve 404 para un producto inexistente', () => {
      return request(app.getHttpServer()).get('/products/999999').expect(404);
    });
  });

  describe('PATCH /products/:id — admin actualiza un producto', () => {
    it('devuelve 403 con token de usuario no-admin', async () => {
      const regularEmail = `regular-update-e2e-${run}@example.com`;

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Regular User',
          email: regularEmail,
          password: 'password123',
        });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: regularEmail, password: 'password123' });

      await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set('Authorization', `Bearer ${loginRes.body.access_token}`)
        .send({ status: 'published' })
        .expect(403);

      await dataSource.query('DELETE FROM users WHERE id = $1', [
        registerRes.body.id,
      ]);
    });

    it('actualiza el producto como admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published', brand: 'Martina' })
        .expect(200);

      expect(res.body.status).toBe('published');
      expect(res.body.brand).toBe('Martina');
    });

    it('devuelve 404 para un producto inexistente', () => {
      return request(app.getHttpServer())
        .patch('/products/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' })
        .expect(404);
    });
  });

  describe('Variantes de producto', () => {
    let variantProductId: number;
    let variantId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Producto Variantes E2E ${run}`, status: 'draft' })
        .expect(201);
      variantProductId = res.body.id;
      createdProductIds.push(variantProductId);
    });

    it('POST /products/:id/variants — 403 con token de usuario no-admin', async () => {
      const regularEmail = `regular-variants-e2e-${run}@example.com`;

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Regular User',
          email: regularEmail,
          password: 'password123',
        });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: regularEmail, password: 'password123' });

      await request(app.getHttpServer())
        .post(`/products/${variantProductId}/variants`)
        .set('Authorization', `Bearer ${loginRes.body.access_token}`)
        .send({ sku: `NO-PERMITIDO-${run}`, price: 100 })
        .expect(403);

      await dataSource.query('DELETE FROM users WHERE id = $1', [
        registerRes.body.id,
      ]);
    });

    it('POST /products/:id/variants — agrega una variante al producto', async () => {
      const res = await request(app.getHttpServer())
        .post(`/products/${variantProductId}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sku: `VAR-E2E-${run}`, price: 900, stock: 3 })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.sku).toBe(`VAR-E2E-${run}`);
      variantId = res.body.id;
    });

    it('POST /products/:id/variants — 409 si el SKU ya existe', () => {
      return request(app.getHttpServer())
        .post(`/products/${variantProductId}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sku: `VAR-E2E-${run}`, price: 900 })
        .expect(409);
    });

    it('PATCH /products/:id/variants/:variantId — actualiza precio y stock', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/products/${variantProductId}/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 950, stock: 10 })
        .expect(200);

      expect(res.body.price).toBe(950);
      expect(res.body.stock).toBe(10);
    });

    it('PATCH /products/:id/variants/:variantId — 404 con variantId inexistente', () => {
      return request(app.getHttpServer())
        .patch(`/products/${variantProductId}/variants/999999`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 100 })
        .expect(404);
    });

    it('DELETE /products/:id/variants/:variantId — elimina la variante', async () => {
      await request(app.getHttpServer())
        .delete(`/products/${variantProductId}/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .patch(`/products/${variantProductId}/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 100 })
        .expect(404);
    });
  });

  describe('PATCH y DELETE /products/:id/images/:imageId', () => {
    let imageProductId: number;
    let imageId: number;

    beforeAll(async () => {
      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Producto Imagenes E2E ${run}`, status: 'draft' })
        .expect(201);
      imageProductId = productRes.body.id;
      createdProductIds.push(imageProductId);

      const imageRes = await request(app.getHttpServer())
        .post(`/products/${imageProductId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', fakeJpegBuffer, {
          filename: 'imagen-editable.jpg',
          contentType: 'image/jpeg',
        })
        .field('position', '0')
        .field('isCover', 'false')
        .expect(201);
      imageId = imageRes.body.id;
      uploadedFiles.push(imageRes.body.url);
    });

    it('PATCH /products/:id/images/:imageId — actualiza isCover y altText', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/products/${imageProductId}/images/${imageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isCover: true, altText: 'Texto alternativo actualizado' })
        .expect(200);

      expect(res.body.isCover).toBe(true);
      expect(res.body.altText).toBe('Texto alternativo actualizado');
    });

    it('DELETE /products/:id/images/:imageId — elimina la imagen', async () => {
      await request(app.getHttpServer())
        .delete(`/products/${imageProductId}/images/${imageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/products/${imageProductId}`)
        .expect(200);

      expect(
        res.body.images.some((img: { id: number }) => img.id === imageId),
      ).toBe(false);
    });
  });

  describe('DELETE /products/:id — admin elimina un producto', () => {
    let toDeleteId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Producto Para Borrar E2E ${run}`, status: 'draft' })
        .expect(201);
      toDeleteId = res.body.id;
    });

    it('devuelve 403 con token de usuario no-admin', async () => {
      const regularEmail = `regular-delete-e2e-${run}@example.com`;

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Regular User',
          email: regularEmail,
          password: 'password123',
        });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: regularEmail, password: 'password123' });

      await request(app.getHttpServer())
        .delete(`/products/${toDeleteId}`)
        .set('Authorization', `Bearer ${loginRes.body.access_token}`)
        .expect(403);

      await dataSource.query('DELETE FROM users WHERE id = $1', [
        registerRes.body.id,
      ]);
    });

    it('elimina el producto como admin', async () => {
      await request(app.getHttpServer())
        .delete(`/products/${toDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/products/${toDeleteId}`)
        .expect(404);
    });
  });
});
