import { existsSync, readFileSync } from 'node:fs';
export default async function setup() {
  const file = existsSync('.env.test') ? readFileSync('.env.test', 'utf8') : '';
  const url = process.env.DATABASE_URL || file.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
  if (!url || new URL(url).pathname !== '/roamly_test')
    throw new Error('Browser setup may only use the dedicated roamly_test database.');
  process.env.DATABASE_URL = url;
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    // Prior test attempts must not consume a later run's authentication quota.
    await db.rateLimit.deleteMany();
  } finally {
    await db.$disconnect();
  }
}
