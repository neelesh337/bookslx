import { Request, Response, NextFunction } from 'express';
import { wishlistService } from '../services/wishlistService';

export class WishlistController {
  async toggleWishlist(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { listingId } = req.body;
      const result = await wishlistService.toggleWishlist(userId, listingId);
      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserWishlist(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const listings = await wishlistService.getUserWishlist(userId);
      return res.json({
        success: true,
        data: listings,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const wishlistController = new WishlistController();
