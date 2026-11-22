import { PrismaClient } from '@prisma/client';
const globalDB = globalThis as unknown as { roamlyDB?: PrismaClient };
export const db = globalDB.roamlyDB ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDB.roamlyDB = db;
