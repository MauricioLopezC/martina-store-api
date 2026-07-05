import { Decimal } from 'decimal.js';
import { ValueTransformer } from 'typeorm';

export const decimalTransformer: ValueTransformer = {
  to: (value?: Decimal | number | null) =>
    value == null ? value : value.toString(),
  from: (value?: string | null) => (value == null ? value : new Decimal(value)),
};
