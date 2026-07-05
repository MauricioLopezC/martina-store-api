import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateImageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' || typeof value === 'number'
      ? parseInt(String(value), 10)
      : undefined,
  )
  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isCover?: boolean;

  @IsString()
  @IsOptional()
  altText?: string;
}
