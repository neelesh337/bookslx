import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const env = {
  PORT: process.env.PORT || '5000',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'bookslx_super_secret_jwt_key_2026_dev',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  PAYMENT_MODE: process.env.PAYMENT_MODE || 'mock', // 'mock' | 'razorpay'
  PAYMENT_ENV: process.env.PAYMENT_ENV || 'test', // 'test' | 'live'
  PAYMENT_KEY: process.env.PAYMENT_KEY || 'mock_key_bookslx',
  PAYMENT_SECRET: process.env.PAYMENT_SECRET || 'mock_secret_bookslx',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  LOGISTICS_MODE: process.env.LOGISTICS_MODE || 'mock',
  // For shiprocket: LOGISTICS_API_KEY = the API-user email, LOGISTICS_API_SECRET = its password.
  LOGISTICS_API_KEY: process.env.LOGISTICS_API_KEY || 'mock_logistics_key',
  LOGISTICS_API_SECRET: process.env.LOGISTICS_API_SECRET || 'mock_logistics_secret',
  LOGISTICS_PICKUP_LOCATION: process.env.LOGISTICS_PICKUP_LOCATION || 'default',
  LOGISTICS_WEBHOOK_KEY: process.env.LOGISTICS_WEBHOOK_KEY || '',
};
