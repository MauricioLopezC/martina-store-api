export class CartItemDto {
  id: number;
  variantId: number;
  productName: string;
  sku: string;
  coverImageUrl: string | null;
  quantity: number;
  price: number;
  subtotal: number;
}

export class CartDto {
  id: number;
  items: CartItemDto[];
  totalItems: number;
  totalPrice: number;
}
