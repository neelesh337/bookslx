import { prisma } from '../config/db';

export class AdminService {
  async getDashboardStats() {
    const [
      totalUsers,
      totalListings,
      activeListings,
      totalOrders,
      completedOrders,
      openDisputes,
      revenueResult,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.listing.count(),
      prisma.listing.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'COMPLETED' } }),
      prisma.dispute.count({ where: { status: 'OPEN' } }),
      prisma.order.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { totalAmount: true, platformFee: true },
      }),
    ]);

    return {
      totalUsers,
      totalListings,
      activeListings,
      totalOrders,
      completedOrders,
      openDisputes,
      grossMarketplaceVolume: revenueResult._sum.totalAmount || 0,
      totalPlatformRevenue: revenueResult._sum.platformFee || 0,
    };
  }

  async getAllUsers() {
    return await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        rating: true,
        totalSales: true,
        totalPurchases: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllOrders() {
    return await prisma.order.findMany({
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        listing: { include: { book: true } },
        payment: true,
        shipment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async moderateListing(listingId: string, status: 'ACTIVE' | 'PAUSED' | 'DELETED') {
    return await prisma.listing.update({
      where: { id: listingId },
      data: { status },
    });
  }
}

export const adminService = new AdminService();
