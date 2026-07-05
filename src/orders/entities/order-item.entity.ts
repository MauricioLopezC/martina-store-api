import { Transform } from 'class-transformer';
import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { ProductVariant } from '../../catalog/products/entities/product-variant.entity';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  order: Order;

  @Column({ nullable: true })
  variantId: number | null;

  // Orders must survive even if the underlying variant/product is later
  // deleted, so this doesn't cascade like CartItem's variant relation does.
  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  variant: ProductVariant | null;

  @Column()
  productNameSnapshot: string;

  @Column()
  skuSnapshot: string;

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
}
