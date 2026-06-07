export class CoverImageDto {
  url: string;
  altText: string | null;
}

export class CategorySummaryDto {
  id: number;
  name: string;
}

export class ProductSummaryDto {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  status: string;
  minPrice: number | null;
  coverImage: CoverImageDto | null;
  categories: CategorySummaryDto[];
}
