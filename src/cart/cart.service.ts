import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { ConflictError } from '../common/errors/conflict.error';
import { NotFoundError } from '../common/errors/not-found.error';
import { ProductVariant } from '../catalog/products/entities/product-variant.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartDto, CartItemDto } from './dto/cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';

const CART_RELATIONS = [
  'items',
  'items.variant',
  'items.variant.product',
  'items.variant.product.images',
];

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartsRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemsRepo: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
  ) {}

  private async getOrCreateCart(userId: number): Promise<Cart> {
    const existing = await this.cartsRepo.findOne({
      where: { userId },
      relations: CART_RELATIONS,
    });
    if (existing) return existing;

    const cart = this.cartsRepo.create({ userId, items: [] });
    await this.cartsRepo.save(cart);
    return this.cartsRepo.findOneOrFail({
      where: { id: cart.id },
      relations: CART_RELATIONS,
    });
  }

  private toDto(cart: Cart): CartDto {
    let totalPrice = new Decimal(0);

    const items: CartItemDto[] = cart.items.map((item) => {
      const subtotal = item.price.times(item.quantity);
      totalPrice = totalPrice.plus(subtotal);

      const coverImage =
        item.variant.product.images.find((img) => img.isCover) ??
        item.variant.product.images[0] ??
        null;

      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.variant.product.name,
        sku: item.variant.sku,
        coverImageUrl: coverImage?.url ?? null,
        quantity: item.quantity,
        price: item.price.toNumber(),
        subtotal: subtotal.toNumber(),
      };
    });

    return {
      id: cart.id,
      items,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: totalPrice.toNumber(),
    };
  }

  async getCart(userId: number): Promise<CartDto> {
    const cart = await this.getOrCreateCart(userId);
    return this.toDto(cart);
  }

  async addItem(userId: number, dto: AddCartItemDto): Promise<CartDto> {
    const variant = await this.variantsRepo.findOne({
      where: { id: dto.variantId },
      relations: ['product', 'product.images'],
    });
    if (!variant || !variant.active)
      throw new NotFoundError(`Variant ${dto.variantId} not found`);

    const cart = await this.getOrCreateCart(userId);
    const existingItem = cart.items.find((i) => i.variantId === dto.variantId);
    const finalQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

    if (finalQuantity > variant.stock)
      throw new ConflictError(
        `Only ${variant.stock} unit(s) available for variant ${dto.variantId}`,
      );

    if (existingItem) {
      existingItem.quantity = finalQuantity;
      await this.cartItemsRepo.save(existingItem);
    } else {
      const item = this.cartItemsRepo.create({
        cartId: cart.id,
        variantId: dto.variantId,
        quantity: dto.quantity,
        price: variant.price,
      });
      await this.cartItemsRepo.save(item);
    }

    return this.getCart(userId);
  }

  async updateItem(
    userId: number,
    itemId: number,
    dto: UpdateCartItemDto,
  ): Promise<CartDto> {
    const item = await this.cartItemsRepo.findOne({
      where: { id: itemId },
      relations: ['cart', 'variant'],
    });
    if (!item || item.cart.userId !== userId)
      throw new NotFoundError(`Cart item ${itemId} not found`);

    if (dto.quantity > item.variant.stock)
      throw new ConflictError(
        `Only ${item.variant.stock} unit(s) available for variant ${item.variantId}`,
      );

    item.quantity = dto.quantity;
    await this.cartItemsRepo.save(item);

    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number): Promise<CartDto> {
    const item = await this.cartItemsRepo.findOne({
      where: { id: itemId },
      relations: ['cart'],
    });
    if (!item || item.cart.userId !== userId)
      throw new NotFoundError(`Cart item ${itemId} not found`);

    await this.cartItemsRepo.remove(item);

    return this.getCart(userId);
  }

  async clearCart(userId: number): Promise<void> {
    const cart = await this.getOrCreateCart(userId);
    await this.cartItemsRepo.delete({ cartId: cart.id });
  }
}
