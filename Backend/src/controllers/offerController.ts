import { Request, Response, NextFunction } from 'express';
import { offerService } from '../services/offerService';

export class OfferController {
  async createOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const buyerId = req.user!.id;
      const { listingId, offerPrice, message } = req.body;
      const offer = await offerService.createOffer(buyerId, listingId, Number(offerPrice), message);
      return res.status(201).json({
        success: true,
        message: 'Offer sent successfully',
        data: offer,
      });
    } catch (error) {
      next(error);
    }
  }

  async counterOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { counterPrice, message } = req.body;
      const offer = await offerService.counterOffer(userId, id, Number(counterPrice), message);
      return res.json({
        success: true,
        message: 'Counter offer sent successfully',
        data: offer,
      });
    } catch (error) {
      next(error);
    }
  }

  async acceptOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const result = await offerService.acceptOffer(userId, id);
      return res.json({
        success: true,
        message: 'Offer accepted! The buyer must confirm the deal.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmDeal(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const result = await offerService.confirmDeal(userId, id);
      return res.json({
        success: true,
        message: 'Deal confirmed! Proceed to checkout.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async declineDeal(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const result = await offerService.declineDeal(userId, id);
      return res.json({
        success: true,
        message: 'Deal declined. The book is back on sale.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const offer = await offerService.cancelOffer(userId, id);
      return res.json({
        success: true,
        message: 'Offer withdrawn',
        data: offer,
      });
    } catch (error) {
      next(error);
    }
  }

  async getListingOffers(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { listingId } = req.params;
      const offers = await offerService.getOffersForListing(userId, listingId);
      return res.json({
        success: true,
        data: offers,
      });
    } catch (error) {
      next(error);
    }
  }

  async rejectOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const offer = await offerService.rejectOffer(userId, id);
      return res.json({
        success: true,
        message: 'Offer rejected',
        data: offer,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserOffers(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { role } = req.query;
      const offers = await offerService.getUserOffers(userId, role as any);
      return res.json({
        success: true,
        data: offers,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOfferById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const offer = await offerService.getOfferById(userId, id);
      return res.json({
        success: true,
        data: offer,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const offerController = new OfferController();
