import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CheckoutOrderDto {
  @IsString()
  @IsNotEmpty()
  shippingAddressLine: string;

  @IsString()
  @IsNotEmpty()
  shippingCity: string;

  @IsString()
  @IsNotEmpty()
  shippingState: string;

  @IsString()
  @IsNotEmpty()
  shippingZipCode: string;

  @IsOptional()
  @IsString()
  shippingPhone?: string;
}
