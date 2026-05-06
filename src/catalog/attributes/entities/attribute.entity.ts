import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AttributeValue } from './attribute-value.entity';

@Entity('attributes')
export class Attribute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @OneToMany(() => AttributeValue, (av) => av.attribute, { cascade: true })
  values: AttributeValue[];
}
