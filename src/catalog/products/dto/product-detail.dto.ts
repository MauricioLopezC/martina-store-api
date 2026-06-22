import { ProductStatus } from '../enums/product-status.enum';
import { CategorySummaryDto } from './product-summary.dto';

export class AttributeDto {
  id: number;
  name: string;
}

export class AttributeValueDetailDto {
  id: number;
  attributeId: number;
  value: string;
  attribute: AttributeDto;
}

export class VariantDetailDto {
  id: number;
  productId: number;
  sku: string;
  price: string;
  stock: number;
  active: boolean;
  attributeValues: AttributeValueDetailDto[];
}

export class ImageDetailDto {
  id: number;
  productId: number;
  url: string;
  position: number;
  isCover: boolean;
  altText: string | null;
}

export class ProductDetailDto {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  slug: string;
  brand: string | null;
  status: ProductStatus;
  variants: VariantDetailDto[];
  images: ImageDetailDto[];
  categories: CategorySummaryDto[];
}
