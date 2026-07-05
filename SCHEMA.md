## Tablas

### products

| columna     | tipo    | notas                            |
| ----------- | ------- | -------------------------------- |
| id          | INT     | PK                               |
| name        | VARCHAR |                                  |
| description | TEXT    | nullable                         |
| active      | BOOLEAN |                                  |
| slug        | varchar | único, para URLs del e-commerce  |
| brand       | varchar | nullable, marca del producto     |
| status      | enum    | `draft`, `published`, `archived` |

### attributes

| columna | tipo    | notas                        |
| ------- | ------- | ---------------------------- |
| id      | INT     | PK                           |
| name    | VARCHAR | ej: "Talle", "Color" — único |

### attribute_values

| columna      | tipo    | notas                                              |
| ------------ | ------- | -------------------------------------------------- |
| id           | INT     | PK                                                 |
| attribute_id | INT     | FK → attributes                                    |
| value        | VARCHAR | ej: "M", "Negro" — único por atributo (con att_id) |

### product_variants

cada combinación real que existe

| columna    | tipo    | notas         |
| ---------- | ------- | ------------- |
| id         | INT     | PK            |
| product_id | INT     | FK → products |
| sku        | VARCHAR | único         |
| price      | DECIMAL |               |
| stock      | INT     |               |
| active     | BOOLEAN |               |

### variant*attribute_values *(pivot)\_

| columna            | tipo | notas                 |
| ------------------ | ---- | --------------------- |
| variant_id         | INT  | FK → product_variants |
| attribute_value_id | INT  | FK → attribute_values |

### categories

| columna     | tipo    | notas                                             |
| ----------- | ------- | ------------------------------------------------- |
| id          | INT     | PK                                                |
| parent_id   | INT     | FK → categories, nullable (null = categoría raíz) |
| name        | VARCHAR | ej: "Ropa Hombre", "Remeras"                      |
| description | TEXT    | nullable                                          |
| active      | BOOLEAN |                                                   |

El `parent_id` autorreferencial te permite armar una jerarquía simple:

```
Ropa Hombre  (parent_id = null)
├── Remeras  (parent_id = 1)
└── Pantalones (parent_id = 1)
Ropa Mujer   (parent_id = null)
└── Vestidos (parent_id = 4)
```

### product*categories *(pivot)\_

| columna     | tipo | notas           |
| ----------- | ---- | --------------- |
| product_id  | INT  | FK → products   |
| category_id | INT  | FK → categories |
|             |      |                 |

Pivot separada en lugar de un `category_id` directo en `products`, por si un producto puede pertenecer a más de una categoría (ej: una remera que va en "Remeras" y también en "Ofertas").

### carts

| columna    | tipo      | notas                                              |
| ---------- | --------- | --------------------------------------------------- |
| id         | INT       | PK                                                  |
| user_id    | INT       | FK → users, único (un carrito activo por usuario)   |
| created_at | TIMESTAMP |                                                      |
| updated_at | TIMESTAMP |                                                      |

### cart_items

| columna    | tipo      | notas                                                         |
| ---------- | --------- | -------------------------------------------------------------- |
| id         | INT       | PK                                                              |
| cart_id    | INT       | FK → carts                                                      |
| variant_id | INT       | FK → product_variants                                           |
| quantity   | INT       |                                                                  |
| price      | DECIMAL   | snapshot del precio de `product_variants.price` al agregarlo   |
| created_at | TIMESTAMP |                                                                  |
| updated_at | TIMESTAMP |                                                                  |

Unicidad compuesta `(cart_id, variant_id)`: si se agrega una variante que ya está en el carrito, se incrementa `quantity` en la fila existente en lugar de crear una nueva. No se modela como pivot `@ManyToMany` (como `product_categories`) porque tiene columnas propias (`quantity`, `price`) — mismo criterio que `product_variants`.

### product_images

| columna    | tipo    | notas                                             |
| ---------- | ------- | ------------------------------------------------- |
| id         | INT     | PK                                                |
| product_id | INT     | FK → products                                     |
| url        | VARCHAR | path o URL de la imagen                           |
| position   | INT     | orden de aparición                                |
| is_cover   | BOOLEAN | imagen principal del producto                     |
| alt_text   | varchar | nullable, texto alternativo (SEO + accesibilidad) |

### orders

| columna              | tipo      | notas                                                         |
| --------------------- | --------- | -------------------------------------------------------------- |
| id                     | INT       | PK                                                              |
| user_id                | INT       | dueño de la orden (sin FK a `users`, mismo criterio que `carts`) |
| status                 | enum      | `pending_payment`, `paid`, `cancelled`, `shipped`, `delivered`  |
| total_price            | DECIMAL   | suma de los `order_items.price * quantity`                      |
| shipping_address_line  | VARCHAR   |                                                                  |
| shipping_city          | VARCHAR   |                                                                  |
| shipping_state         | VARCHAR   |                                                                  |
| shipping_zip_code      | VARCHAR   |                                                                  |
| shipping_phone         | VARCHAR   | nullable                                                        |
| external_reference     | VARCHAR   | nullable, único — reservado para el futuro `PaymentsModule` (MercadoPago), correlaciona el webhook de pago con la orden |
| created_at             | TIMESTAMP |                                                                  |
| updated_at             | TIMESTAMP |                                                                  |

### order_items

| columna                | tipo      | notas                                                                 |
| ------------------------ | --------- | ------------------------------------------------------------------------ |
| id                        | INT       | PK                                                                        |
| order_id                  | INT       | FK → orders (ON DELETE CASCADE)                                          |
| variant_id                | INT       | FK → product_variants (ON DELETE SET NULL, nullable)                     |
| product_name_snapshot      | VARCHAR   | snapshot del nombre del producto al momento de la orden                  |
| sku_snapshot               | VARCHAR   | snapshot del SKU de la variante al momento de la orden                   |
| quantity                  | INT       |                                                                            |
| price                     | DECIMAL   | snapshot del precio unitario al momento de la orden                      |
| created_at                | TIMESTAMP |                                                                            |

A diferencia de `cart_items`, acá el `variant_id` puede quedar en `null` (`ON DELETE SET NULL`) porque una orden es un registro permanente: si el producto o la variante se borran después, la orden tiene que seguir mostrando qué se compró. Por eso se guardan `product_name_snapshot` y `sku_snapshot` como columnas propias en lugar de depender de la relación viva a `product_variants`/`products` (que sí es válido para `cart_items`, porque el carrito es efímero).

---
