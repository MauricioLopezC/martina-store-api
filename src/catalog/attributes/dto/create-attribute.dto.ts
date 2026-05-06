import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAttributeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
