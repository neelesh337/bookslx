import { prisma } from '../config/db';
import { NotFoundError } from '../utils/errors';

export class WishlistService {
  async toggleWishlist(userId: string, listingId: string) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');

    const existing = await prisma.wishlist.findUnique({
      where: {
        userId_listingId: {
          userId,
          listingId,
        },
      },
    });

    if (existing) {
      await prisma.wishlist.delete({
        where: { id: existing.id },
      });
      return { isWishlisted: false };
    } else {
      await prisma.wishlist.create({
        data: { userId, listingId },
      });
      return { isWishlisted: true };
    }
  }

  async getUserWishlist(userId: string) {
    const wishlists = await prisma.wishlist.findMany({
      where: { userId },
      include: {
        listing: {
          include: {
            book: true,
            seller: { select: { id: true, name: true, rating: true } },
            images: { where: { isPrimary: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return wishlists.map((w) => w.listing);
  }
}

export const wishlistService = new WishlistService();
