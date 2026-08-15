import { prisma } from '../config/db';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';

export type DisputeReason = 'BOOK_NOT_RECEIVED' | 'WRONG_BOOK' | 'CONDITION_DIFFERENT' | 'DAMAGED_BOOK' | 'SELLER_DID_NOT_SHIP' | 'OTHER';

export class DisputeService {
  async raiseDispute(
    userId: string,
    orderId: string,
    data: {
      reason: DisputeReason;
      description: string;
      evidences?: Array<{ url: string; description?: string; fileType?: string }>;
    }
  ) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Order not found');

    if (order.buyerId !== userId) {
      throw new ForbiddenError('Only the buyer can raise a dispute for this order');
    }

    if (order.status === 'COMPLETED' || order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      throw new AppError(`Cannot raise a dispute on order in status ${order.status}`);
    }

    return await prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({
        data: {
          orderId,
          raisedById: userId,
          reason: data.reason,
          description: data.description,
          status: 'OPEN',
          evidences: {
            create: (data.evidences || []).map((e) => ({
              uploadedById: userId,
              url: e.url,
              description: e.description || 'Dispute evidence',
              fileType: e.fileType || 'image',
            })),
          },
        },
        include: { evidences: true },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'DISPUTED',
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: 'DISPUTED',
              changedById: userId,
              reason: `Dispute raised: ${data.reason}`,
            },
          },
        },
      });

      await tx.notification.create({
        data: {
          userId: order.sellerId,
          type: 'DISPUTED',
          title: 'Dispute Raised on Order',
          message: `Buyer raised a dispute for Order #${order.orderNumber}. Reason: ${data.reason.replace(/_/g, ' ')}.`,
          link: `/orders/${order.id}`,
        },
      });

      const admins = await tx.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            type: 'DISPUTED',
            title: 'New Dispute Pending Review',
            message: `Dispute raised on Order #${order.orderNumber}.`,
            link: `/admin/disputes`,
          },
        });
      }

      return dispute;
    });
  }

  async adminResolveDispute(
    adminUserId: string,
    disputeId: string,
    data: {
      resolutionOutcome: 'REFUND' | 'RELEASE_FUNDS' | 'REJECT_DISPUTE' | 'RETURN_REQUIRED';
      resolutionNotes: string;
    }
  ) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: { include: { payment: true, listing: true } },
      },
    });

    if (!dispute) throw new NotFoundError('Dispute not found');

    return await prisma.$transaction(async (tx) => {
      const updatedDispute = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          resolutionOutcome: data.resolutionOutcome,
          resolutionNotes: data.resolutionNotes,
          resolvedAt: new Date(),
        },
      });

      if (data.resolutionOutcome === 'REFUND') {
        await tx.order.update({
          where: { id: dispute.orderId },
          data: {
            status: 'REFUNDED',
            statusHistory: {
              create: {
                fromStatus: 'DISPUTED',
                toStatus: 'REFUNDED',
                changedById: adminUserId,
                reason: `Admin dispute refund: ${data.resolutionNotes}`,
              },
            },
          },
        });

        if (dispute.order.payment) {
          await tx.payment.update({
            where: { id: dispute.order.payment.id },
            data: { status: 'REFUNDED' },
          });
        }

        await tx.listing.update({
          where: { id: dispute.order.listingId },
          data: { status: 'ACTIVE', reservedUntil: null, reservedByUserId: null },
        });

        await tx.notification.create({
          data: {
            userId: dispute.order.buyerId,
            type: 'DISPUTED',
            title: 'Dispute Resolved — Full Refund Approved',
            message: `Your dispute for Order #${dispute.order.orderNumber} was resolved with a full refund of ₹${dispute.order.totalAmount}.`,
            link: `/orders/${dispute.order.id}`,
          },
        });
      } else {
        await tx.order.update({
          where: { id: dispute.orderId },
          data: {
            status: 'COMPLETED',
            statusHistory: {
              create: {
                fromStatus: 'DISPUTED',
                toStatus: 'COMPLETED',
                changedById: adminUserId,
                reason: `Admin dispute decision: ${data.resolutionNotes}`,
              },
            },
          },
        });

        if (dispute.order.payment) {
          await tx.payment.update({
            where: { id: dispute.order.payment.id },
            data: { status: 'RELEASED' },
          });
        }

        await tx.listing.update({
          where: { id: dispute.order.listingId },
          data: { status: 'SOLD' },
        });

        await tx.notification.create({
          data: {
            userId: dispute.order.sellerId,
            type: 'DISPUTED',
            title: 'Dispute Resolved — Payment Released',
            message: `Dispute resolved in your favor for Order #${dispute.order.orderNumber}. Payment has been released.`,
            link: `/orders/${dispute.order.id}`,
          },
        });
      }

      return updatedDispute;
    });
  }

  async getDisputes(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === 'ADMIN') {
      return await prisma.dispute.findMany({
        include: {
          order: { include: { listing: { include: { book: true } } } },
          raisedBy: { select: { id: true, name: true, email: true } },
          evidences: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return await prisma.dispute.findMany({
      where: {
        OR: [
          { raisedById: userId },
          { order: { sellerId: userId } },
        ],
      },
      include: {
        order: { include: { listing: { include: { book: true } } } },
        raisedBy: { select: { id: true, name: true, email: true } },
        evidences: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const disputeService = new DisputeService();
