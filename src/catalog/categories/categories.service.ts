import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) await this.findOne(dto.parentId);
    const category = this.categoriesRepo.create(dto);
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
    if (!category) throw new NotFoundException(`Category #${id} not found`);
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    if (dto.parentId) await this.findOne(dto.parentId);
    Object.assign(category, dto);
    return this.categoriesRepo.save(category);
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    await this.categoriesRepo.remove(category);
  }
}
