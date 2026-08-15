import { Router } from 'express';
import { cartController } from '../controllers/cartController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => cartController.getCart(req, res, next));
router.post('/', (req, res, next) => cartController.addToCart(req, res, next));
router.delete('/:listingId', (req, res, next) => cartController.removeFromCart(req, res, next));
router.delete('/', (req, res, next) => cartController.clearCart(req, res, next));

export default router;
