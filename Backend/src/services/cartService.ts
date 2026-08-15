import { prisma } from '../config/db';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';

export class CartService {
  async getCart(userId: string) {
    let cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            listing: {
              include: {
                book: true,
                seller: { select: { id: true, name: true, rating: true } },
                images: { where: { isPrimary: true } },
              },
            },
          },
        },
      },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: {
              listing: {
                include: {
                  book: true,
                  seller: { select: { id: true, name: true, rating: true } },
                  images: { where: { isPrimary: true } },
                },
              },
            },
          },
        },
      });
    }

    // Clean up items if listing is SOLD or DELETED
    const validItems = cart.items.filter(
      (item) => item.listing.status === 'ACTIVE' || item.listing.status === 'RESERVED'
    );

    return {
      id: cart.id,
      items: validItems,
      totalCount: validItems.length,
    };
  }

  async addToCart(userId: string, listingId: string) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');

    if (listing.sellerId === userId) {
      throw new ForbiddenError('You cannot add your own listing to cart');
    }

    if (listing.status !== 'ACTIVE') {
      throw new AppError(`Listing is ${listing.status} and cannot be added to cart`);
    }

    let cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId } });
    }

    // Second-hand items are unique copy = 1
    const existing = await prisma.cartItem.findUnique({
      where: {
        cartId_listingId: {
          cartId: cart.id,
          listingId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        listingId,
      },
      include: {
        listing: {
          include: { book: true },
        },
      },
    });
  }

  async removeFromCart(userId: string, listingId: string) {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) return;

    await prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        listingId,
      },
    });
  }

  async clearCart(userId: string) {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) return;

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
  }
}

export const cartService = new CartService();
