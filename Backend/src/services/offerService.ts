import { prisma } from '../config/db';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';
import { calculateOrderAmount } from '../utils/pricing';

export class OfferService {
  async createOffer(buyerId: string, listingId: string, offerPrice: number, message?: string) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { book: true, seller: true },
    });

    if (!listing) throw new NotFoundError('Listing not found');

    // Rule: Prevent self-purchase/self-offer
    if (listing.sellerId === buyerId) {
      throw new ForbiddenError('You cannot make an offer on your own listing');
    }

    if (listing.status !== 'ACTIVE') {
      throw new AppError(`Listing is currently ${listing.status} and unavailable for offers`);
    }

    if (listing.minimumOfferPrice && offerPrice < listing.minimumOfferPrice) {
      throw new AppError(`Offer amount must be at least ₹${listing.minimumOfferPrice}`);
    }

    // Default offer expiry: 48 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    // Check if buyer already has an active offer for this listing
    const existingOffer = await prisma.offer.findFirst({
      where: {
        listingId,
        buyerId,
        status: { in: ['PENDING', 'COUNTERED'] },
      },
    });

    let offer;

    if (existingOffer) {
      // Update existing offer and append history
      offer = await prisma.offer.update({
        where: { id: existingOffer.id },
        data: {
          currentPrice: offerPrice,
          status: 'PENDING',
          expiresAt,
          histories: {
            create: {
              senderId: buyerId,
              price: offerPrice,
              message: message || 'Revised offer',
              action: 'OFFER_CREATED',
            },
          },
        },
        include: { histories: true },
      });
    } else {
      // Create new offer
      offer = await prisma.offer.create({
        data: {
          listingId,
          buyerId,
          sellerId: listing.sellerId,
          currentPrice: offerPrice,
          status: 'PENDING',
          expiresAt,
          histories: {
            create: {
              senderId: buyerId,
              price: offerPrice,
              message: message || `Offered ₹${offerPrice}`,
              action: 'OFFER_CREATED',
            },
          },
        },
        include: { histories: true },
      });
    }

    // Create Notification for Seller
    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: 'OFFER_RECEIVED',
        title: 'New Offer Received',
        message: `You received an offer of ₹${offerPrice} for "${listing.book.title}"`,
        link: `/offers/${offer.id}`,
      },
    });

    return offer;
  }

  async counterOffer(userId: string, offerId: string, counterPrice: number, message?: string) {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { include: { book: true } } },
    });

    if (!offer) throw new NotFoundError('Offer not found');

    if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
      throw new AppError('Can only counter active offers');
    }

    // Server-side expiry check
    if (new Date() > offer.expiresAt) {
      await prisma.offer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } });
      throw new AppError('Offer has expired', 400, 'OFFER_EXPIRED');
    }

    // Verify authorized user (must be buyer or seller)
    if (userId !== offer.sellerId && userId !== offer.buyerId) {
      throw new ForbiddenError('Not authorized to respond to this offer');
    }

    const nextRecipient = userId === offer.sellerId ? offer.buyerId : offer.sellerId;

    // Reset expiry for counter-offer (48 hours)
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + 48);

    const updatedOffer = await prisma.offer.update({
      where: { id: offerId },
      data: {
        currentPrice: counterPrice,
        status: 'COUNTERED',
        expiresAt: newExpiresAt,
        histories: {
          create: {
            senderId: userId,
            price: counterPrice,
            message: message || `Counter-offered ₹${counterPrice}`,
            action: 'COUNTER_OFFER',
          },
        },
      },
      include: { histories: true },
    });

    await prisma.notification.create({
      data: {
        userId: nextRecipient,
        type: 'COUNTER_OFFER',
        title: 'Counter Offer Received',
        message: `Counter offer of ₹${counterPrice} for "${offer.listing.book.title}"`,
        link: `/offers/${offer.id}`,
      },
    });

    return updatedOffer;
  }

  async acceptOffer(userId: string, offerId: string) {
    // Transactional Offer Acceptance
    return await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: {
          listing: { include: { book: true } },
          buyer: { include: { addresses: true } },
          seller: { include: { addresses: true } },
        },
      });

      if (!offer) throw new NotFoundError('Offer not found');

      // 1. Authorization: only the buyer or seller may act on this offer.
      if (userId !== offer.sellerId && userId !== offer.buyerId) {
        throw new ForbiddenError('Not authorized to accept this offer');
      }

      // A seller accepts the buyer's PENDING offer and a buyer accepts the
      // seller's COUNTER offer. Accepting your own offer — or your own counter —
      // would force a sale without the other side's agreement, so it is forbidden.
      if (offer.status === 'PENDING' && userId === offer.buyerId) {
        throw new ForbiddenError(
          'You cannot accept your own offer — only the seller can accept it',
          'CANNOT_ACCEPT_OWN_OFFER'
        );
      }
      if (offer.status === 'COUNTERED' && userId === offer.sellerId) {
        throw new ForbiddenError(
          'You cannot accept your own counter offer — only the buyer can accept it',
          'CANNOT_ACCEPT_OWN_COUNTER'
        );
      }

      // 2. Expiry check
      if (new Date() > offer.expiresAt) {
        await tx.offer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } });
        throw new AppError('Offer has expired', 400, 'OFFER_EXPIRED');
      }

      // Only active offers can be accepted (a rejected offer cannot be revived).
      if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
        throw new AppError('Can only accept active offers');
      }

      // 3. Verify listing is ACTIVE
      if (offer.listing.status !== 'ACTIVE') {
        throw new AppError(`Listing is ${offer.listing.status} and cannot be purchased`);
      }

      // 4. Update offer status to ACCEPTED and add immutable history
      const acceptedOffer = await tx.offer.update({
        where: { id: offerId },
        data: {
          status: 'ACCEPTED',
          histories: {
            create: {
              senderId: userId,
              price: offer.currentPrice,
              message: 'Offer accepted',
              action: 'ACCEPTED',
            },
          },
        },
      });

      // 5. Reserve the listing (15 min reservation until payment completed)
      const reservedUntil = new Date();
      reservedUntil.setMinutes(reservedUntil.getMinutes() + 15);

      await tx.listing.update({
        where: { id: offer.listingId },
        data: {
          status: 'RESERVED',
          reservedUntil,
          reservedByUserId: offer.buyerId,
        },
      });

      // 6. Expire all competing offers for this listing
      await tx.offer.updateMany({
        where: {
          listingId: offer.listingId,
          id: { not: offerId },
          status: { in: ['PENDING', 'COUNTERED'] },
        },
        data: { status: 'EXPIRED' },
      });

      // 7. Extract delivery & pickup address snapshots
      const defaultDeliveryAddr = offer.buyer.addresses.find((a) => a.isDefault) || offer.buyer.addresses[0] || {
        name: offer.buyer.name,
        phone: offer.buyer.phone || '9999999999',
        line1: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
      };

      const defaultPickupAddr = offer.seller.addresses.find((a) => a.isPickupAddress || a.isDefault) || offer.seller.addresses[0] || {
        name: offer.seller.name,
        phone: offer.seller.phone || '9888888888',
        line1: '456 Seller Hub',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      };

      // Calculate snapshot pricing
      const pricing = calculateOrderAmount(offer.currentPrice);

      const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 8. Create Order snapshot
      const order = await tx.order.create({
        data: {
          orderNumber,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          listingId: offer.listingId,
          bookPrice: pricing.bookPrice,
          shippingFee: pricing.shippingFee,
          platformFee: pricing.platformFee,
          discount: pricing.discount,
          totalAmount: pricing.totalAmount,
          status: 'PAYMENT_PENDING',
          deliveryAddressSnapshot: JSON.stringify(defaultDeliveryAddr),
          pickupAddressSnapshot: JSON.stringify(defaultPickupAddr),
          statusHistory: {
            create: {
              fromStatus: 'PAYMENT_PENDING',
              toStatus: 'PAYMENT_PENDING',
              changedById: userId,
              reason: 'Order created from accepted offer',
            },
          },
        },
      });

      // Notify buyer & seller
      await tx.notification.create({
        data: {
          userId: offer.buyerId,
          type: 'OFFER_ACCEPTED',
          title: 'Offer Accepted!',
          message: `Your offer of ₹${offer.currentPrice} for "${offer.listing.book.title}" was accepted! Complete payment to ship.`,
          link: `/checkout?orderId=${order.id}`,
        },
      });

      return {
        offer: acceptedOffer,
        order,
      };
    });
  }

  async rejectOffer(userId: string, offerId: string) {
    const offer = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundError('Offer not found');

    if (userId !== offer.sellerId && userId !== offer.buyerId) {
      throw new ForbiddenError('Not authorized');
    }

    return await prisma.offer.update({
      where: { id: offerId },
      data: {
        status: 'REJECTED',
        histories: {
          create: {
            senderId: userId,
            price: offer.currentPrice,
            message: 'Offer rejected',
            action: 'REJECTED',
          },
        },
      },
    });
  }

  /**
   * Lists the user's offers. `roleType` scopes the view:
   * - 'seller' — offers received on the user's own books (incoming offers)
   * - 'buyer'  — offers the user has made on other sellers' books (outgoing)
   * - 'all'    — both, as a single feed
   *
   * Offers are sorted by amount, highest first, so sellers see the best price
   * proposals on top (ties broken by most recently updated).
   */
  async getUserOffers(userId: string, roleType: 'buyer' | 'seller' | 'all' = 'all') {
    const where: any = {};
    if (roleType === 'buyer') where.buyerId = userId;
    else if (roleType === 'seller') where.sellerId = userId;
    else where.OR = [{ buyerId: userId }, { sellerId: userId }];

    return await prisma.offer.findMany({
      where,
      include: {
        listing: { include: { book: true, images: { where: { isPrimary: true } } } },
        buyer: { select: { id: true, name: true, rating: true } },
        seller: { select: { id: true, name: true, rating: true } },
        histories: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ currentPrice: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async getOfferById(userId: string, offerId: string) {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        listing: { include: { book: true, images: true } },
        buyer: { select: { id: true, name: true, rating: true, email: true } },
        seller: { select: { id: true, name: true, rating: true, email: true } },
        histories: {
          include: { sender: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!offer) throw new NotFoundError('Offer not found');

    if (offer.buyerId !== userId && offer.sellerId !== userId) {
      throw new ForbiddenError('Not authorized to view this offer');
    }

    return offer;
  }
}

export const offerService = new OfferService();
