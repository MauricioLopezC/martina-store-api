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

### product_images

| columna    | tipo    | notas                                             |
| ---------- | ------- | ------------------------------------------------- |
| id         | INT     | PK                                                |
| product_id | INT     | FK → products                                     |
| url        | VARCHAR | path o URL de la imagen                           |
| position   | INT     | orden de aparición                                |
| is_cover   | BOOLEAN | imagen principal del producto                     |
| alt_text   | varchar | nullable, texto alternativo (SEO + accesibilidad) |

---
