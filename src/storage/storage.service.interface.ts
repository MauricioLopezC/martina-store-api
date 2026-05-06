export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export abstract class IStorageService {
  abstract upload(file: Express.Multer.File): Promise<string>;
  abstract delete(url: string): Promise<void>;
}
