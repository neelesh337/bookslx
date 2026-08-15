import { Router } from 'express';
import { bookController } from '../controllers/bookController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/listings', (req, res, next) => bookController.searchListings(req, res, next));
router.get('/categories', (req, res, next) => bookController.getCategories(req, res, next));
router.get('/listings/:id', (req, res, next) => bookController.getListingDetails(req, res, next));
router.post('/listings', authenticate, (req, res, next) => bookController.createListing(req, res, next));
router.patch('/listings/:id/status', authenticate, (req, res, next) => bookController.updateListingStatus(req, res, next));
router.get('/seller/listings', authenticate, (req, res, next) => bookController.getSellerListings(req, res, next));

export default router;
