import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ConflictError } from '../../common/errors/conflict.error';
import { NotFoundError } from '../../common/errors/not-found.error';
import { IStorageService, STORAGE_SERVICE } from '../../storage/storage.service.interface';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListAllProductsDto } from './dto/list-all-products.dto';
import { ProductSummaryDto, ProductSummaryPageDto } from './dto/product-summary.dto';
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
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly dataSource: DataSource,
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
    if (existing) throw new ConflictError(`Slug "${candidate}" is already in use`);
    return candidate;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = await this.resolveSlug(dto.name, dto.slug);
    const categories = dto.categoryIds?.length
      ? await this.categoriesRepo.findBy({ id: In(dto.categoryIds) })
      : [];

    const { variants: variantDtos, ...productFields } = dto;

    if (!variantDtos?.length) {
      const product = this.productsRepo.create({ ...productFields, slug, categories });
      return this.productsRepo.save(product);
    }

    const skus = variantDtos.map((v) => v.sku);
    const duplicateSku = await this.variantsRepo.findOneBy({ sku: In(skus) });
    if (duplicateSku) throw new ConflictError(`SKU "${duplicateSku.sku}" is already in use`);

    return this.dataSource.transaction(async (manager) => {
      const product = manager.create(Product, { ...productFields, slug, categories });
      await manager.save(product);

      for (const variantDto of variantDtos) {
        const { attributeValueIds, ...variantFields } = variantDto;
        const attributeValues = attributeValueIds?.length
          ? await this.attrValuesRepo.findBy({ id: In(attributeValueIds) })
          : [];
        const variant = manager.create(ProductVariant, {
          ...variantFields,
          productId: product.id,
          attributeValues,
        });
        await manager.save(variant);
      }

      return manager.findOneOrFail(Product, {
        where: { id: product.id },
        relations: PRODUCT_RELATIONS,
      });
    });
  }

  async findAllPublished(dto: ListAllProductsDto): Promise<ProductSummaryPageDto> {
    const { page = 1, limit = 20 } = dto;

    const [products, total] = await this.productsRepo.findAndCount({
      where: { status: ProductStatus.Published },
      relations: ['images', 'categories'],
      skip: (page - 1) * limit,
      take: limit,
    });

    const ids = products.map((p) => p.id);
    const minPriceRows: { productId: number; minPrice: string }[] = ids.length
      ? await this.variantsRepo
          .createQueryBuilder('v')
          .select('v.productId', 'productId')
          .addSelect('MIN(v.price)', 'minPrice')
          .where('v.productId IN (:...ids)', { ids })
          .andWhere('v.active = true')
          .groupBy('v.productId')
          .getRawMany()
      : [];

    const minPriceMap = new Map(
      minPriceRows.map((r) => [r.productId, r.minPrice ? parseFloat(r.minPrice) : null]),
    );

    const data: ProductSummaryDto[] = products.map((p) => {
      const cover = p.images.find((img) => img.isCover);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        brand: p.brand ?? null,
        status: p.status,
        minPrice: minPriceMap.get(p.id) ?? null,
        coverImage: cover ? { url: cover.url, altText: cover.altText } : null,
        categories: p.categories.map((c) => ({ id: c.id, name: c.name })),
      };
    });

    return { data, total, page, limit };
  }

  async findAll(
    dto: ListAllProductsDto,
  ): Promise<{ data: Product[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20 } = dto;
    const [data, total] = await this.productsRepo.findAndCount({
      relations: PRODUCT_RELATIONS,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: PRODUCT_RELATIONS,
    });
    if (!product) throw new NotFoundError(`Product #${id} not found`);
    return product;
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { slug, status: ProductStatus.Published },
      relations: PRODUCT_RELATIONS,
    });
    if (!product) throw new NotFoundError(`Product "${slug}" not found`);
    return product;
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.slug && dto.slug !== product.slug) {
      const existing = await this.productsRepo.findOneBy({ slug: dto.slug });
      if (existing) throw new ConflictError(`Slug "${dto.slug}" is already in use`);
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
    if (skuExists) throw new ConflictError(`SKU "${dto.sku}" is already in use`);
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
    if (!variant) throw new NotFoundError(`Variant #${variantId} not found`);
    if (dto.sku && dto.sku !== variant.sku) {
      const skuExists = await this.variantsRepo.findOneBy({ sku: dto.sku });
      if (skuExists) throw new ConflictError(`SKU "${dto.sku}" is already in use`);
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
    if (!variant) throw new NotFoundError(`Variant #${variantId} not found`);
    await this.variantsRepo.remove(variant);
  }

  // Images

  async createImage(
    productId: number,
    file: Express.Multer.File,
    dto: CreateImageDto,
  ): Promise<ProductImage> {
    await this.findOne(productId);
    const url = await this.storageService.upload(file);
    const image = this.imagesRepo.create({ ...dto, productId, url });
    return this.imagesRepo.save(image);
  }

  async updateImage(
    productId: number,
    imageId: number,
    dto: UpdateImageDto,
  ): Promise<ProductImage> {
    const image = await this.imagesRepo.findOneBy({ id: imageId, productId });
    if (!image) throw new NotFoundError(`Image #${imageId} not found`);
    Object.assign(image, dto);
    return this.imagesRepo.save(image);
  }

  async removeImage(productId: number, imageId: number): Promise<void> {
    const image = await this.imagesRepo.findOneBy({ id: imageId, productId });
    if (!image) throw new NotFoundError(`Image #${imageId} not found`);
    await this.storageService.delete(image.url);
    await this.imagesRepo.remove(image);
  }
}
