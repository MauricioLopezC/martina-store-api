import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

const options: DataSourceOptions & SeederOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? 'martina-store-nest',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  seeds: [__dirname + '/seeds/**/*{.ts,.js}'],
};

export const dataSource = new DataSource(options);
