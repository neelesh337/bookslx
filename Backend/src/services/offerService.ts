import { prisma } from '../config/db';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';
import { calculateOrderAmount } from '../utils/pricing';
import { notifyUser, realtimeHub, RealtimeEvent } from '../services/realtimeService';

/**
 * BooksLX negotiation engine — SELLER-APPROVAL model.
 *
 * The buyer PROPOSES prices; the SELLER decides (accept / counter / reject).
 * The buyer never accepts or rejects during negotiation — they only counter.
 * When the seller approves the buyer's latest price the negotiation enters
 * SELLER_ACCEPTED (price locked, listing reserved) and the buyer gets a FINAL
 * DEAL CONFIRMATION: accept the deal (order created) or decline it (listing
 * released, no order). An order is NEVER created by the seller's acceptance
 * alone.
 *
 * Flow:
 *   buyer offer (PENDING)        → seller decides
 *   seller counter (COUNTERED)   → buyer counters (PENDING) or waits
 *   seller accepts               → SELLER_ACCEPTED (price locked)
 *   buyer confirms               → DEAL_ACCEPTED + PAYMENT_PENDING order
 *   buyer declines / times out   → CANCELLED_BY_BUYER / EXPIRED, listing ACTIVE
 *
 * The backend is the only source of truth for turns, expiry, prices, and
 * availability. Who proposed the current price is derived from the last
 * PROPOSAL entry of the immutable `histories` log.
 */
export class OfferService {
  /** How long the buyer has to confirm a seller-approved deal. */
  private static DEAL_CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;
  /** How long the buyer has to pay after confirming the deal. */
  private static PAYMENT_RESERVATION_MS = 15 * 60 * 1000;

