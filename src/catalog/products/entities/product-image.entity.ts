import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productId: number;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
  product: Product;

  @Column()
  url: string;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ default: false })
  isCover: boolean;

  @Column({ nullable: true })
  altText: string | null;
}
