import fs from 'fs';
import os from 'os';
import path from 'path';

// Tests run against an isolated SQLite file (a copy of the dev database, which
// carries the same schema). The real prisma/dev.db is never modified.
// NOTE: the file name is intentionally fixed (not pid-based) so the global setup
// process and every test worker resolve the exact same path.
const TEST_DB_FILE = path.join(os.tmpdir(), 'bookslx-test.db');
export const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, '/')}`;
const DEV_DB = path.join(__dirname, '../prisma/dev.db');

export default function setup() {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.NODE_ENV = 'test';
  // Tests exercise the mock courier simulator — ignore any local .env override.
  process.env.LOGISTICS_MODE = 'mock';

  if (!fs.existsSync(DEV_DB)) {
    throw new Error(
      `prisma/dev.db not found. Run "npx prisma db push" then "npm run seed" in the backend first.`
    );
  }

  try {
    if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
  } catch {
    // A stale copy from an interrupted run is harmless — it gets replaced below.
  }
  fs.copyFileSync(DEV_DB, TEST_DB_FILE);
}

export function teardown() {
  try {
    // A finishing worker may still briefly hold the file open on Windows;
    // the next run's setup removes any stale copy before re-seeding it.
    if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
  } catch {
    // Best-effort cleanup only.
  }
}
