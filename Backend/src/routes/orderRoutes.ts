import { Router } from 'express';
import { orderController } from '../controllers/orderController';
import { authenticate } from '../middleware/authMiddleware';
import { apiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

router.post('/direct', apiRateLimiter, (req, res, next) => orderController.createDirectOrder(req, res, next));
router.get('/', (req, res, next) => orderController.getUserOrders(req, res, next));
router.get('/:id', (req, res, next) => orderController.getOrderDetails(req, res, next));
router.put('/:id/delivery-address', apiRateLimiter, (req, res, next) => orderController.updateDeliveryAddress(req, res, next));
router.post('/:id/payment-session', apiRateLimiter, (req, res, next) => orderController.createPaymentSession(req, res, next));
router.post('/:id/pay', apiRateLimiter, (req, res, next) => orderController.processPayment(req, res, next));
router.post('/:id/cancel', apiRateLimiter, (req, res, next) => orderController.cancelOrder(req, res, next));
router.post('/:id/ship', (req, res, next) => orderController.sellerShipOrder(req, res, next));
// NOTE: there is deliberately NO manual shipment-status endpoint — the courier
// status is owned by the logistics provider (tracking webhooks / mock simulator).
router.post('/:id/complete', (req, res, next) => orderController.completeOrder(req, res, next));

export default router;
