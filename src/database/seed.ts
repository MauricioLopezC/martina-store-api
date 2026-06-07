import 'reflect-metadata';
import { runSeeders } from 'typeorm-extension';
import { dataSource } from './data-source';

async function main() {
  await dataSource.initialize();
  await runSeeders(dataSource);
  await dataSource.destroy();
}

main().catch(console.error);
