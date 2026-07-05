import { Transform } from 'class-transformer';
import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { ProductVariant } from '../../catalog/products/entities/product-variant.entity';
import { Cart } from './cart.entity';

@Entity('cart_items')
@Unique(['cartId', 'variantId'])
export class CartItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  cartId: number;

  @ManyToOne(() => Cart, (c) => c.items, { onDelete: 'CASCADE' })
  cart: Cart;

  @Column()
  variantId: number;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  variant: ProductVariant;

  @Column({ type: 'int' })
  quantity: number;

  @Transform(({ value }: { value: Decimal }) => value?.toNumber())
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  price: Decimal;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
