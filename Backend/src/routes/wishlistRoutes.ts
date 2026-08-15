import { Router } from 'express';
import { wishlistController } from '../controllers/wishlistController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.post('/toggle', (req, res, next) => wishlistController.toggleWishlist(req, res, next));
router.get('/', (req, res, next) => wishlistController.getUserWishlist(req, res, next));

export default router;
