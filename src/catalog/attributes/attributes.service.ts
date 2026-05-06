import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictError } from '../../common/errors/conflict.error';
import { NotFoundError } from '../../common/errors/not-found.error';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto';
import { AttributeValue } from './entities/attribute-value.entity';
import { Attribute } from './entities/attribute.entity';

@Injectable()
export class AttributesService {
  constructor(
    @InjectRepository(Attribute)
    private readonly attributesRepo: Repository<Attribute>,
    @InjectRepository(AttributeValue)
    private readonly valuesRepo: Repository<AttributeValue>,
  ) {}

  async create(dto: CreateAttributeDto): Promise<Attribute> {
    const existing = await this.attributesRepo.findOneBy({ name: dto.name });
    if (existing) throw new ConflictError(`Attribute "${dto.name}" already exists`);
    const attribute = this.attributesRepo.create(dto);
    return this.attributesRepo.save(attribute);
  }

  findAll(): Promise<Attribute[]> {
    return this.attributesRepo.find({ relations: ['values'] });
  }

  async findOne(id: number): Promise<Attribute> {
    const attribute = await this.attributesRepo.findOne({
      where: { id },
      relations: ['values'],
    });
    if (!attribute) throw new NotFoundError(`Attribute #${id} not found`);
    return attribute;
  }

  async update(id: number, dto: UpdateAttributeDto): Promise<Attribute> {
    const attribute = await this.findOne(id);
    if (dto.name && dto.name !== attribute.name) {
      const existing = await this.attributesRepo.findOneBy({ name: dto.name });
      if (existing) throw new ConflictError(`Attribute "${dto.name}" already exists`);
    }
    Object.assign(attribute, dto);
    return this.attributesRepo.save(attribute);
  }

  async remove(id: number): Promise<void> {
    const attribute = await this.findOne(id);
    await this.attributesRepo.remove(attribute);
  }

  async createValue(attributeId: number, dto: CreateAttributeValueDto): Promise<AttributeValue> {
    await this.findOne(attributeId);
    const existing = await this.valuesRepo.findOneBy({ attributeId, value: dto.value });
    if (existing) {
      throw new ConflictError(`Value "${dto.value}" already exists for this attribute`);
    }
    const attrValue = this.valuesRepo.create({ ...dto, attributeId });
    return this.valuesRepo.save(attrValue);
  }

  async updateValue(
    attributeId: number,
    valueId: number,
    dto: UpdateAttributeValueDto,
  ): Promise<AttributeValue> {
    const attrValue = await this.valuesRepo.findOneBy({ id: valueId, attributeId });
    if (!attrValue) throw new NotFoundError(`Value #${valueId} not found`);
    if (dto.value && dto.value !== attrValue.value) {
      const existing = await this.valuesRepo.findOneBy({ attributeId, value: dto.value });
      if (existing) {
        throw new ConflictError(`Value "${dto.value}" already exists for this attribute`);
      }
    }
    Object.assign(attrValue, dto);
    return this.valuesRepo.save(attrValue);
  }

  async removeValue(attributeId: number, valueId: number): Promise<void> {
    const attrValue = await this.valuesRepo.findOneBy({ id: valueId, attributeId });
    if (!attrValue) throw new NotFoundError(`Value #${valueId} not found`);
    await this.valuesRepo.remove(attrValue);
  }
}
