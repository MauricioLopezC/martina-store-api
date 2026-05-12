import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '../enums/product-status.enum';
import { CreateVariantDto } from './create-variant.dto';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  brand?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  categoryIds?: number[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @IsOptional()
  variants?: CreateVariantDto[];
}
