import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource, In, Repository } from 'typeorm';
import { ConflictError } from '../../common/errors/conflict.error';
import { NotFoundError } from '../../common/errors/not-found.error';
import { toSlug } from '../../common/utils/slug.util';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../../storage/storage.service.interface';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductDetailDto } from './dto/product-detail.dto';
import { ListAllProductsDto } from './dto/list-all-products.dto';
import {
  ProductSummaryDto,
  ProductSummaryPageDto,
} from './dto/product-summary.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListAllProductsAdminDto } from './dto/list-all-products-admin.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';
import { ProductStatus } from './enums/product-status.enum';

const PRODUCT_RELATIONS = [
  'variants',
  'variants.attributeValues',
  'variants.attributeValues.attribute',
  'images',
  'categories',
];

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

  private async resolveSlug(name: string, slug?: string): Promise<string> {
    const candidate = slug ?? toSlug(name);
    const existing = await this.productsRepo.findOneBy({ slug: candidate });
    if (existing)
      throw new ConflictError(`Slug "${candidate}" is already in use`);
    return candidate;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = await this.resolveSlug(dto.name, dto.slug);
    const categories = dto.categoryIds?.length
      ? await this.categoriesRepo.findBy({ id: In(dto.categoryIds) })
      : [];

    const { variants: variantDtos, ...productFields } = dto;

    if (!variantDtos?.length) {
      const product = this.productsRepo.create({
        ...productFields,
        slug,
        categories,
      });
      return this.productsRepo.save(product);
    }

    const skus = variantDtos.map((v) => v.sku);
    const duplicateSku = await this.variantsRepo.findOneBy({ sku: In(skus) });
    if (duplicateSku)
      throw new ConflictError(`SKU "${duplicateSku.sku}" is already in use`);

    return this.dataSource.transaction(async (manager) => {
      const product = manager.create(Product, {
        ...productFields,
        slug,
        categories,
      });
      await manager.save(product);

      for (const variantDto of variantDtos) {
        const { attributeValueIds, price, ...variantFields } = variantDto;
        const attributeValues = attributeValueIds?.length
          ? await this.attrValuesRepo.findBy({ id: In(attributeValueIds) })
          : [];
        const variant = manager.create(ProductVariant, {
          ...variantFields,
          price: new Decimal(price),
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

  async findAllPublished(
    dto: ListAllProductsDto,
  ): Promise<ProductSummaryPageDto> {
    return this.listProducts(dto, ProductStatus.Published);
  }

  async findAllForAdmin(
    dto: ListAllProductsAdminDto,
  ): Promise<ProductSummaryPageDto> {
    return this.listProducts(dto, dto.status);
  }

  private async listProducts(
    dto: ListAllProductsDto,
    status?: ProductStatus,
  ): Promise<ProductSummaryPageDto> {
    const { page = 1, limit = 20, categoryId } = dto;

    let products: Product[];
    let total: number;

    if (categoryId) {
      // Exact category match only; does not include subcategories
      // (Category has parentId/children) — a possible future extension,
      // out of scope for now.
      const baseQuery = () => {
        const qb = this.productsRepo
          .createQueryBuilder('p')
          .innerJoin('p.categories', 'c', 'c.id = :categoryId', {
            categoryId,
          });
        return status ? qb.where('p.status = :status', { status }) : qb;
      };

      const idRows = await baseQuery()
        .select('p.id', 'id')
        .orderBy('p.id', 'ASC')
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany<{ id: number }>();

      const pagedIds = idRows.map((r) => r.id);
      total = await baseQuery().getCount();

      const rows = pagedIds.length
        ? await this.productsRepo.find({
            where: { id: In(pagedIds) },
            relations: ['images', 'categories'],
          })
        : [];
      const byId = new Map(rows.map((p) => [p.id, p]));
      products = pagedIds
        .map((id) => byId.get(id))
        .filter((p): p is Product => !!p);
    } else {
      const [rows, count] = await this.productsRepo.findAndCount({
        where: status ? { status } : {},
        relations: ['images', 'categories'],
        order: { id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      products = rows;
      total = count;
    }

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
      minPriceRows.map((r) => [
        r.productId,
        r.minPrice ? new Decimal(r.minPrice).toNumber() : null,
      ]),
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

  private async findOneEntity(
    id: number,
    relations: string[] = [],
  ): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations,
    });
    if (!product) throw new NotFoundError(`Product #${id} not found`);
    return product;
  }

  async findOne(id: number): Promise<ProductDetailDto> {
    const product = await this.findOneEntity(id, PRODUCT_RELATIONS);
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      active: product.active,
      slug: product.slug,
      brand: product.brand,
      status: product.status,
      variants: product.variants.map((v) => ({
        id: v.id,
        productId: v.productId,
        sku: v.sku,
        price: v.price.toFixed(2),
        stock: v.stock,
        active: v.active,
        attributeValues: v.attributeValues.map((av) => ({
          id: av.id,
          attributeId: av.attributeId,
          value: av.value,
          attribute: { id: av.attribute.id, name: av.attribute.name },
        })),
      })),
      images: product.images.map((img) => ({
        id: img.id,
        productId: img.productId,
        url: img.url,
        position: img.position,
        isCover: img.isCover,
        altText: img.altText,
      })),
      categories: product.categories.map((c) => ({ id: c.id, name: c.name })),
    };
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
    const product = await this.findOneEntity(id, ['categories']);
    if (dto.slug && dto.slug !== product.slug) {
      const existing = await this.productsRepo.findOneBy({ slug: dto.slug });
      if (existing)
        throw new ConflictError(`Slug "${dto.slug}" is already in use`);
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
    const product = await this.findOneEntity(id);
    await this.productsRepo.remove(product);
  }

  // Variants

  async createVariant(
    productId: number,
    dto: CreateVariantDto,
  ): Promise<ProductVariant> {
    await this.findOneEntity(productId);
    const skuExists = await this.variantsRepo.findOneBy({ sku: dto.sku });
    if (skuExists)
      throw new ConflictError(`SKU "${dto.sku}" is already in use`);
    const attributeValues = dto.attributeValueIds?.length
      ? await this.attrValuesRepo.findBy({ id: In(dto.attributeValueIds) })
      : [];
    const { price, ...variantFields } = dto;
    const variant = this.variantsRepo.create({
      ...variantFields,
      price: new Decimal(price),
      productId,
      attributeValues,
    });
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
      if (skuExists)
        throw new ConflictError(`SKU "${dto.sku}" is already in use`);
    }
    if (dto.attributeValueIds !== undefined) {
      variant.attributeValues = dto.attributeValueIds.length
        ? await this.attrValuesRepo.findBy({ id: In(dto.attributeValueIds) })
        : [];
    }
    const { attributeValueIds: _, price, ...rest } = dto;
    Object.assign(variant, rest);
    if (price !== undefined) variant.price = new Decimal(price);
    return this.variantsRepo.save(variant);
  }

  async removeVariant(productId: number, variantId: number): Promise<void> {
    const variant = await this.variantsRepo.findOneBy({
      id: variantId,
      productId,
    });
    if (!variant) throw new NotFoundError(`Variant #${variantId} not found`);
    await this.variantsRepo.remove(variant);
  }

  // Images

  async createImage(
    productId: number,
    file: Express.Multer.File,
    dto: CreateImageDto,
  ): Promise<ProductImage> {
    await this.findOneEntity(productId);
    const url = await this.storageService.upload(file);

    if (dto.isCover) {
      return this.dataSource.transaction(async (manager) => {
        await manager.update(
          ProductImage,
          { productId, isCover: true },
          { isCover: false },
        );
        const image = manager.create(ProductImage, { ...dto, productId, url });
        return manager.save(image);
      });
    }

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

    if (dto.isCover) {
      return this.dataSource.transaction(async (manager) => {
        await manager.update(
          ProductImage,
          { productId, isCover: true },
          { isCover: false },
        );
        Object.assign(image, dto);
        return manager.save(image);
      });
    }

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
