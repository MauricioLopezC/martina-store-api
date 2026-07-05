import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { LoginResponseDto } from '../src/auth/dto/login-response.dto';
import { Product } from '../src/catalog/products/entities/product.entity';
import { ProductVariant } from '../src/catalog/products/entities/product-variant.entity';
import { OrderDto } from '../src/orders/dto/order.dto';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './utils/create-test-app';
import { body } from './utils/typed-body';

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let userAToken: string;
  let userBToken: string;
  let userAId: number;
  let userBId: number;
  let productId: number;
  let variantId: number;
  let limitedVariantId: number;

  const run = Date.now().toString(36);

  const shippingPayload = {
    shippingAddressLine: 'Av. Siempre Viva 742',
    shippingCity: 'Springfield',
    shippingState: 'Buenos Aires',
    shippingZipCode: '1900',
  };

  const adminUser = {
    name: 'Admin Orders Test',
    email: `admin-orders-e2e-${run}@example.com`,
    password: 'admin1234',
  };
  const userA = {
    name: 'User A Orders Test',
    email: `user-a-orders-e2e-${run}@example.com`,
    password: 'password123',
  };
  const userB = {
    name: 'User B Orders Test',
    email: `user-b-orders-e2e-${run}@example.com`,
    password: 'password123',
  };

  const stockOf = async (id: number): Promise<number> => {
    const result = await dataSource.query(
      'SELECT stock FROM product_variants WHERE id = $1',
      [id],
    );
    return Number(result[0].stock);
  };

  const addToCart = (token: string, itemVariantId: number, quantity: number) =>
    request(app.getHttpServer())
      .post('/me/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId: itemVariantId, quantity })
      .expect(201);

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
        name: `Producto Orders E2E ${run}`,
        status: 'published',
        variants: [{ sku: `ORDER-VAR-${run}`, price: 1000, stock: 10 }],
      })
      .expect(201);
    const product = body<Product>(productRes);
    productId = product.id;
    variantId = product.variants[0].id;

    const limitedRes = await request(app.getHttpServer())
      .post(`/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `ORDER-VAR-LIMITED-${run}`, price: 500, stock: 1 })
      .expect(201);
    limitedVariantId = body<ProductVariant>(limitedRes).id;
  });

  afterAll(async () => {
    await dataSource.query(
      'DELETE FROM order_items WHERE "orderId" IN (SELECT id FROM orders WHERE "userId" = ANY($1))',
      [[userAId, userBId]],
    );
    await dataSource.query('DELETE FROM orders WHERE "userId" = ANY($1)', [
      [userAId, userBId],
    ]);
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

  describe('POST /me/orders', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .post('/me/orders')
        .send(shippingPayload)
        .expect(401);
    });

    it('devuelve 409 si el carrito está vacío', () => {
      return request(app.getHttpServer())
        .post('/me/orders')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(shippingPayload)
        .expect(409);
    });

    it('crea una orden a partir del carrito y descuenta el stock', async () => {
      await addToCart(userAToken, variantId, 2);

      const res = await request(app.getHttpServer())
        .post('/me/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(shippingPayload)
        .expect(201);

      const order = body<OrderDto>(res);
      expect(order.status).toBe('pending_payment');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].variantId).toBe(variantId);
      expect(order.items[0].quantity).toBe(2);
      expect(order.totalPrice).toBe(2000);

      expect(await stockOf(variantId)).toBe(8);

      const cartRes = await request(app.getHttpServer())
        .get('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
      expect(cartRes.body.items).toEqual([]);
    });

    it('devuelve 409 si la cantidad supera el stock disponible al momento del checkout', async () => {
      await addToCart(userAToken, limitedVariantId, 1);
      await dataSource.query(
        'UPDATE product_variants SET stock = 0 WHERE id = $1',
        [limitedVariantId],
      );

      await request(app.getHttpServer())
        .post('/me/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(shippingPayload)
        .expect(409);

      await dataSource.query(
        'UPDATE product_variants SET stock = 1 WHERE id = $1',
        [limitedVariantId],
      );
      await request(app.getHttpServer())
        .delete('/me/cart')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(204);
    });
  });

  describe('GET /me/orders', () => {
    it('devuelve solo las órdenes del usuario autenticado', async () => {
      const res = await request(app.getHttpServer())
        .get('/me/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      const orders = body<OrderDto[]>(res);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders.every((o) => o.userId === userAId)).toBe(true);
    });
  });

  describe('GET /me/orders/:orderId', () => {
    let orderId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .get('/me/orders')
        .set('Authorization', `Bearer ${userAToken}`);
      orderId = body<OrderDto[]>(res)[0].id;
    });

    it('devuelve 404 si la orden pertenece a otro usuario', () => {
      return request(app.getHttpServer())
        .get(`/me/orders/${orderId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('devuelve 404 para una orden inexistente', () => {
      return request(app.getHttpServer())
        .get('/me/orders/999999')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(404);
    });

    it('devuelve la orden del dueño', async () => {
      const res = await request(app.getHttpServer())
        .get(`/me/orders/${orderId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(body<OrderDto>(res).id).toBe(orderId);
    });
  });

  describe('PATCH /me/orders/:orderId (cancelar)', () => {
    let orderId: number;

    beforeAll(async () => {
      await addToCart(userAToken, variantId, 1);
      const res = await request(app.getHttpServer())
        .post('/me/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(shippingPayload);
      orderId = body<OrderDto>(res).id;
    });

    it('devuelve 404 si la orden pertenece a otro usuario', () => {
      return request(app.getHttpServer())
        .patch(`/me/orders/${orderId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ status: 'cancelled' })
        .expect(404);
    });

    it('cancela la orden y restaura el stock', async () => {
      const stockBefore = await stockOf(variantId);

      const res = await request(app.getHttpServer())
        .patch(`/me/orders/${orderId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ status: 'cancelled' })
        .expect(200);

      expect(body<OrderDto>(res).status).toBe('cancelled');
      expect(await stockOf(variantId)).toBe(stockBefore + 1);
    });

    it('devuelve 409 al intentar cancelar una orden ya cancelada', () => {
      return request(app.getHttpServer())
        .patch(`/me/orders/${orderId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ status: 'cancelled' })
        .expect(409);
    });
  });

  describe('GET /admin/orders', () => {
    it('devuelve 403 para un usuario no admin', () => {
      return request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(403);
    });

    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/admin/orders').expect(401);
    });

    it('devuelve órdenes de todos los usuarios para un admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const orders = body<OrderDto[]>(res);
      const userIds = new Set(orders.map((o) => o.userId));
      expect(userIds.has(userAId)).toBe(true);
    });
  });

  describe('PATCH /admin/orders/:orderId/status', () => {
    let orderId: number;

    beforeAll(async () => {
      await addToCart(userAToken, variantId, 1);
      const res = await request(app.getHttpServer())
        .post('/me/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(shippingPayload);
      orderId = body<OrderDto>(res).id;
    });

    it('devuelve 403 para un usuario no admin', () => {
      return request(app.getHttpServer())
        .patch(`/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ status: 'paid' })
        .expect(403);
    });

    it('marca la orden como pagada (mock de pago)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'paid' })
        .expect(200);

      expect(body<OrderDto>(res).status).toBe('paid');
    });

    it('devuelve 409 ante una transición inválida', () => {
      return request(app.getHttpServer())
        .patch(`/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'pending_payment' })
        .expect(409);
    });

    it('avanza la orden a shipped y luego delivered', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'delivered' })
        .expect(200);

      expect(body<OrderDto>(res).status).toBe('delivered');
    });
  });
});
