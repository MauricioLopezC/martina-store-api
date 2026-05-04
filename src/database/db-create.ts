import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { createDatabase } from 'typeorm-extension';
import { dataSource } from './data-source';

createDatabase({ ifNotExist: true, options: dataSource.options })
  .then(() => console.log('Database created'))
  .catch((err) => { console.error(err); process.exit(1); });
