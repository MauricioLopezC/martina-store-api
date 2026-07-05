import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { LoginResponseDto } from '../src/auth/dto/login-response.dto';
import { CartDto } from '../src/cart/dto/cart.dto';
import { Product } from '../src/catalog/products/entities/product.entity';
import { ProductVariant } from '../src/catalog/products/entities/product-variant.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './utils/create-test-app';
import { body } from './utils/typed-body';

describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userAToken: string;
  let userBToken: string;
  let userAId: number;
  let userBId: number;
  let productId: number;
  let variantId: number;
  let limitedVariantId: number;

  const run = Date.now().toString(36);

  const adminUser = {
    name: 'Admin Cart Test',
    email: `admin-cart-e2e-${run}@example.com`,
    password: 'admin1234',
  };
  const userA = {
    name: 'User A Cart Test',
    email: `user-a-cart-e2e-${run}@example.com`,
    password: 'password123',
  };
  const userB = {
    name: 'User B Cart Test',
    email: `user-b-cart-e2e-${run}@example.com`,
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
    const adminToken = body<LoginResponseDto>(adminLoginRes).access_token;

    const registerA = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userA);
    userAId = body<User>(registerA).id;
    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userA.email, password: userA.password });
    userAToken = body<LoginResponseDto>(loginA).access_token;

    const registerB = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userB);
    userBId = body<User>(registerB).id;
    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userB.email, password: userB.password });
    userBToken = body<LoginResponseDto>(loginB).access_token;

    const productRes = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Producto Carrito E2E ${run}`,
        status: 'published',
        variants: [{ sku: `CART-VAR-${run}`, price: 1000, stock: 5 }],
      })
      .expect(201);
    const product = body<Product>(productRes);
    productId = product.id;
    variantId = product.variants[0].id;

    const limitedRes = await request(app.getHttpServer())
      .post(`/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `CART-VAR-LIMITED-${run}`, price: 500, stock: 1 })
      .expect(201);
    limitedVariantId = body<ProductVariant>(limitedRes).id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM carts WHERE "userId" = ANY($1)', [
      [userAId, userBId],
    ]);
    await dataSource.query('DELETE FROM products WHERE id = $1', [productId]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1)', [
      [userAId, userBId],
    ]);
    await dataSource.query('DELETE FROM users WHERE email = $1', [
      adminUser.email,
    ]);
    await app.close();
  });

  describe('GET /me/cart', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/me/cart').expect(401);
    });

    it('devuelve un carrito vacío para un usuario nuevo', async () => {
      const res = await request(app.getHttpServer())
        .get('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      const data = body<CartDto>(res);
      expect(data.items).toEqual([]);
      expect(data.totalItems).toBe(0);
      expect(data.totalPrice).toBe(0);
    });
  });

  describe('POST /me/cart/items', () => {
    it('devuelve 400 con body inválido', () => {
      return request(app.getHttpServer())
        .post('/me/cart/items')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ quantity: 0 })
        .expect(400);
    });

    it('agrega un item al carrito', async () => {
      const res = await request(app.getHttpServer())
        .post('/me/cart/items')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ variantId, quantity: 2 })
        .expect(201);

      const data = body<CartDto>(res);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].variantId).toBe(variantId);
      expect(data.items[0].quantity).toBe(2);
      expect(data.totalItems).toBe(2);
    });

    it('agregar el mismo variantId de nuevo incrementa la cantidad', async () => {
      const res = await request(app.getHttpServer())
        .post('/me/cart/items')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ variantId, quantity: 1 })
        .expect(201);

      const data = body<CartDto>(res);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].quantity).toBe(3);
    });

    it('devuelve 409 si la cantidad supera el stock disponible', () => {
      return request(app.getHttpServer())
        .post('/me/cart/items')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ variantId: limitedVariantId, quantity: 2 })
        .expect(409);
    });
  });

  describe('PATCH /me/cart/items/:itemId', () => {
    let itemId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .get('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`);
      itemId = body<CartDto>(res).items[0].id;
    });

    it('actualiza la cantidad del item', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/me/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ quantity: 1 })
        .expect(200);

      expect(body<CartDto>(res).items[0].quantity).toBe(1);
    });

    it('devuelve 404 si el item pertenece a otro usuario', () => {
      return request(app.getHttpServer())
        .patch(`/me/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ quantity: 1 })
        .expect(404);
    });
  });

  describe('DELETE /me/cart/items/:itemId', () => {
    it('devuelve 404 si el item pertenece a otro usuario', async () => {
      const res = await request(app.getHttpServer())
        .get('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`);
      const itemId = body<CartDto>(res).items[0].id;

      await request(app.getHttpServer())
        .delete(`/me/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('elimina el item del carrito', async () => {
      const cartRes = await request(app.getHttpServer())
        .get('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`);
      const itemId = body<CartDto>(cartRes).items[0].id;

      const res = await request(app.getHttpServer())
        .delete(`/me/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(body<CartDto>(res).items).toEqual([]);
    });
  });

  describe('DELETE /me/cart', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/me/cart/items')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ variantId, quantity: 1 })
        .expect(201);
    });

    it('vacía el carrito', async () => {
      await request(app.getHttpServer())
        .delete('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(body<CartDto>(res).items).toEqual([]);
    });
  });
});
