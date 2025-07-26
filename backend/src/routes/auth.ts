import { Router } from 'express';
import { authController } from '../controllers/auth.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Public routes (no authentication required)
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refreshToken.bind(authController));

// Protected routes (authentication required)
router.get('/profile', authMiddleware.authenticate, authController.getProfile.bind(authController));
router.put('/profile', authMiddleware.authenticate, authController.updateProfile.bind(authController));
router.post('/change-password', authMiddleware.authenticate, authController.changePassword.bind(authController));
router.post('/logout', authMiddleware.authenticate, authController.logout.bind(authController));

export default router;