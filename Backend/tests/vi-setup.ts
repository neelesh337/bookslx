import { TEST_DB_URL } from './global-setup';

// Runs in each test worker before test files are imported, so config/db.ts and
// env.ts resolve the isolated test database instead of the dev database.
process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';

// Force the mock payment/logistics providers so the suite never depends on real
// Razorpay / DeliveryAPI credentials that happen to be present in Backend/.env.
// dotenv does not override variables that are already set, so this wins over the
// .env file loaded by config/env.ts.
process.env.PAYMENT_MODE = 'mock';
process.env.LOGISTICS_MODE = 'mock';
