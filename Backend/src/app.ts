import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import bookRoutes from './routes/bookRoutes';
import offerRoutes from './routes/offerRoutes';
import cartRoutes from './routes/cartRoutes';
import orderRoutes from './routes/orderRoutes';
import disputeRoutes from './routes/disputeRoutes';
import reviewRoutes from './routes/reviewRoutes';
import wishlistRoutes from './routes/wishlistRoutes';
import notificationRoutes from './routes/notificationRoutes';
import realtimeRoutes from './routes/realtimeRoutes';
import adminRoutes from './routes/adminRoutes';
import paymentRoutes from './routes/paymentRoutes';
import logisticsRoutes from './routes/logisticsRoutes';
import { startReservationExpiryJob, stopReservationExpiryJob } from './jobs/expireReservations';
import { startMockShipmentJob, stopMockShipmentJob } from './jobs/advanceShipments';

const app = express();

// Normalize FRONTEND_URL (stray quotes / trailing slash from dashboard paste
// errors) and always allow the deployed frontend as a fallback, so CORS keeps
// working even if the env var is missing or misconfigured.
const allowedOrigins = [
  env.FRONTEND_URL,
  'https://bookslx.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].map((origin) => origin.replace(/["']/g, '').replace(/\/+$/, ''));

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// The Razorpay webhook and Shiprocket tracking webhook MUST capture the raw
// request body (express.raw) for signature/security verification — mounted
// before the JSON body parser so the raw bytes are not consumed.
app.use('/api/payments', paymentRoutes);
app.use('/api/logistics', logisticsRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'BooksLX Backend API',
    mode: {
      payment: env.PAYMENT_MODE,
      logistics: env.LOGISTICS_MODE,
    },
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/admin', adminRoutes);

// Error Handler Middleware
app.use(errorHandler);

const PORT = parseInt(env.PORT, 10) || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`📚 BooksLX Backend REST API running on port ${PORT}`);
    console.log(`💳 Payment Mode:   [${env.PAYMENT_MODE.toUpperCase()}]`);
    console.log(`🚚 Logistics Mode: [${env.LOGISTICS_MODE.toUpperCase()}]`);
    console.log(`⏰ Expiry Job:     [ACTIVE — every 60s]`);
    console.log(`🚚 Delivery Sim:   [${env.LOGISTICS_MODE === 'mock' ? 'ACTIVE — auto status updates every 10s' : 'DISABLED (real logistics mode)'}]`);
    console.log(`=================================================`);
  });

  // Periodically release listings whose 15-minute reservation window lapsed
  startReservationExpiryJob();

  // In mock logistics mode, emulate a real courier: automatically advance
  // shipment statuses (SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED)
  // over time so buyers see the delivery pipeline move without manual clicks.
  if (env.LOGISTICS_MODE === 'mock') {
    startMockShipmentJob();
  }

  // Stop the background jobs cleanly on shutdown
  const shutdown = () => {
    stopReservationExpiryJob();
    stopMockShipmentJob();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;
