import { Request, Response, NextFunction } from 'express';
import { adminService } from '../services/adminService';

export class AdminController {
  async getDashboardStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getDashboardStats();
      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      const users = await adminService.getAllUsers();
      return res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllOrders(_req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await adminService.getAllOrders();
      return res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  async moderateListing(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const listing = await adminService.moderateListing(id, status);
      return res.json({
        success: true,
        message: `Listing status updated to ${status}`,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const adminController = new AdminController();
