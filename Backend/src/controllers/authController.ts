import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, password, role, firebaseUid } = req.body;
      const result = await authService.register({ name, email, phone, password, role, firebaseUid });

      // Firebase signups have no token yet — the user must verify their email first.
      if (result.token) {
        res.cookie('token', result.token, {
          httpOnly: true,
          secure: false, // Set to true in HTTPS production
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
      }

      return res.status(201).json({
        success: true,
        message: result.requiresVerification
          ? 'Registration successful. Please verify your email to activate your account.'
          : 'Account created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async loginVerified(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, firebaseUid } = req.body;
      const result = await authService.loginVerified({ email, firebaseUid });

      res.cookie('token', result.token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        message: 'Email verified — logged in successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });

      res.cookie('token', result.token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        message: 'Logged in successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, newPassword, firebaseUid } = req.body;
      const result = await authService.resetPassword({ email, newPassword, firebaseUid });
      return res.json({
        success: true,
        message: 'Password updated successfully. You can now sign in with your new password.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(_req: Request, res: Response, next: NextFunction) {
    try {
      res.clearCookie('token');
      return res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.getCurrentUser(req.user!.id);
      return res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async addAddress(req: Request, res: Response, next: NextFunction) {
    try {
      const address = await authService.addAddress(req.user!.id, req.body);
      return res.status(201).json({
        success: true,
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAddresses(req: Request, res: Response, next: NextFunction) {
    try {
      const addresses = await authService.getUserAddresses(req.user!.id);
      return res.json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
