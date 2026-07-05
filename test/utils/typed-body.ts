import { Response } from 'supertest';

export function body<T>(res: Response): T {
  return res.body as T;
}
