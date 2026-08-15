import { Router } from 'express';
import { reviewController } from '../controllers/reviewController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authenticate, (req, res, next) => reviewController.createReview(req, res, next));
router.get('/user/:userId?', authenticate, (req, res, next) => reviewController.getUserReviews(req, res, next));

export default router;
