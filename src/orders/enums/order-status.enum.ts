export enum OrderStatus {
  PendingPayment = 'pending_payment',
  Paid = 'paid',
  Cancelled = 'cancelled',
  Shipped = 'shipped',
  Delivered = 'delivered',
}

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PendingPayment]: [OrderStatus.Paid, OrderStatus.Cancelled],
  [OrderStatus.Paid]: [OrderStatus.Shipped, OrderStatus.Cancelled],
  [OrderStatus.Cancelled]: [],
  [OrderStatus.Shipped]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
};
