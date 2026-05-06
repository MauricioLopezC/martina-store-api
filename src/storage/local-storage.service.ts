import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IStorageService } from './storage.service.interface';

export class LocalStorageService implements IStorageService {
  private readonly dest: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.dest = config.get<string>('STORAGE_LOCAL_DEST', 'uploads');
    this.baseUrl = config.get<string>('STORAGE_LOCAL_BASE_URL', 'http://localhost:3000/uploads');
  }

  async upload(file: Express.Multer.File): Promise<string> {
    const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    const dest = path.resolve(this.dest, filename);
    await fs.mkdir(path.resolve(this.dest), { recursive: true });
    await fs.writeFile(dest, file.buffer);
    return `${this.baseUrl}/${filename}`;
  }

  async delete(url: string): Promise<void> {
    const filename = url.split('/').pop();
    if (!filename) return;
    const filePath = path.resolve(this.dest, filename);
    await fs.unlink(filePath).catch(() => undefined);
  }
}
