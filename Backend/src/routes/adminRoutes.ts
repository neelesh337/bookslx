import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { authenticate } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/adminMiddleware';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/stats', (req, res, next) => adminController.getDashboardStats(req, res, next));
router.get('/users', (req, res, next) => adminController.getAllUsers(req, res, next));
router.get('/orders', (req, res, next) => adminController.getAllOrders(req, res, next));
router.patch('/listings/:id/moderate', (req, res, next) => adminController.moderateListing(req, res, next));

export default router;
