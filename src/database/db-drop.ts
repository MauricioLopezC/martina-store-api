import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { dropDatabase } from 'typeorm-extension';
import { dataSource } from './data-source';

dropDatabase({ ifExist: true, options: dataSource.options })
  .then(() => console.log('Database dropped'))
  .catch((err) => { console.error(err); process.exit(1); });
