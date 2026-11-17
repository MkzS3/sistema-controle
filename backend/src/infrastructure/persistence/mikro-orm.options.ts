import { defineConfig } from '@mikro-orm/postgresql';
import { persistenceEntitySchemas } from './entity-schemas/index.js';

const defaultDatabaseUrl =
  'postgresql://dividend_app:local_dev_only_change_me@127.0.0.1:5432/dividend_control';

export const mikroOrmOptions = defineConfig({
  clientUrl: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  entities: persistenceEntitySchemas,
  discovery: {
    warnWhenNoEntities: false,
  },
  migrations: {
    path: './dist/infrastructure/persistence/migrations',
    pathTs: './src/infrastructure/persistence/migrations',
    transactional: true,
    allOrNothing: true,
  },
});
