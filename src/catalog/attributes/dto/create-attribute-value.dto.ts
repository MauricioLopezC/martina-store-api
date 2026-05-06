import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAttributeValueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value: string;
}
