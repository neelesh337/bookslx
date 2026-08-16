import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/config/db';
import { offerService } from '../../src/services/offerService';
import { AppError, ForbiddenError } from '../../src/utils/errors';
import { truncateAll, createUser, createBook, createListing } from '../helpers';

describe('offer acceptance -> order creation', () => {
  let buyer: any;
  let seller: any;
  let other: any;

  beforeEach(async () => {
    await truncateAll();
    buyer = await createUser({ name: 'Buyer' });
    seller = await createUser({ name: 'Seller' });
    other = await createUser({ name: 'Other' });
  });

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });

  async function makeListingWithOffer() {
    const book = await createBook();
    const listing = await createListing({ sellerId: seller.id, bookId: book.id, price: 200 });
    const expiresAt = new Date(Date.now() + 3_600_000);
    const offer = await prisma.offer.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        currentPrice: 150,
        status: 'PENDING',
        expiresAt,
      },
    });
    return { book, listing, offer };
  }

  it('creates a PAYMENT_PENDING order from an accepted offer and reserves the listing', async () => {
    const { listing, offer } = await makeListingWithOffer();

    const result: any = await offerService.acceptOffer(seller.id, offer.id);

    expect(result.order.status).toBe('PAYMENT_PENDING');
    expect(result.order.buyerId).toBe(buyer.id);
    expect(result.order.sellerId).toBe(seller.id);
    expect(result.order.bookPrice).toBe(150); // accepted price, not the asking price
    expect(result.order.totalAmount).toBe(207.5); // 150 + 50 shipping + 7.5 platform (5% of price)

    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('RESERVED');
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('ACCEPTED');

    const notifications = await prisma.notification.findMany({ where: { userId: buyer.id } });
    expect(notifications.some((n) => n.type === 'OFFER_ACCEPTED')).toBe(true);
  });

  it('expires competing pending offers when an offer is accepted', async () => {
    const book = await createBook();
    const listing = await createListing({ sellerId: seller.id, bookId: book.id, price: 200 });
    const expiresAt = new Date(Date.now() + 3_600_000);
    const accepted = await prisma.offer.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        currentPrice: 150,
        status: 'PENDING',
        expiresAt,
      },
    });
    const competing = await prisma.offer.create({
      data: {
        listingId: listing.id,
        buyerId: other.id,
        sellerId: seller.id,
        currentPrice: 120,
        status: 'PENDING',
        expiresAt,
      },
    });

    await offerService.acceptOffer(seller.id, accepted.id);

    expect((await prisma.offer.findUnique({ where: { id: accepted.id } }))?.status).toBe('ACCEPTED');
    expect((await prisma.offer.findUnique({ where: { id: competing.id } }))?.status).toBe('EXPIRED');
  });

  it('rejects accepting an offer on a listing that is no longer ACTIVE', async () => {
    const { listing, offer } = await makeListingWithOffer();
    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'PAUSED' } });
    await expect(offerService.acceptOffer(seller.id, offer.id)).rejects.toThrow(AppError);
  });

  it('rejects accepting an expired offer', async () => {
    const { offer } = await makeListingWithOffer();
    await prisma.offer.update({
      where: { id: offer.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(offerService.acceptOffer(seller.id, offer.id)).rejects.toThrow(AppError);
  });

  it('rejects an unauthorized user accepting an offer', async () => {
    const { offer } = await makeListingWithOffer();
    await expect(offerService.acceptOffer(other.id, offer.id)).rejects.toThrow(ForbiddenError);
  });

  it('forbids the buyer from accepting their own pending offer', async () => {
    const { offer } = await makeListingWithOffer();

    const err: any = await offerService.acceptOffer(buyer.id, offer.id).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.code).toBe('CANNOT_ACCEPT_OWN_OFFER');

    // The offer stays pending and no order is created.
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('PENDING');
    expect(await prisma.order.count()).toBe(0);
  });

  it('lets the buyer accept the seller\'s counter offer', async () => {
    const { offer, listing } = await makeListingWithOffer();
    await offerService.counterOffer(seller.id, offer.id, 160);

    const result: any = await offerService.acceptOffer(buyer.id, offer.id);

    expect(result.order.status).toBe('PAYMENT_PENDING');
    expect(result.order.bookPrice).toBe(160); // the countered price
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('ACCEPTED');
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('RESERVED');
  });

  it('forbids the seller from accepting their own counter offer', async () => {
    const { offer } = await makeListingWithOffer();
    await offerService.counterOffer(seller.id, offer.id, 160);

    const err: any = await offerService.acceptOffer(seller.id, offer.id).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.code).toBe('CANNOT_ACCEPT_OWN_OFFER');
  });

  describe('offer price validation (no ₹1 purchases)', () => {
    it('rejects an initial offer below the ₹10 floor', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id, price: 200 });
      const err: any = await offerService.createOffer(buyer.id, listing.id, 1).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('INVALID_OFFER_PRICE');
      expect(await prisma.offer.count()).toBe(0);
    });

    it('rejects a zero or non-numeric offer', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id, price: 200 });
      await expect(offerService.createOffer(buyer.id, listing.id, 0)).rejects.toThrow(AppError);
      const err: any = await offerService.createOffer(buyer.id, listing.id, NaN).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('INVALID_OFFER_PRICE');
    });

    it('respects the seller minimum offer price', async () => {
      const book = await createBook();
      const listing = await createListing({
        sellerId: seller.id,
        bookId: book.id,
        price: 200,
        minimumOfferPrice: 50,
      });
      await expect(offerService.createOffer(buyer.id, listing.id, 20)).rejects.toThrow(AppError);
      await expect(offerService.createOffer(buyer.id, listing.id, 50)).resolves.toBeTruthy();
    });

    it('rejects a counter offer below the ₹10 floor (the ₹1 exploit)', async () => {
      const { offer } = await makeListingWithOffer();
      // The seller holds the turn after the buyer's offer — a ₹1 counter from
      // the seller must be rejected server-side.
      const err: any = await offerService.counterOffer(seller.id, offer.id, 1).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('INVALID_COUNTER_PRICE');
      // The agreed price must be untouched — no ₹1 order can be created.
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.currentPrice).toBe(150);
      expect(await prisma.order.count()).toBe(0);
    });

    it('rejects a counter offer below the seller minimum', async () => {
      const book = await createBook();
      const listing = await createListing({
        sellerId: seller.id,
        bookId: book.id,
        price: 200,
        minimumOfferPrice: 60,
      });
      const expiresAt = new Date(Date.now() + 3_600_000);
      const offer = await prisma.offer.create({
        data: {
          listingId: listing.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          currentPrice: 80,
          status: 'PENDING',
          expiresAt,
        },
      });
      const err: any = await offerService.counterOffer(seller.id, offer.id, 40).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      // 40 >= ₹10 floor but below the seller's minimum → the spec's dedicated code.
      expect(err.code).toBe('OFFER_BELOW_MINIMUM_PRICE');
    });

    it('still allows a legitimate counter offer of ₹10+ (above the buyer offer)', async () => {
      const { offer } = await makeListingWithOffer();
      // ₹160 is above the ₹10 floor AND above the buyer's ₹150 offer, so it
      // satisfies both the minimum-price rule and the price-direction rule.
      const result: any = await offerService.counterOffer(seller.id, offer.id, 160);
      expect(result.currentPrice).toBe(160);
      expect(result.status).toBe('COUNTERED');
    });
  });

  describe('getUserOffers (role-scoped, highest amount first)', () => {
    it('shows sellers only incoming offers sorted by price descending', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id, price: 200 });
      const expiresAt = new Date(Date.now() + 3_600_000);

      const low = await prisma.offer.create({
        data: {
          listingId: listing.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          currentPrice: 120,
          status: 'PENDING',
          expiresAt,
        },
      });
      const high = await prisma.offer.create({
        data: {
          listingId: listing.id,
          buyerId: other.id,
          sellerId: seller.id,
          currentPrice: 180,
          status: 'PENDING',
          expiresAt,
        },
      });

      // Seller sees only offers on their book, highest amount on top.
      const sellerOffers: any[] = await offerService.getUserOffers(seller.id, 'seller');
      expect(sellerOffers.map((o) => o.id)).toEqual([high.id, low.id]);

      // Buyer sees only their own outgoing offer.
      const buyerOffers: any[] = await offerService.getUserOffers(buyer.id, 'buyer');
      expect(buyerOffers.map((o) => o.id)).toEqual([low.id]);

      // The combined feed still ranks the highest offer first.
      const all: any[] = await offerService.getUserOffers(seller.id, 'all');
      expect(all.map((o) => o.id)).toEqual([high.id, low.id]);
    });
  });
});
