import { Transform } from 'class-transformer';
import { Decimal } from 'decimal.js';
import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { AttributeValue } from '../../attributes/entities/attribute-value.entity';
import { Product } from './product.entity';

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productId: number;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: 'CASCADE' })
  product: Product;

  @Column({ unique: true })
  sku: string;

  @Transform(({ value }: { value: Decimal }) => value?.toNumber())
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  price: Decimal;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ default: true })
  active: boolean;

  @ManyToMany(() => AttributeValue)
  @JoinTable({
    name: 'variant_attribute_values',
    joinColumn: { name: 'variant_id' },
    inverseJoinColumn: { name: 'attribute_value_id' },
  })
  attributeValues: AttributeValue[];
}
