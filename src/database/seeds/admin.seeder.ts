import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { Role } from '../../users/role.enum';
import { User } from '../../users/entities/user.entity';

export default class AdminSeeder implements Seeder {
  async run(dataSource: DataSource): Promise<void> {
    const repository = dataSource.getRepository(User);

    const exists = await repository.findOneBy({ email: 'admin@example.com' });
    if (exists) return;

    const password = await bcrypt.hash('admin1234', 10);
    await repository.insert({
      name: 'Admin',
      email: 'admin@example.com',
      password,
      role: Role.Admin,
    });
  }
}
