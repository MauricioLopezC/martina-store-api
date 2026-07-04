import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictError } from '../../common/errors/conflict.error';
import { NotFoundError } from '../../common/errors/not-found.error';
import { toSlug } from '../../common/utils/slug.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
  ) {}

  private async resolveSlug(name: string, slug?: string): Promise<string> {
    const candidate = slug ?? toSlug(name);
    const existing = await this.categoriesRepo.findOneBy({ slug: candidate });
    if (existing)
      throw new ConflictError(`Slug "${candidate}" is already in use`);
    return candidate;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) await this.findOne(dto.parentId);
    const slug = await this.resolveSlug(dto.name, dto.slug);
    const category = this.categoriesRepo.create({ ...dto, slug });
    return this.categoriesRepo.save(category);
  }

  findAll(): Promise<Category[]> {
    return this.categoriesRepo.find({ relations: ['children'] });
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepo.findOne({
      where: { id },
      relations: ['parent', 'children'],
    });
    if (!category) throw new NotFoundError(`Category #${id} not found`);
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    if (dto.parentId) await this.findOne(dto.parentId);
    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.categoriesRepo.findOneBy({
        slug: dto.slug,
      });
      if (existing)
        throw new ConflictError(`Slug "${dto.slug}" is already in use`);
    }
    Object.assign(category, dto);
    return this.categoriesRepo.save(category);
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    await this.categoriesRepo.remove(category);
  }
}
