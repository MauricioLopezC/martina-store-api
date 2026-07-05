import { Transform } from 'class-transformer';
import { Decimal } from 'decimal.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PendingPayment,
  })
  status: OrderStatus;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @Transform(({ value }: { value: Decimal }) => value?.toNumber())
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalPrice: Decimal;

  @Column()
  shippingAddressLine: string;

  @Column()
  shippingCity: string;

  @Column()
  shippingState: string;

  @Column()
  shippingZipCode: string;

  @Column({ nullable: true, type: 'varchar' })
  shippingPhone: string | null;

  // Seam for the future PaymentsModule (MercadoPago): its webhook will look up
  // the order by this field instead of the internal id.
  @Column({ nullable: true, unique: true, type: 'varchar' })
  externalReference: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
