import { Router } from 'express';
import { offerController } from '../controllers/offerController';
import { authenticate } from '../middleware/authMiddleware';
import { apiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

router.post('/', apiRateLimiter, (req, res, next) => offerController.createOffer(req, res, next));
router.get('/', (req, res, next) => offerController.getUserOffers(req, res, next));
router.get('/:id', (req, res, next) => offerController.getOfferById(req, res, next));
router.post('/:id/counter', apiRateLimiter, (req, res, next) => offerController.counterOffer(req, res, next));
router.post('/:id/accept', (req, res, next) => offerController.acceptOffer(req, res, next));
router.post('/:id/reject', (req, res, next) => offerController.rejectOffer(req, res, next));

export default router;
