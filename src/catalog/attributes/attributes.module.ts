import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttributesController } from './attributes.controller';
import { AttributesService } from './attributes.service';
import { AttributeValue } from './entities/attribute-value.entity';
import { Attribute } from './entities/attribute.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Attribute, AttributeValue])],
  controllers: [AttributesController],
  providers: [AttributesService],
})
export class AttributesModule {}
