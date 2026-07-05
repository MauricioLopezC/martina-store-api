import { Decimal } from 'decimal.js';
import { DataSource, DeepPartial, FindOptionsWhere, Repository } from 'typeorm';
import { Seeder } from 'typeorm-extension';

import { Attribute } from '../../catalog/attributes/entities/attribute.entity';
import { AttributeValue } from '../../catalog/attributes/entities/attribute-value.entity';
import { Category } from '../../catalog/categories/entities/category.entity';
import { Product } from '../../catalog/products/entities/product.entity';
import { ProductImage } from '../../catalog/products/entities/product-image.entity';
import { ProductVariant } from '../../catalog/products/entities/product-variant.entity';
import { ProductStatus } from '../../catalog/products/enums/product-status.enum';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function firstOrCreate<T extends object>(
  repo: Repository<T>,
  where: Partial<T>,
): Promise<T> {
  const found = await repo.findOne({ where: where as FindOptionsWhere<T> });
  if (found) return found;
  const entity = repo.create(where as DeepPartial<T>);
  return repo.save(entity);
}

interface ProductData {
  name: string;
  brand: string;
  description: string;
  price: number;
  talles: string[];
  colores: string[];
  categoryNames: string[];
  images: string[];
  tallesPool?: AttributeValue[];
}

