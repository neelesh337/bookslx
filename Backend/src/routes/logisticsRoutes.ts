import { Router } from 'express';
import express from 'express';
import { logisticsController } from '../controllers/logisticsController';

const router = Router();

// Shiprocket tracking webhook — MUST receive the raw body (express.raw) so the
// security-token / payload checks see the exact bytes. Mounted before
// express.json() in app.ts, mirroring the Razorpay webhook.
router.post(
  '/webhook/shiprocket',
  express.raw({ type: ['application/json', 'application/*+json'] }),
  (req, res, next) => logisticsController.shiprocketWebhook(req, res, next)
);

export default router;
