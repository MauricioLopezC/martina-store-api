import 'reflect-metadata';
import { createDatabase } from 'typeorm-extension';
import { dataSource } from './data-source';

createDatabase({ ifNotExist: true, options: dataSource.options })
  .then(() => console.log('Database created'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
