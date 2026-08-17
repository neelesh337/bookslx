import { Router } from 'express';
import { offerController } from '../controllers/offerController';
import { authenticate } from '../middleware/authMiddleware';
import { apiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

// Offers for a specific listing (seller's "Offers Received" view per listing).
router.get('/listings/:listingId/offers', (req, res, next) => offerController.getListingOffers(req, res, next));

router.post('/', apiRateLimiter, (req, res, next) => offerController.createOffer(req, res, next));
router.get('/', (req, res, next) => offerController.getUserOffers(req, res, next));
router.get('/:id', (req, res, next) => offerController.getOfferById(req, res, next));
router.post('/:id/cancel', (req, res, next) => offerController.cancelOffer(req, res, next));
router.post('/:id/counter', apiRateLimiter, (req, res, next) => offerController.counterOffer(req, res, next));
router.post('/:id/accept', (req, res, next) => offerController.acceptOffer(req, res, next));
router.post('/:id/confirm', (req, res, next) => offerController.confirmDeal(req, res, next));
router.post('/:id/decline', (req, res, next) => offerController.declineDeal(req, res, next));
router.post('/:id/reject', (req, res, next) => offerController.rejectOffer(req, res, next));

export default router;
