import { Request, Response, NextFunction } from 'express';
import { cartService } from '../services/cartService';

export class CartController {
  async getCart(req: Request, res: Response, next: NextFunction) {
    try {
      const cart = await cartService.getCart(req.user!.id);
      return res.json({
        success: true,
        data: cart,
      });
    } catch (error) {
      next(error);
    }
  }

  async addToCart(req: Request, res: Response, next: NextFunction) {
    try {
      const { listingId } = req.body;
      const item = await cartService.addToCart(req.user!.id, listingId);
      return res.status(201).json({
        success: true,
        message: 'Item added to cart',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  async removeFromCart(req: Request, res: Response, next: NextFunction) {
    try {
      const { listingId } = req.params;
      await cartService.removeFromCart(req.user!.id, listingId);
      return res.json({
        success: true,
        message: 'Item removed from cart',
      });
    } catch (error) {
      next(error);
    }
  }

  async clearCart(req: Request, res: Response, next: NextFunction) {
    try {
      await cartService.clearCart(req.user!.id);
      return res.json({
        success: true,
        message: 'Cart cleared',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const cartController = new CartController();
