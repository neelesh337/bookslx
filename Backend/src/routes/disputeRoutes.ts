import { Router } from 'express';
import { disputeController } from '../controllers/disputeController';
import { authenticate } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/adminMiddleware';
import { apiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

router.post('/', apiRateLimiter, (req, res, next) => disputeController.raiseDispute(req, res, next));
router.get('/', (req, res, next) => disputeController.getDisputes(req, res, next));
router.post('/:id/resolve', requireAdmin, (req, res, next) => disputeController.resolveDispute(req, res, next));

export default router;
