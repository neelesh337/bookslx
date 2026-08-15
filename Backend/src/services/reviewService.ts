import { prisma } from '../config/db';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';

export class ReviewService {
  async createReview(
    reviewerId: string,
    orderId: string,
    data: {
      rating: number;
      communicationRating?: number;
      accuracyRating?: number;
      shippingRating?: number;
      comment?: string;
    }
  ) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Order not found');

    if (order.buyerId !== reviewerId && order.sellerId !== reviewerId) {
      throw new ForbiddenError('You can only review orders you participated in');
    }

    // Enforce Rule: Only COMPLETED orders can be reviewed
    if (order.status !== 'COMPLETED') {
      throw new AppError('Reviews are only permitted on completed orders', 400, 'ORDER_NOT_COMPLETED');
    }

    const revieweeId = reviewerId === order.buyerId ? order.sellerId : order.buyerId;

    const existing = await prisma.review.findUnique({
      where: {
        orderId_reviewerId: {
          orderId,
          reviewerId,
        },
      },
    });

    if (existing) {
      throw new AppError('You have already submitted a review for this order');
    }

    const review = await prisma.review.create({
      data: {
        orderId,
        reviewerId,
        revieweeId,
        rating: data.rating,
        communicationRating: data.communicationRating || 5,
        accuracyRating: data.accuracyRating || 5,
        shippingRating: data.shippingRating || 5,
        comment: data.comment,
      },
    });

    // Recalculate average rating for reviewee
    const allReviews = await prisma.review.findMany({
      where: { revieweeId },
    });

    const avgRating = Number(
      (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(1)
    );

    await prisma.user.update({
      where: { id: revieweeId },
      data: { rating: avgRating },
    });

    return review;
  }

  async getUserReviews(userId: string) {
    return await prisma.review.findMany({
      where: { revieweeId: userId },
      include: {
        reviewer: { select: { id: true, name: true, profileImage: true } },
        order: { include: { listing: { include: { book: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const reviewService = new ReviewService();
