import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConflictError } from '../common/errors/conflict.error';
import { InvalidOrderStateError } from '../common/errors/invalid-order-state.error';
import { NotFoundError } from '../common/errors/not-found.error';
import { ProductVariant } from '../catalog/products/entities/product-variant.entity';
import { Cart } from '../cart/entities/cart.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { OrderDto, OrderItemDto } from './dto/order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import {
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
} from './enums/order-status.enum';

const ORDER_RELATIONS = ['items'];

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(Cart)
    private readonly cartsRepo: Repository<Cart>,
    private readonly dataSource: DataSource,
  ) {}

  private toDto(order: Order): OrderDto {
    let totalPrice = new Decimal(0);

    const items: OrderItemDto[] = order.items.map((item) => {
      const subtotal = item.price.times(item.quantity);
      totalPrice = totalPrice.plus(subtotal);

      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.productNameSnapshot,
        sku: item.skuSnapshot,
        quantity: item.quantity,
        price: item.price.toNumber(),
        subtotal: subtotal.toNumber(),
      };
    });

    return {
      id: order.id,
      userId: order.userId,
      status: order.status,
      items,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: totalPrice.toNumber(),
      shippingAddressLine: order.shippingAddressLine,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingZipCode: order.shippingZipCode,
      shippingPhone: order.shippingPhone,
      externalReference: order.externalReference,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async findOrderOrFail(orderId: number): Promise<Order> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ORDER_RELATIONS,
    });
    if (!order) throw new NotFoundError(`Order ${orderId} not found`);
    return order;
  }

  private assertTransition(current: OrderStatus, next: OrderStatus): void {
    if (!ORDER_STATUS_TRANSITIONS[current].includes(next))
      throw new InvalidOrderStateError(
        `Cannot transition order from "${current}" to "${next}"`,
      );
  }

  private async restoreStock(manager: EntityManager, order: Order) {
    for (const item of order.items) {
      if (item.variantId === null) continue;
      await manager.increment(
        ProductVariant,
        { id: item.variantId },
        'stock',
        item.quantity,
      );
    }
  }

  async checkout(userId: number, dto: CheckoutOrderDto): Promise<OrderDto> {
    const cart = await this.cartsRepo.findOne({
      where: { userId },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });
    if (!cart || cart.items.length === 0)
      throw new ConflictError('Cart is empty');

    const order = await this.dataSource.transaction(async (manager) => {
      for (const item of cart.items) {
        const variant = await manager.findOneOrFail(ProductVariant, {
          where: { id: item.variantId },
        });
        if (variant.stock < item.quantity)
          throw new ConflictError(
            `Only ${variant.stock} unit(s) available for variant ${item.variantId}`,
          );
      }

      const totalPrice = cart.items.reduce(
        (sum, item) => sum.plus(item.price.times(item.quantity)),
        new Decimal(0),
      );

      const newOrder = manager.create(Order, {
        userId,
        status: OrderStatus.PendingPayment,
        totalPrice,
        shippingAddressLine: dto.shippingAddressLine,
        shippingCity: dto.shippingCity,
        shippingState: dto.shippingState,
        shippingZipCode: dto.shippingZipCode,
        shippingPhone: dto.shippingPhone ?? null,
      });
      await manager.save(newOrder);

      for (const item of cart.items) {
        const orderItem = manager.create(OrderItem, {
          orderId: newOrder.id,
          variantId: item.variantId,
          productNameSnapshot: item.variant.product.name,
          skuSnapshot: item.variant.sku,
          quantity: item.quantity,
          price: item.price,
        });
        await manager.save(orderItem);

        await manager.decrement(
          ProductVariant,
          { id: item.variantId },
          'stock',
          item.quantity,
        );
      }

      await manager.delete(CartItem, { cartId: cart.id });

      return manager.findOneOrFail(Order, {
        where: { id: newOrder.id },
        relations: ORDER_RELATIONS,
      });
    });

    return this.toDto(order);
  }

  async listMine(userId: number): Promise<OrderDto[]> {
    const orders = await this.ordersRepo.find({
      where: { userId },
      relations: ORDER_RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return orders.map((order) => this.toDto(order));
  }

  async getOne(userId: number, orderId: number): Promise<OrderDto> {
    const order = await this.findOrderOrFail(orderId);
    if (order.userId !== userId)
      throw new NotFoundError(`Order ${orderId} not found`);
    return this.toDto(order);
  }

  async cancel(
    userId: number,
    orderId: number,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderDto> {
    if (dto.status !== OrderStatus.Cancelled)
      throw new InvalidOrderStateError(
        'Only cancellation is allowed on this endpoint',
      );

    const order = await this.findOrderOrFail(orderId);
    if (order.userId !== userId)
      throw new NotFoundError(`Order ${orderId} not found`);

    return this.transitionTo(order, OrderStatus.Cancelled);
  }

  async listAll(): Promise<OrderDto[]> {
    const orders = await this.ordersRepo.find({
      relations: ORDER_RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return orders.map((order) => this.toDto(order));
  }

  async getOneAdmin(orderId: number): Promise<OrderDto> {
    const order = await this.findOrderOrFail(orderId);
    return this.toDto(order);
  }

  // Extension point for the future PaymentsModule (MercadoPago webhook).
  async markPaid(orderId: number): Promise<OrderDto> {
    const order = await this.findOrderOrFail(orderId);
    return this.transitionTo(order, OrderStatus.Paid);
  }

  async updateStatus(
    orderId: number,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderDto> {
    const order = await this.findOrderOrFail(orderId);
    return this.transitionTo(order, dto.status);
  }

  private async transitionTo(
    order: Order,
    next: OrderStatus,
  ): Promise<OrderDto> {
    this.assertTransition(order.status, next);

    const updated = await this.dataSource.transaction(async (manager) => {
      if (next === OrderStatus.Cancelled)
        await this.restoreStock(manager, order);
      await manager.update(Order, { id: order.id }, { status: next });
      return manager.findOneOrFail(Order, {
        where: { id: order.id },
        relations: ORDER_RELATIONS,
      });
    });

    return this.toDto(updated);
  }
}
