import { IsEnum, IsOptional } from 'class-validator';
import { ListAllProductsDto } from './list-all-products.dto';
import { ProductStatus } from '../enums/product-status.enum';

export class ListAllProductsAdminDto extends ListAllProductsDto {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
