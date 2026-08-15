import { Router, Request, Response } from 'express';
import express from 'express';
import { orderController } from '../controllers/orderController';
import { env } from '../config/env';
import { paymentService } from '../integrations/payment/PaymentService';

const router = Router();

// Public config so the frontend can render the correct gateway badge.
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      mode: paymentService.getProvider().name, // 'razorpay' | 'mock'
      env: env.PAYMENT_ENV, // 'test' | 'live'
    },
  });
});

// Razorpay webhook — MUST receive the raw body (express.raw) because Razorpay
// signs the exact bytes of the request body. Mounted before express.json() in app.ts.
router.post(
  '/webhook/razorpay',
  express.raw({ type: ['application/json', 'application/*+json'] }),
  (req, res, next) => orderController.razorpayWebhook(req, res, next)
);

export default router;
