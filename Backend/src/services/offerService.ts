import { prisma } from '../config/db';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';
import { calculateOrderAmount } from '../utils/pricing';

/**
 * BooksLX negotiation engine.
 *
 * Model: the party who proposed the CURRENT price cannot respond to it — the
 * OTHER party holds the turn. Who proposed the current price is derived from
 * the last entry of the immutable `histories` log:
 *
 *   - PENDING   → last action is OFFER_CREATED by the buyer → turn = seller
 *   - COUNTERED → last action is COUNTER_OFFER by the proposer → turn = other
 *
 * The backend is the only source of truth for turns, expiry, prices, and
 * availability. The frontend merely renders this state.
 */
export class OfferService {
  /**
   * Derives the negotiation turn from the immutable history. The proposer of
   * the CURRENT price is the sender of the last PROPOSAL entry (OFFER_CREATED
   * or COUNTER_OFFER). Resolution entries (ACCEPTED / REJECTED / CANCELLED /
   * EXPIRED) never change who proposed the price.
   */
  private deriveTurn(histories: any[], buyerId: string, sellerId: string) {
    const lastProposal = [...histories]
      .reverse()
      .find((h) => h.action === 'OFFER_CREATED' || h.action === 'COUNTER_OFFER');
    const currentOfferSenderId = lastProposal?.senderId ?? buyerId;
    const currentTurnUserId = currentOfferSenderId === buyerId ? sellerId : buyerId;
    return { currentOfferSenderId, currentTurnUserId };
  }

  /**
   * Reads the offer with its history and derives the negotiation turn:
   * `currentOfferSenderId` (who proposed the current price) and
   * `currentTurnUserId` (who must respond next).
   */
  private async getActiveOfferForResponse(offerId: string) {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        listing: { include: { book: true } },
        histories: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!offer) throw new NotFoundError('Offer not found');

