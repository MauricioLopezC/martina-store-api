# Reglas de negocio

Registro de las reglas de negocio no triviales de la app — el "por qué" detrás de decisiones que no se explican solas leyendo el código. Se va actualizando a medida que se agregan módulos.

## Carrito (`src/cart/`)

- Un usuario tiene **un único carrito activo** (`carts.user_id` es único). No hay historial de carritos.
- El precio de cada `cart_item` es un **snapshot** del precio de la variante al momento de agregarla, no una referencia viva a `product_variants.price`. Si el precio del producto cambia después, el carrito no se actualiza solo.
- Agregar una variante que ya está en el carrito **incrementa la cantidad** de la fila existente en vez de crear un ítem duplicado (unicidad compuesta `(cart_id, variant_id)`).
- El carrito **valida contra el stock disponible pero no lo reserva**: si `quantity` (agregada o total) supera `product_variants.stock`, se rechaza con 409. El stock real no se descuenta hasta el checkout — dos usuarios pueden tener en su carrito más unidades de las que hay en stock, y la reserva efectiva ocurre en el paso siguiente (ver Órdenes).

## Órdenes (`src/orders/`)

- **El stock se reserva (descuenta) al crear la orden, no al confirmar el pago.** Es la regla central del checkout: `checkout()` corre dentro de una transacción que revalida stock, crea la orden + sus ítems, descuenta `product_variants.stock` y vacía el carrito, todo atómicamente. Esto evita overselling entre el momento en que se agrega algo al carrito y el checkout, a costa de que una orden `pending_payment` "bloquea" stock aunque todavía no se haya pagado.
- Consecuencia directa: **cancelar una orden restaura el stock** de cada variante involucrada. Esto aplica tanto si cancela el dueño de la orden como si lo hace un admin.
- Cada `order_item` guarda un **snapshot** de `productName`, `sku` y `price` en el momento de la compra. A diferencia del carrito (efímero), una orden es un registro permanente: si el producto se renombra o la variante se borra después, la orden tiene que seguir mostrando qué se compró realmente. Por eso `order_items.variant_id` puede quedar en `null` (`ON DELETE SET NULL`) sin perder la información de la compra.
- Estados posibles y transiciones permitidas (`OrderStatus`, validadas en `OrdersService`, no a nivel de base de datos):

  ```
  pending_payment → paid | cancelled
  paid            → shipped | cancelled
  shipped         → delivered
  cancelled       → (estado final)
  delivered       → (estado final)
  ```

  Cualquier transición fuera de esta lista (ej. cancelar una orden ya `shipped`, o marcar como `shipped` una orden que nunca se pagó) devuelve 409 (`InvalidOrderStateError`).
- El pago está **mockeado** en esta etapa: un admin confirma el pago manualmente vía `PATCH /admin/orders/:id/status` con `{ status: 'paid' }`. No hay integración real con una pasarela de pago todavía.
- `Order.externalReference` existe desde ya (nullable, único) como *seam* para la futura integración con MercadoPago: el webhook de pago va a poder ubicar la orden por esa referencia externa en lugar del id interno, sin necesitar otra migración.
- Ownership: un usuario solo puede ver/cancelar sus propias órdenes. Si intenta acceder a una orden de otro usuario, la respuesta es **404, no 403** — mismo criterio que el carrito, para no revelar la existencia de recursos ajenos.

## Errores de aplicación (`src/common/errors/`)

- Las reglas de negocio violadas nunca se traducen a excepciones HTTP directamente desde el service: se lanza una subclase de `AppError` (`NotFoundError`, `ConflictError`, `InvalidOrderStateError`, `UnauthorizedError`) y el `AppExceptionFilter` global la mapea a un status code.
- `ConflictError` (409) se usa para **violaciones de reglas de stock/estado que no dependen de una máquina de estados** (ej. stock insuficiente al agregar al carrito o al hacer checkout).
- `InvalidOrderStateError` (también 409) se reserva específicamente para **transiciones de estado de orden inválidas**, para poder distinguir semánticamente ambos casos en logs/tests aunque compartan status code.
