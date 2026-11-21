import { createDb } from './create-db';
import { appConfig } from '@/config';
import { getBeatDesignDatabaseUrl } from '@/config/data-root';

let dbInstance: any = null;

export const getLocalDatabaseUrl = () => process.env.BEATDESIGN_DATA_DIR?.trim()
  ? getBeatDesignDatabaseUrl()
  : appConfig.database_url;

export async function db() {
  if (dbInstance) return dbInstance;

  const instance = createDb({
    database_url: getLocalDatabaseUrl(),
  }).catch((error) => { dbInstance = null; throw error; });

  dbInstance = instance;

  return instance;
}

export type { DbConfig } from './types';
export { createDb, closeDb } from './create-db';

/** Drop the cached connection so the next read opens the same file again. */
export async function resetLocalDbForTests() {
  const { closeSqliteDb } = await import('./sqlite');
  dbInstance = null;
  await closeSqliteDb();
}
