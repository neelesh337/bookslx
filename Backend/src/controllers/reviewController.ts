import { Request, Response, NextFunction } from 'express';
import { reviewService } from '../services/reviewService';

export class ReviewController {
  async createReview(req: Request, res: Response, next: NextFunction) {
    try {
      const reviewerId = req.user!.id;
      const { orderId, rating, communicationRating, accuracyRating, shippingRating, comment } = req.body;
      const review = await reviewService.createReview(reviewerId, orderId, {
        rating: Number(rating),
        communicationRating: communicationRating ? Number(communicationRating) : undefined,
        accuracyRating: accuracyRating ? Number(accuracyRating) : undefined,
        shippingRating: shippingRating ? Number(shippingRating) : undefined,
        comment,
      });
      return res.status(201).json({
        success: true,
        message: 'Review submitted successfully',
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const reviews = await reviewService.getUserReviews(userId || req.user!.id);
      return res.json({
        success: true,
        data: reviews,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const reviewController = new ReviewController();
