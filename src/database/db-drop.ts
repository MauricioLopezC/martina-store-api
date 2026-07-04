import 'reflect-metadata';
import { dropDatabase } from 'typeorm-extension';
import { dataSource } from './data-source';

dropDatabase({ ifExist: true, options: dataSource.options })
  .then(() => console.log('Database dropped'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
