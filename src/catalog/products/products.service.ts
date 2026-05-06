import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';
import { ProductStatus } from './enums/product-status.enum';

const PRODUCT_RELATIONS = ['variants', 'variants.attributeValues', 'images', 'categories'];

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly imagesRepo: Repository<ProductImage>,
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(AttributeValue)
    private readonly attrValuesRepo: Repository<AttributeValue>,
  ) {}

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  private async resolveSlug(name: string, slug?: string): Promise<string> {
    const candidate = slug ?? this.toSlug(name);
    const existing = await this.productsRepo.findOneBy({ slug: candidate });
    if (existing) throw new ConflictException(`Slug "${candidate}" is already in use`);
    return candidate;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = await this.resolveSlug(dto.name, dto.slug);
    const categories = dto.categoryIds?.length
      ? await this.categoriesRepo.findBy({ id: In(dto.categoryIds) })
      : [];
    const product = this.productsRepo.create({ ...dto, slug, categories });
    return this.productsRepo.save(product);
  }

  findAllPublished(): Promise<Product[]> {
    return this.productsRepo.find({
      where: { status: ProductStatus.Published },
      relations: PRODUCT_RELATIONS,
    });
  }

  findAll(): Promise<Product[]> {
    return this.productsRepo.find({ relations: PRODUCT_RELATIONS });
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: PRODUCT_RELATIONS,
    });
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    return product;
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { slug, status: ProductStatus.Published },
      relations: PRODUCT_RELATIONS,
    });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);
    return product;
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.slug && dto.slug !== product.slug) {
      const existing = await this.productsRepo.findOneBy({ slug: dto.slug });
      if (existing) throw new ConflictException(`Slug "${dto.slug}" is already in use`);
    }
    if (dto.categoryIds !== undefined) {
      product.categories = dto.categoryIds.length
        ? await this.categoriesRepo.findBy({ id: In(dto.categoryIds) })
        : [];
    }
    const { categoryIds: _, ...rest } = dto;
    Object.assign(product, rest);
    return this.productsRepo.save(product);
  }

  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    await this.productsRepo.remove(product);
  }

  // Variants

  async createVariant(productId: number, dto: CreateVariantDto): Promise<ProductVariant> {
    await this.findOne(productId);
    const skuExists = await this.variantsRepo.findOneBy({ sku: dto.sku });
    if (skuExists) throw new ConflictException(`SKU "${dto.sku}" is already in use`);
    const attributeValues = dto.attributeValueIds?.length
      ? await this.attrValuesRepo.findBy({ id: In(dto.attributeValueIds) })
      : [];
    const variant = this.variantsRepo.create({ ...dto, productId, attributeValues });
    return this.variantsRepo.save(variant);
  }

  async updateVariant(
    productId: number,
    variantId: number,
    dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.variantsRepo.findOne({
      where: { id: variantId, productId },
      relations: ['attributeValues'],
    });
    if (!variant) throw new NotFoundException(`Variant #${variantId} not found`);
    if (dto.sku && dto.sku !== variant.sku) {
      const skuExists = await this.variantsRepo.findOneBy({ sku: dto.sku });
      if (skuExists) throw new ConflictException(`SKU "${dto.sku}" is already in use`);
    }
    if (dto.attributeValueIds !== undefined) {
      variant.attributeValues = dto.attributeValueIds.length
        ? await this.attrValuesRepo.findBy({ id: In(dto.attributeValueIds) })
        : [];
    }
    const { attributeValueIds: _, ...rest } = dto;
    Object.assign(variant, rest);
    return this.variantsRepo.save(variant);
  }

  async removeVariant(productId: number, variantId: number): Promise<void> {
    const variant = await this.variantsRepo.findOneBy({ id: variantId, productId });
    if (!variant) throw new NotFoundException(`Variant #${variantId} not found`);
    await this.variantsRepo.remove(variant);
  }

  // Images

  async createImage(productId: number, dto: CreateImageDto): Promise<ProductImage> {
    await this.findOne(productId);
    const image = this.imagesRepo.create({ ...dto, productId });
    return this.imagesRepo.save(image);
  }

  async updateImage(
    productId: number,
    imageId: number,
    dto: UpdateImageDto,
  ): Promise<ProductImage> {
    const image = await this.imagesRepo.findOneBy({ id: imageId, productId });
    if (!image) throw new NotFoundException(`Image #${imageId} not found`);
    Object.assign(image, dto);
    return this.imagesRepo.save(image);
  }

  async removeImage(productId: number, imageId: number): Promise<void> {
    const image = await this.imagesRepo.findOneBy({ id: imageId, productId });
    if (!image) throw new NotFoundException(`Image #${imageId} not found`);
    await this.imagesRepo.remove(image);
  }
}
