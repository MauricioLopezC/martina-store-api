import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Attribute } from './attribute.entity';

@Entity('attribute_values')
@Unique(['attributeId', 'value'])
export class AttributeValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  attributeId: number;

  @ManyToOne(() => Attribute, (a) => a.values, { onDelete: 'CASCADE' })
  attribute: Attribute;

  @Column()
  value: string;
}
