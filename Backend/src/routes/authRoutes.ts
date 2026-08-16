import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, (req, res, next) => authController.register(req, res, next));
router.post('/login', authRateLimiter, (req, res, next) => authController.login(req, res, next));
router.post('/login-verified', authRateLimiter, (req, res, next) => authController.loginVerified(req, res, next));
router.post('/google', authRateLimiter, (req, res, next) => authController.googleLogin(req, res, next));
router.post('/reset-password', authRateLimiter, (req, res, next) => authController.resetPassword(req, res, next));
router.post('/logout', (req, res, next) => authController.logout(req, res, next));
router.get('/me', authenticate, (req, res, next) => authController.me(req, res, next));
router.post('/addresses', authenticate, (req, res, next) => authController.addAddress(req, res, next));
router.get('/addresses', authenticate, (req, res, next) => authController.getAddresses(req, res, next));

export default router;
