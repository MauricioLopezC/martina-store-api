import { Role } from '../../users/role.enum';

export class MeDto {
  userId: number;
  email: string;
  role: Role;
}