  /**
   * Derives the negotiation turn from the immutable history. The proposer of
   * the CURRENT price is the sender of the last PROPOSAL entry (OFFER_CREATED
   * or COUNTER_OFFER). Resolution entries never change who proposed the price.
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

    // Create Notification for Seller + push it live over SSE.
    await notifyUser(listing.sellerId, {
      type: 'OFFER_RECEIVED',
      title: 'New Offer Received',
      message: `You received an offer of ₹${offerPrice} for "${listing.book.title}"`,
      link: `/offers/${offer.id}`,
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
    // it — that would be a double move.
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

    // Price-direction rules: a counter must move the negotiation toward
    // agreement. The seller countering the buyer's offer must go HIGHER; the
    // buyer countering the seller's counter must go LOWER. Equal means "agree"
    // — which is an accept, not a counter.
    if (userId === offer.sellerId && counterPrice <= offer.currentPrice) {
      throw new AppError(
        'Counter offer must be higher than the buyer\'s current offer of ₹' + offer.currentPrice,
        400,
        'COUNTER_MUST_EXCEED_OFFER'
      );
    }
    if (userId === offer.buyerId && counterPrice >= offer.currentPrice) {
      throw new AppError(
        'Counter offer must be lower than the seller\'s current counter of ₹' + offer.currentPrice,
        400,
        'COUNTER_MUST_BE_BELOW_COUNTER'
      );
    }

    // Notify the party whose price is being countered.
    const nextRecipient = currentOfferSenderId;

    // Reset expiry for counter-offer (48 hours)
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + 48);

    // Status reflects whose price is on the table: the seller counters → the
    // seller's price is on the table (COUNTERED, buyer's turn); the buyer
    // counters → the buyer's price is on the table (PENDING, seller's turn).
    const nextStatus = userId === offer.sellerId ? 'COUNTERED' : 'PENDING';

    const updatedOffer = await prisma.offer.update({
      where: { id: offerId },
      data: {
        currentPrice: counterPrice,
        status: nextStatus,
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

    await notifyUser(nextRecipient, {
      type: 'COUNTER_OFFER',
      title: 'Counter Offer Received',
      message: `Counter offer of ₹${counterPrice} for "${offer.listing.book.title}"`,
      link: `/offers/${offer.id}`,
    });

    return updatedOffer;
  }

  /**
   * SELLER APPROVAL. Only the seller can call this, and only for the buyer's
   * latest price. It locks the final price and reserves the listing — it does
   * NOT create an order. The buyer must still confirm the deal.
   */
  async acceptOffer(userId: string, offerId: string) {
    const { offer, currentOfferSenderId, currentTurnUserId } = await this.getActiveOfferForResponse(offerId);

    // Only the seller may approve a buyer's price.
    if (userId !== offer.sellerId) {
      throw new ForbiddenError(
        'Only the seller can accept an offer — the buyer confirms the final deal after seller approval',
        'SELLER_ACCEPT_ONLY'
      );
    }

    this.assertActiveStatus(offer.status);
    this.assertNotExpired(offer.expiresAt);

    if (userId === currentOfferSenderId) {
      throw new ForbiddenError('You cannot accept your own counter offer', 'CANNOT_ACCEPT_OWN_OFFER');
    }
    if (userId !== currentTurnUserId) {
      throw new ForbiddenError('It is not your turn to accept', 'NOT_YOUR_TURN');
    }

    if (offer.listing.status !== 'ACTIVE') {
      throw new AppError(`Listing is ${offer.listing.status} and cannot be purchased`);
    }

    // Lock the final price and set the buyer's confirmation deadline.
    const finalNegotiatedPrice = offer.currentPrice;
    const confirmationExpiresAt = new Date(Date.now() + OfferService.DEAL_CONFIRMATION_TIMEOUT_MS);

    const events: Array<{ userId: string; event: RealtimeEvent }> = [];

    const acceptedOffer = await prisma.$transaction(async (tx) => {
      // 1. Guarded transition to SELLER_ACCEPTED (only from an active state).
      const guard = await tx.offer.updateMany({
        where: { id: offerId, status: { in: ['PENDING', 'COUNTERED'] } },
        data: {
          status: 'SELLER_ACCEPTED',
          finalNegotiatedPrice,
          confirmationExpiresAt,
        },
      });
      if (guard.count === 0) {
        throw new AppError('This negotiation has already been resolved', 409, 'OFFER_ALREADY_RESOLVED');
      }

      // 2. Immutable audit entry for the approval.
      await tx.offerHistory.create({
        data: {
          offerId,
          senderId: userId,
          price: finalNegotiatedPrice,
          message: 'Seller accepted the offer',
          action: 'ACCEPTED',
        },
      });

      // 3. Reserve the listing for this buyer until the confirmation window ends.
      await tx.listing.update({
        where: { id: offer.listingId },
        data: {
          status: 'RESERVED',
          reservedByUserId: offer.buyerId,
          reservedUntil: confirmationExpiresAt,
        },
      });

      // 4. Expire competing offers and collect their buyers for notification.
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
        events.push({
          userId: other.buyerId,
          event: {
            type: 'LISTING_UNAVAILABLE',
            title: 'Book No Longer Available',
            message: `"${offer.listing.book.title}" is no longer available because another offer was accepted.`,
            link: `/books/${offer.listingId}`,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 5. Notify the buyer — point them at the FINAL DEAL CONFIRMATION, not
      //    checkout (no order exists yet).
      await tx.notification.create({
        data: {
          userId: offer.buyerId,
          type: 'OFFER_ACCEPTED',
          title: 'Seller Accepted Your Offer!',
          message: `Your offer of ₹${finalNegotiatedPrice} for "${offer.listing.book.title}" was accepted. Confirm the deal to continue.`,
          link: `/offers/${offerId}`,
        },
      });
      events.push({
        userId: offer.buyerId,
        event: {
          type: 'OFFER_ACCEPTED',
          title: 'Seller Accepted Your Offer!',
          message: `Your offer of ₹${finalNegotiatedPrice} for "${offer.listing.book.title}" was accepted. Confirm the deal to continue.`,
          link: `/offers/${offerId}`,
          timestamp: new Date().toISOString(),
        },
      });

      return await tx.offer.findUnique({ where: { id: offerId } });
    });

    for (const e of events) {
      realtimeHub.publish(e.userId, e.event);
    }

    return { offer: acceptedOffer, confirmationExpiresAt };
  }

  /**
   * BUYER FINAL CONFIRMATION. Only the buyer can call this, and only after the
   * seller has approved the price. Creates the PAYMENT_PENDING order at the
   * locked price and keeps the listing reserved.
   */
  async confirmDeal(userId: string, offerId: string) {
    const events: Array<{ userId: string; event: RealtimeEvent }> = [];

    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: {
          listing: { include: { book: true } },
          buyer: { include: { addresses: true } },
          seller: { include: { addresses: true } },
        },
      });

      if (!offer) throw new NotFoundError('Offer not found');

      // 1. Buyer only.
      if (userId !== offer.buyerId) {
        throw new ForbiddenError('Only the buyer can confirm the deal', 'BUYER_CONFIRM_ONLY');
      }

      // 2. A seller-approved deal must exist.
      if (offer.status !== 'SELLER_ACCEPTED') {
        throw new AppError('There is no seller-approved deal to confirm', 409, 'OFFER_ALREADY_RESOLVED');
      }

      // 3. Confirmation deadline.
      if (!offer.confirmationExpiresAt || new Date() > offer.confirmationExpiresAt) {
        throw new AppError('The deal confirmation window has expired', 400, 'OFFER_EXPIRED');
      }

      // 4. Listing must still be reserved for this buyer.
      if (offer.listing.status !== 'RESERVED' || offer.listing.reservedByUserId !== offer.buyerId) {
        throw new AppError('This book is no longer available', 409, 'LISTING_UNAVAILABLE');
      }

      // 5. The locked price is authoritative.
      const finalPrice = offer.finalNegotiatedPrice ?? offer.currentPrice;

      // 6. Guarded transition to DEAL_ACCEPTED — a concurrent decline/expiry
      //    wins, so a duplicate confirmation can never create two orders.
      const guard = await tx.offer.updateMany({
        where: { id: offerId, status: 'SELLER_ACCEPTED' },
        data: { status: 'DEAL_ACCEPTED' },
      });
      if (guard.count === 0) {
        throw new AppError('This negotiation has already been resolved', 409, 'OFFER_ALREADY_RESOLVED');
      }

      await tx.offerHistory.create({
        data: {
          offerId,
          senderId: userId,
          price: finalPrice,
          message: 'Buyer confirmed the deal',
          action: 'DEAL_ACCEPTED',
        },
      });

      // 7. Keep the listing reserved — extend to the payment window.
      const reservedUntil = new Date(Date.now() + OfferService.PAYMENT_RESERVATION_MS);
      await tx.listing.update({
        where: { id: offer.listingId },
        data: { reservedUntil },
      });

      // 8. Expire any remaining competing offers (safety net — they are
      //    normally already expired by the seller's acceptance).
      await tx.offer.updateMany({
        where: {
          listingId: offer.listingId,
          id: { not: offerId },
          status: { in: ['PENDING', 'COUNTERED'] },
        },
        data: { status: 'EXPIRED' },
      });

      // 9. Address snapshots.
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

      // 10. Order at the locked negotiated price.
      const pricing = calculateOrderAmount(finalPrice);
      const order = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
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
              reason: 'Order created from confirmed deal',
            },
          },
        },
      });

      // 11. Notify the seller that the deal is confirmed.
      await tx.notification.create({
        data: {
          userId: offer.sellerId,
          type: 'DEAL_CONFIRMED',
          title: 'Deal Confirmed',
          message: `${offer.buyer.name} confirmed the deal at ₹${finalPrice} for "${offer.listing.book.title}". Waiting for payment.`,
          link: `/orders/${order.id}`,
        },
      });
      events.push({
        userId: offer.sellerId,
        event: {
          type: 'DEAL_CONFIRMED',
          title: 'Deal Confirmed',
          message: `${offer.buyer.name} confirmed the deal at ₹${finalPrice} for "${offer.listing.book.title}". Waiting for payment.`,
          link: `/orders/${order.id}`,
          timestamp: new Date().toISOString(),
        },
      });

      const dealOffer = await tx.offer.findUnique({ where: { id: offerId } });
      return { offer: dealOffer, order };
    });

    for (const e of events) {
      realtimeHub.publish(e.userId, e.event);
    }
    return result;
  }

  /**
   * BUYER DECLINES the seller-approved deal. No order is created and the
   * listing returns to ACTIVE so the buyer (or others) can start fresh.
   */
  async declineDeal(userId: string, offerId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: { listing: { include: { book: true } } },
      });

      if (!offer) throw new NotFoundError('Offer not found');

      if (userId !== offer.buyerId) {
        throw new ForbiddenError('Only the buyer can decline the deal', 'BUYER_CONFIRM_ONLY');
      }

      if (offer.status !== 'SELLER_ACCEPTED') {
        throw new AppError('There is no seller-approved deal to decline', 409, 'OFFER_ALREADY_RESOLVED');
      }

      if (!offer.confirmationExpiresAt || new Date() > offer.confirmationExpiresAt) {
        throw new AppError('The deal confirmation window has expired', 400, 'OFFER_EXPIRED');
      }

      const finalPrice = offer.finalNegotiatedPrice ?? offer.currentPrice;

      // Guarded transition — a concurrent confirmation wins.
      const guard = await tx.offer.updateMany({
        where: { id: offerId, status: 'SELLER_ACCEPTED' },
        data: { status: 'CANCELLED_BY_BUYER' },
      });
      if (guard.count === 0) {
        throw new AppError('This negotiation has already been resolved', 409, 'OFFER_ALREADY_RESOLVED');
      }

      await tx.offerHistory.create({
        data: {
          offerId,
          senderId: userId,
          price: finalPrice,
          message: 'Buyer declined the accepted offer',
          action: 'DECLINED',
        },
      });

      // Release the listing — only if no live order exists (a confirmed deal
      // keeps it reserved; a paid order must never be orphaned).
      await tx.listing.updateMany({
        where: {
          id: offer.listingId,
          status: 'RESERVED',
          orders: { none: { status: { in: ['AWAITING_SHIPMENT', 'PAYMENT_PROTECTED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DISPUTED'] } } },
        },
        data: { status: 'ACTIVE', reservedUntil: null, reservedByUserId: null },
      });

      await tx.notification.create({
        data: {
          userId: offer.sellerId,
          type: 'OFFER_DECLINED',
          title: 'Buyer Declined the Deal',
          message: `The buyer declined the accepted offer of ₹${finalPrice} for "${offer.listing.book.title}". The book is back on sale.`,
          link: `/offers/${offerId}`,
        },
      });

      return await tx.offer.findUnique({ where: { id: offerId } });
    });

    realtimeHub.publish(userId === result?.buyerId ? result!.sellerId : '', {
      type: 'OFFER_DECLINED',
      title: 'Buyer Declined the Deal',
      message: 'A seller-approved deal was declined and the book is back on sale.',
      link: `/offers/${offerId}`,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  /** SELLER rejection of the buyer's current price. Ends the negotiation. */
  async rejectOffer(userId: string, offerId: string) {
    const { offer, currentOfferSenderId, currentTurnUserId } = await this.getActiveOfferForResponse(offerId);

    this.assertActiveStatus(offer.status);

    // Only the seller may reject — the buyer withdraws (cancel) instead.
    if (userId !== offer.sellerId) {
      throw new ForbiddenError(
        'Only the seller can reject an offer — the buyer may withdraw their own offer',
        'SELLER_REJECT_ONLY'
      );
    }

    if (userId === currentOfferSenderId) {
      throw new ForbiddenError('You cannot reject your own counter offer', 'CANNOT_REJECT_OWN_OFFER');
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

    await notifyUser(currentOfferSenderId, {
      type: 'OFFER_REJECTED',
      title: 'Offer Rejected',
      message: `Your offer for "${offer.listing.book.title}" was rejected.`,
      link: `/offers/${offer.id}`,
    });

    return updated;
  }

  /**
   * The buyer withdraws their own outstanding proposal (PENDING offer, or their
   * own counter that the seller has not answered yet). Ends the negotiation
   * with CANCELLED — distinct from a rejection by the seller.
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

    await notifyUser(offer.sellerId, {
      type: 'OFFER_CANCELLED',
      title: 'Offer Withdrawn',
      message: `The buyer withdrew their offer for "${offer.listing.book.title}".`,
      link: `/offers/${offer.id}`,
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
