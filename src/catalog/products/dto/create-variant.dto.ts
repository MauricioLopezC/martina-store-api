import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  attributeValueIds?: number[];
}
