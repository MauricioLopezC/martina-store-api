import { OrderStatus } from '../enums/order-status.enum';

export class OrderItemDto {
  id: number;
  variantId: number | null;
  productName: string;
  sku: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export class OrderDto {
  id: number;
  userId: number;
  status: OrderStatus;
  items: OrderItemDto[];
  totalItems: number;
  totalPrice: number;
  shippingAddressLine: string;
  shippingCity: string;
  shippingState: string;
  shippingZipCode: string;
  shippingPhone: string | null;
  externalReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}
