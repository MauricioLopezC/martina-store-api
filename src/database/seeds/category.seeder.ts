import { DataSource } from 'typeorm';
import { IsNull } from 'typeorm';
import { Seeder } from 'typeorm-extension';

import { Category } from '../../catalog/categories/entities/category.entity';
import { toSlug } from '../../common/utils/slug.util';

export default class CategorySeeder implements Seeder {
  async run(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(Category);

    const upsert = async (
      name: string,
      parent: Category | null = null,
    ): Promise<Category> => {
      const found = parent
        ? await repo.findOneBy({ name, parentId: parent.id })
        : await repo.findOneBy({ name, parentId: IsNull() });
      if (found) return found;
      const slug = toSlug(name);
      return repo.save(repo.create({ name, slug, parent, active: true }));
    };

    // Categorías raíz
    const mujer = await upsert('Mujer');
    const hombre = await upsert('Hombre');
    const unisex = await upsert('Unisex');
    await upsert('Deportivo');

    // Subcategorías
    await upsert('Remeras', unisex);
    await upsert('Jeans', null);
    await upsert('Camperas y Buzos', unisex);
    await upsert('Vestidos', mujer);
    await upsert('Tops', mujer);
    await upsert('Camisas', hombre);
    await upsert('Bermudas', hombre);
    await upsert('Calzas', mujer);
    await upsert('Chalecos', unisex);
  }
}