export default class ProductSeeder implements Seeder {
  async run(dataSource: DataSource): Promise<void> {
    const { faker } = await import('@faker-js/faker');

    const attributeRepo = dataSource.getRepository(Attribute);
    const attributeValueRepo = dataSource.getRepository(AttributeValue);
    const categoryRepo = dataSource.getRepository(Category);
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(ProductVariant);
    const imageRepo = dataSource.getRepository(ProductImage);

    const talleAttr = await firstOrCreate(attributeRepo, { name: 'Talle' });
    const colorAttr = await firstOrCreate(attributeRepo, { name: 'Color' });

    const createAttributeValues = (
      attribute: Attribute,
      values: string[],
    ): Promise<AttributeValue[]> =>
      Promise.all(
        values.map((value) =>
          firstOrCreate(attributeValueRepo, {
            attributeId: attribute.id,
            value,
          }),
        ),
      );

    const talles = await createAttributeValues(talleAttr, [
      'XS',
      'S',
      'M',
      'L',
      'XL',
      'XXL',
    ]);
    const colores = await createAttributeValues(colorAttr, [
      'Negro',
      'Blanco',
      'Rojo',
      'Azul',
      'Gris',
      'Beige',
      'Verde',
      'Rosa',
      'Celeste',
      'Azul marino',
    ]);

    const tallesJeanMujer = await createAttributeValues(talleAttr, [
      '34',
      '36',
      '38',
      '40',
      '42',
      '44',
    ]);
    const tallesJeanHombre = await createAttributeValues(talleAttr, [
      '28',
      '30',
      '32',
      '34',
      '36',
      '38',
    ]);

    const products: ProductData[] = [
      {
        name: 'Remera Nike Dri-FIT',
        brand: 'Nike',
        description:
          'Remera deportiva con tecnología Dri-FIT que mantiene la humedad alejada de tu piel. Ideal para entrenamientos de alta intensidad.',
        price: 18500,
        talles: ['XS', 'S', 'M', 'L', 'XL'],
        colores: ['Negro', 'Blanco', 'Rojo', 'Azul'],
        categoryNames: ['Remeras', 'Deportivo'],
        images: [
          'https://images.pexels.com/photos/11757389/pexels-photo-11757389.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/4378326/pexels-photo-4378326.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Remera M51',
        brand: 'M51',
        description:
          'Remera de algodón pima de alta calidad, corte regular. Suave al tacto y de larga duración.',
        price: 12900,
        talles: ['S', 'M', 'L', 'XL'],
        colores: ['Negro', 'Blanco', 'Gris', 'Verde'],
        categoryNames: ['Remeras'],
        images: [
          'https://images.pexels.com/photos/8146450/pexels-photo-8146450.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/18257675/pexels-photo-18257675.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Camisa de lino',
        brand: 'Linen & Co.',
        description:
          'Camisa 100% lino, ideal para el verano. Transpirable y elegante, perfecta tanto para el trabajo como para el tiempo libre.',
        price: 24900,
        talles: ['S', 'M', 'L', 'XL'],
        colores: ['Blanco', 'Beige', 'Celeste'],
        categoryNames: ['Camisas', 'Hombre'],
        images: [
          'https://images.pexels.com/photos/5145182/pexels-photo-5145182.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/18031036/pexels-photo-18031036.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Top de mujer',
        brand: 'Zara',
        description:
          'Top cropped de mujer con acabado liso y escote redondo. Combinación perfecta entre comodidad y estilo urbano.',
        price: 9900,
        talles: ['XS', 'S', 'M', 'L'],
        colores: ['Negro', 'Blanco', 'Rosa', 'Rojo'],
        categoryNames: ['Tops', 'Mujer'],
        images: [
          'https://images.pexels.com/photos/10321731/pexels-photo-10321731.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/13966449/pexels-photo-13966449.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Campera unisex deportiva',
        brand: 'Topper',
        description:
          'Campera deportiva unisex con capucha y bolsillos laterales. Ideal para actividades al aire libre o uso casual.',
        price: 34900,
        talles: ['S', 'M', 'L', 'XL', 'XXL'],
        colores: ['Negro', 'Azul', 'Gris'],
        categoryNames: ['Camperas y Buzos', 'Unisex', 'Deportivo'],
        images: [
          'https://images.pexels.com/photos/17167945/pexels-photo-17167945.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/32328361/pexels-photo-32328361.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Jean mujer Zara',
        brand: 'Zara',
        description:
          'Jean skinny de tiro alto para mujer. Tela denim premium con elastano para mayor comodidad de movimiento.',
        price: 42000,
        talles: ['34', '36', '38', '40', '42', '44'],
        colores: ['Azul', 'Negro', 'Gris'],
        categoryNames: ['Jeans', 'Mujer'],
        images: [
          'https://images.pexels.com/photos/16848895/pexels-photo-16848895.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/27542891/pexels-photo-27542891.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
        tallesPool: tallesJeanMujer,
      },
      {
        name: 'Jean hombre Zara',
        brand: 'Zara',
        description:
          'Jean slim fit para hombre con lavado oscuro. Tela denim de alta calidad con diseño moderno y versátil.',
        price: 42000,
        talles: ['28', '30', '32', '34', '36', '38'],
        colores: ['Azul', 'Negro', 'Gris'],
        categoryNames: ['Jeans', 'Hombre'],
        images: [
          'https://images.pexels.com/photos/7877538/pexels-photo-7877538.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/19220633/pexels-photo-19220633.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
        tallesPool: tallesJeanHombre,
      },
      {
        name: 'Buzo universitario unisex',
        brand: 'Lacoste',
        description:
          'Buzo de algodón french terry con capucha y bolsillo canguro. Clásico y cómodo para el día a día.',
        price: 28500,
        talles: ['S', 'M', 'L', 'XL'],
        colores: ['Negro', 'Gris', 'Azul marino'],
        categoryNames: ['Camperas y Buzos', 'Unisex'],
        images: [
          'https://images.pexels.com/photos/7479825/pexels-photo-7479825.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/7207120/pexels-photo-7207120.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Vestido floral de verano',
        brand: 'H&M',
        description:
          'Vestido midi con estampado floral, tirantes finos y falda amplia. Ligero y fresco, ideal para días de calor.',
        price: 22900,
        talles: ['XS', 'S', 'M', 'L'],
        colores: ['Rosa', 'Blanco', 'Rojo'],
        categoryNames: ['Vestidos', 'Mujer'],
        images: [
          'https://images.pexels.com/photos/33554490/pexels-photo-33554490.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/29277214/pexels-photo-29277214.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Bermuda cargo hombre',
        brand: "Levi's",
        description:
          'Bermuda cargo con múltiples bolsillos laterales. Tela ripstop resistente, ideal para actividades outdoor.',
        price: 19900,
        talles: ['S', 'M', 'L', 'XL'],
        colores: ['Beige', 'Negro', 'Verde'],
        categoryNames: ['Bermudas', 'Hombre'],
        images: [
          'https://images.pexels.com/photos/12803209/pexels-photo-12803209.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/18178103/pexels-photo-18178103.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Calza deportiva mujer',
        brand: 'Under Armour',
        description:
          'Calza deportiva de lycra de alta compresión. Ideal para yoga, running y gym. Con bolsillo lateral.',
        price: 15900,
        talles: ['XS', 'S', 'M', 'L', 'XL'],
        colores: ['Negro', 'Gris', 'Rosa', 'Azul'],
        categoryNames: ['Calzas', 'Mujer', 'Deportivo'],
        images: [
          'https://images.pexels.com/photos/14085371/pexels-photo-14085371.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/5262953/pexels-photo-5262953.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
      {
        name: 'Chaleco acolchado unisex',
        brand: 'Patagonia',
        description:
          'Chaleco acolchado con relleno de plumón sintético. Liviano, abrigado y muy comprimible. Perfecto para capas intermedias.',
        price: 52000,
        talles: ['S', 'M', 'L', 'XL', 'XXL'],
        colores: ['Negro', 'Azul marino', 'Verde'],
        categoryNames: ['Chalecos', 'Unisex'],
        images: [
          'https://images.pexels.com/photos/6001543/pexels-photo-6001543.jpeg?auto=compress&cs=tinysrgb&w=800',
          'https://images.pexels.com/photos/16756721/pexels-photo-16756721.jpeg?auto=compress&cs=tinysrgb&w=800',
        ],
      },
    ];

    for (const data of products) {
      const slug = slugify(data.name);

      const exists = await productRepo.findOneBy({ slug });
      if (exists) continue;

      const categories = (
        await Promise.all(
          data.categoryNames.map((name) => categoryRepo.findOneBy({ name })),
        )
      ).filter((c): c is Category => c !== null);

      const product = await productRepo.save(
        productRepo.create({
          name: data.name,
          brand: data.brand,
          description: data.description,
          slug,
          status: ProductStatus.Published,
        }),
      );

      if (categories.length > 0) {
        await dataSource
          .createQueryBuilder()
          .relation(Product, 'categories')
          .of(product.id)
          .add(categories.map((c) => c.id));
      }

      for (const [index, url] of data.images.entries()) {
        await imageRepo.save(
          imageRepo.create({
            product,
            url,
            position: index,
            isCover: index === 0,
          }),
        );
      }

      const tallesPool = data.tallesPool ?? talles;
      const selectedTalles = tallesPool.filter((av) =>
        data.talles.includes(av.value),
      );
      const selectedColores = colores.filter((av) =>
        data.colores.includes(av.value),
      );

      for (const talleValue of selectedTalles) {
        for (const colorValue of selectedColores) {
          const sku = [
            slug,
            slugify(talleValue.value),
            slugify(colorValue.value),
          ]
            .join('-')
            .toUpperCase()
            .substring(0, 50);

          const variant = variantRepo.create({
            product,
            sku,
            price: new Decimal(data.price),
            stock: faker.number.int({ min: 5, max: 50 }),
            active: true,
            attributeValues: [talleValue, colorValue],
          });
          await variantRepo.save(variant);
        }
      }
    }
  }
}