    const { currentOfferSenderId, currentTurnUserId } = this.deriveTurn(offer.histories, offer.buyerId, offer.sellerId);
    return { offer, currentOfferSenderId, currentTurnUserId };
  }

  private assertActiveStatus(status: string) {
    if (status !== 'PENDING' && status !== 'COUNTERED') {
      throw new AppError('This negotiation has already been resolved', 409, 'OFFER_ALREADY_RESOLVED');
    }
  }

  private assertNotExpired(expiresAt: Date) {
    if (new Date() > expiresAt) {
      throw new AppError('Offer has expired', 400, 'OFFER_EXPIRED');
    }
  }

  private validatePrice(price: number, minimumOfferPrice: number | null | undefined, kind: 'offer' | 'counter') {
    const code = kind === 'offer' ? 'INVALID_OFFER_PRICE' : 'INVALID_COUNTER_PRICE';
    const label = kind === 'offer' ? 'Offer' : 'Counter offer';

    if (!Number.isFinite(price) || price < 10) {
      throw new AppError(`${label} amount must be at least ₹10`, 400, code);
    }
    if (minimumOfferPrice && price < minimumOfferPrice) {
      throw new AppError(
        `${label} amount must be at least ₹${minimumOfferPrice}`,
        400,
        'OFFER_BELOW_MINIMUM_PRICE'
      );
    }
  }

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

    this.validatePrice(offerPrice, listing.minimumOfferPrice, 'offer');

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
      // The buyer may revise their own outstanding proposal (the seller has not
      // responded yet), but only if they are still the one awaiting a response.
      const last = (
        await prisma.offerHistory.findFirst({
          where: { offerId: existingOffer.id },
          orderBy: { createdAt: 'desc' },
        })
      )?.senderId;
      if (last && last !== buyerId) {
        throw new ForbiddenError(
          'It is not your turn — wait for the other party to respond',
          'NOT_YOUR_TURN'
        );
      }

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
    const { offer, currentOfferSenderId, currentTurnUserId } = await this.getActiveOfferForResponse(offerId);

    this.assertActiveStatus(offer.status);
    this.assertNotExpired(offer.expiresAt);

    // Only the buyer or seller may respond.
    if (userId !== offer.sellerId && userId !== offer.buyerId) {
      throw new ForbiddenError('Not authorized to respond to this offer');
    }

    // Turn enforcement: the party who proposed the current price cannot counter
    // it — that would be a double move (e.g. buyer counters their own offer, or
    // seller counters their own counter).
    if (userId === currentOfferSenderId) {
      throw new ForbiddenError(
        'You cannot counter your own offer — wait for the other party to respond',
        'CANNOT_COUNTER_OWN_OFFER'
      );
    }
    if (userId !== currentTurnUserId) {
      throw new ForbiddenError('It is not your turn', 'NOT_YOUR_TURN');
    }

    this.validatePrice(counterPrice, offer.listing.minimumOfferPrice, 'counter');

    const nextRecipient = currentTurnUserId;

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
          histories: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!offer) throw new NotFoundError('Offer not found');

      // 1. Authorization: only the buyer or seller may act on this offer.
      if (userId !== offer.sellerId && userId !== offer.buyerId) {
        throw new ForbiddenError('Not authorized to accept this offer');
      }

      // 2. Derive the turn from the immutable history — the person who proposed
      //    the current price can never accept it; only the other party can.
      const { currentOfferSenderId, currentTurnUserId } = this.deriveTurn(offer.histories, offer.buyerId, offer.sellerId);

      if (userId === currentOfferSenderId) {
        throw new ForbiddenError(
          'You cannot accept your own offer — only the other party can accept it',
          'CANNOT_ACCEPT_OWN_OFFER'
        );
      }
      if (userId !== currentTurnUserId) {
        throw new ForbiddenError('It is not your turn to accept', 'NOT_YOUR_TURN');
      }

      // 3. Expiry check
      if (new Date() > offer.expiresAt) {
        await tx.offer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } });
        throw new AppError('Offer has expired', 400, 'OFFER_EXPIRED');
      }

      // Only active offers can be accepted (a rejected/accepted/cancelled offer
      // cannot be revived, and a duplicate accept must not create two orders).
      this.assertActiveStatus(offer.status);

      // 4. Verify listing is ACTIVE
      if (offer.listing.status !== 'ACTIVE') {
        throw new AppError(`Listing is ${offer.listing.status} and cannot be purchased`);
      }

      // 5. Update offer status to ACCEPTED and add immutable history
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

      // 6. Reserve the listing (15 min reservation until payment completed)
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

      // 7. Expire all competing offers for this listing and notify their buyers
      const competing = await tx.offer.findMany({
        where: {
          listingId: offer.listingId,
          id: { not: offerId },
          status: { in: ['PENDING', 'COUNTERED'] },
        },
        select: { id: true, buyerId: true },
      });

      await tx.offer.updateMany({
        where: {
          listingId: offer.listingId,
          id: { not: offerId },
          status: { in: ['PENDING', 'COUNTERED'] },
        },
        data: { status: 'EXPIRED' },
      });

      for (const other of competing) {
        await tx.notification.create({
          data: {
            userId: other.buyerId,
            type: 'LISTING_UNAVAILABLE',
            title: 'Book No Longer Available',
            message: `"${offer.listing.book.title}" is no longer available because another offer was accepted.`,
            link: `/books/${offer.listingId}`,
          },
        });
      }

      // 8. Extract delivery & pickup address snapshots
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

      // Calculate snapshot pricing from the ACCEPTED negotiation price.
      const pricing = calculateOrderAmount(offer.currentPrice);

      const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 9. Create Order snapshot
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
    const { offer, currentOfferSenderId, currentTurnUserId } = await this.getActiveOfferForResponse(offerId);

    this.assertActiveStatus(offer.status);

    if (userId !== offer.sellerId && userId !== offer.buyerId) {
      throw new ForbiddenError('Not authorized');
    }

    // Turn enforcement: only the party who must respond can reject, and nobody
    // can reject their own proposal (that is a cancel/withdraw, not a rejection).
    if (userId === currentOfferSenderId) {
      throw new ForbiddenError(
        'You cannot reject your own offer — use cancel to withdraw it',
        'CANNOT_REJECT_OWN_OFFER'
      );
    }
    if (userId !== currentTurnUserId) {
      throw new ForbiddenError('It is not your turn', 'NOT_YOUR_TURN');
    }

    const updated = await prisma.offer.update({
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

    await prisma.notification.create({
      data: {
        userId: currentOfferSenderId,
        type: 'OFFER_REJECTED',
        title: 'Offer Rejected',
        message: `Your offer for "${offer.listing.book.title}" was rejected.`,
        link: `/offers/${offer.id}`,
      },
    });

    return updated;
  }

  /**
   * The buyer withdraws their own outstanding proposal (PENDING offer, or their
   * own counter that the seller has not answered yet). Ends the negotiation
   * with CANCELLED — a distinct outcome from a rejection by the other party.
   */
  async cancelOffer(userId: string, offerId: string) {
    const { offer, currentOfferSenderId } = await this.getActiveOfferForResponse(offerId);

    this.assertActiveStatus(offer.status);

    if (userId !== offer.buyerId) {
      throw new ForbiddenError('Only the buyer can cancel their offer', 'CANNOT_CANCEL_OTHERS_OFFER');
    }
    if (userId !== currentOfferSenderId) {
      throw new ForbiddenError(
        'You cannot cancel a counter offer from the seller — respond to it instead',
        'CANNOT_CANCEL_OTHERS_OFFER'
      );
    }

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: {
        status: 'CANCELLED',
        histories: {
          create: {
            senderId: userId,
            price: offer.currentPrice,
            message: 'Offer withdrawn by buyer',
            action: 'CANCELLED',
          },
        },
      },
    });

    await prisma.notification.create({
      data: {
        userId: offer.sellerId,
        type: 'OFFER_CANCELLED',
        title: 'Offer Withdrawn',
        message: `The buyer withdrew their offer for "${offer.listing.book.title}".`,
        link: `/offers/${offer.id}`,
      },
    });

    return updated;
  }

  /**
   * Lists the user's offers. `roleType` scopes the view:
   * - 'seller' — offers received on the user's own books (incoming offers)
   * - 'buyer'  — offers the user has made on other sellers' books (outgoing)
   * - 'all'    — both, as a single feed
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

  /** All offers for a single listing — sellers only (they own the listing). */
  async getOffersForListing(userId: string, listingId: string) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.sellerId !== userId) {
      throw new ForbiddenError('Only the seller can view offers for this listing');
    }

    return await prisma.offer.findMany({
      where: { listingId },
      include: {
        buyer: { select: { id: true, name: true, rating: true } },
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
