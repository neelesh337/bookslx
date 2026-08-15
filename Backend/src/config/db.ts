import { PrismaClient } from '@prisma/client';
import { env } from './env';

// The schema pins the dev database to SQLite (file:./dev.db), but callers can point
// Prisma at a different database (e.g. an isolated test database) via DATABASE_URL.
export const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});
