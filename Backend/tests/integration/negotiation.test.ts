import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/config/db';
import { offerService } from '../../src/services/offerService';
import { expireActiveOffers } from '../../src/jobs/expireReservations';
import { AppError, ForbiddenError, NotFoundError } from '../../src/utils/errors';
import { truncateAll, createUser, createBook, createListing } from '../helpers';

describe('negotiation state machine', () => {
  let buyer: any;
  let seller: any;
  let other: any;

  beforeEach(async () => {
    await truncateAll();
    buyer = await createUser({ name: 'Rahul' });
    seller = await createUser({ name: 'Priya' });
    other = await createUser({ name: 'Aman' });
  });

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });

  async function makeListing() {
    const book = await createBook({ title: 'Clean Code' });
    const listing = await createListing({ sellerId: seller.id, bookId: book.id, price: 500 });
    return { book, listing };
  }

  // Buyer offers ₹350 on a fresh listing.
  async function makePendingOffer(price = 350) {
    const { listing } = await makeListing();
    const offer: any = await offerService.createOffer(buyer.id, listing.id, price, 'Can you do 350?');
    return { listing, offer };
  }

  describe('turn enforcement', () => {
    it('buyer cannot counter their own pending offer (double move)', async () => {
      const { offer } = await makePendingOffer();
      const err: any = await offerService.counterOffer(buyer.id, offer.id, 300).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_COUNTER_OWN_OFFER');
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.currentPrice).toBe(350);
    });

    it('buyer cannot accept their own pending offer', async () => {
      const { offer } = await makePendingOffer();
      const err: any = await offerService.acceptOffer(buyer.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_ACCEPT_OWN_OFFER');
    });

    it('buyer cannot reject their own pending offer (must cancel instead)', async () => {
      const { offer } = await makePendingOffer();
      const err: any = await offerService.rejectOffer(buyer.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_REJECT_OWN_OFFER');
    });

    it('seller cannot counter twice consecutively', async () => {
      const { offer } = await makePendingOffer();
      await offerService.counterOffer(seller.id, offer.id, 450); // seller's turn

      // Seller tries to counter their own ₹450 — the buyer now holds the turn.
      const err: any = await offerService.counterOffer(seller.id, offer.id, 460).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_COUNTER_OWN_OFFER');
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.currentPrice).toBe(450);
    });

    it('buyer cannot counter twice consecutively', async () => {
      const { offer } = await makePendingOffer();
      await offerService.counterOffer(seller.id, offer.id, 450); // turn → buyer
      await offerService.counterOffer(buyer.id, offer.id, 400); // turn → seller

      // Buyer tries to counter their own ₹400.
      const err: any = await offerService.counterOffer(buyer.id, offer.id, 380).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_COUNTER_OWN_OFFER');
    });

    it('seller cannot accept their own counter offer', async () => {
      const { offer } = await makePendingOffer();
      await offerService.counterOffer(seller.id, offer.id, 450);
      const err: any = await offerService.acceptOffer(seller.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_ACCEPT_OWN_OFFER');
    });
  });

  describe('resolved negotiations are terminal', () => {
    it('rejected offer cannot be accepted', async () => {
      const { offer } = await makePendingOffer();
      await offerService.rejectOffer(seller.id, offer.id);

      const err: any = await offerService.acceptOffer(seller.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('OFFER_ALREADY_RESOLVED');
      expect(await prisma.order.count()).toBe(0);
    });

    it('accepted offer cannot be countered or rejected', async () => {
      const { offer } = await makePendingOffer();
      await offerService.counterOffer(seller.id, offer.id, 450);
      await offerService.acceptOffer(buyer.id, offer.id);

      const settled = await Promise.allSettled([
        offerService.counterOffer(seller.id, offer.id, 500),
        offerService.rejectOffer(buyer.id, offer.id),
      ]);
      for (const r of settled) {
        const err: any = (r as PromiseRejectedResult).reason;
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('OFFER_ALREADY_RESOLVED');
      }
    });

    it('duplicate accept creates only one order (idempotent acceptance)', async () => {
      const { offer } = await makePendingOffer();
      await offerService.counterOffer(seller.id, offer.id, 450);

      const results = await Promise.allSettled([
        offerService.acceptOffer(buyer.id, offer.id),
        offerService.acceptOffer(buyer.id, offer.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      const err: any = (rejected[0] as PromiseRejectedResult).reason;
      expect(err.code).toBe('OFFER_ALREADY_RESOLVED');

      expect(await prisma.order.count()).toBe(1);
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('ACCEPTED');
    });

    it('cancelled offer cannot be accepted', async () => {
      const { offer } = await makePendingOffer();
      await offerService.cancelOffer(buyer.id, offer.id);

      const err: any = await offerService.acceptOffer(seller.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('OFFER_ALREADY_RESOLVED');
    });
  });

  describe('cancel (buyer withdrawal)', () => {
    it('buyer can withdraw their pending offer → CANCELLED', async () => {
      const { offer } = await makePendingOffer();
      const result: any = await offerService.cancelOffer(buyer.id, offer.id);
      expect(result.status).toBe('CANCELLED');
      const histories = await prisma.offerHistory.findMany({ where: { offerId: offer.id } });
      expect(histories.some((h) => h.action === 'CANCELLED')).toBe(true);
    });

    it('seller cannot cancel a buyer offer', async () => {
      const { offer } = await makePendingOffer();
      const err: any = await offerService.cancelOffer(seller.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_CANCEL_OTHERS_OFFER');
    });

    it('buyer cannot cancel the seller\'s counter — they must respond', async () => {
      const { offer } = await makePendingOffer();
      await offerService.counterOffer(seller.id, offer.id, 450);
      const err: any = await offerService.cancelOffer(buyer.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('CANNOT_CANCEL_OTHERS_OFFER');
    });
  });

  describe('access control', () => {
    it('an unrelated user cannot view another user\'s negotiation', async () => {
      const { offer } = await makePendingOffer();
      const err: any = await offerService.getOfferById(other.id, offer.id).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('an unrelated user cannot respond to an offer', async () => {
      const { offer } = await makePendingOffer();
      const err: any = await offerService.counterOffer(other.id, offer.id, 300).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('seller cannot make an offer on their own listing', async () => {
      const { listing } = await makeListing();
      const err: any = await offerService.createOffer(seller.id, listing.id, 300).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('getOffersForListing is seller-only', async () => {
      const { listing, offer } = await makePendingOffer();
      await expect(offerService.getOffersForListing(buyer.id, listing.id)).rejects.toThrow(ForbiddenError);
      const offers: any[] = await offerService.getOffersForListing(seller.id, listing.id);
      expect(offers.map((o) => o.id)).toEqual([offer.id]);
    });
  });

  describe('two buyers, one listing', () => {
    it('accepting one buyer\'s offer expires the other buyer\'s offers', async () => {
      const { listing } = await makeListing();
      await offerService.createOffer(buyer.id, listing.id, 350);
      const amanOffer: any = await offerService.createOffer(other.id, listing.id, 420);

      // Rahul's offer is accepted by the seller.
      const rahulOffer = await prisma.offer.findFirst({ where: { listingId: listing.id, buyerId: buyer.id } });
      await offerService.acceptOffer(seller.id, rahulOffer!.id);

      const amanNow = await prisma.offer.findUnique({ where: { id: amanOffer.id } });
      expect(amanNow?.status).toBe('EXPIRED');

      // Aman cannot counter or accept on the reserved listing.
      const err: any = await offerService.counterOffer(other.id, amanOffer.id, 450).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('OFFER_ALREADY_RESOLVED');

      const listingNow = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(listingNow?.status).toBe('RESERVED');
      expect(listingNow?.reservedByUserId).toBe(buyer.id);
    });
  });

  describe('offer expiry', () => {
    it('expired offer cannot be accepted or countered (server-side expiry)', async () => {
      const { offer } = await makePendingOffer();
      await prisma.offer.update({
        where: { id: offer.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const settled = await Promise.allSettled([
        offerService.acceptOffer(seller.id, offer.id),
        offerService.counterOffer(seller.id, offer.id, 400),
      ]);
      for (const r of settled) {
        const err: any = (r as PromiseRejectedResult).reason;
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('OFFER_EXPIRED');
      }
    });

    it('expiry job marks overdue offers EXPIRED and notifies both parties', async () => {
      const { offer } = await makePendingOffer();
      await prisma.offer.update({
        where: { id: offer.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const count = await expireActiveOffers();
      expect(count).toBe(1);
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('EXPIRED');

      const notifications = await prisma.notification.findMany({
        where: { type: 'OFFER_EXPIRED' },
      });
      expect(notifications.some((n) => n.userId === buyer.id)).toBe(true);
      expect(notifications.some((n) => n.userId === seller.id)).toBe(true);

      // Idempotent — a second sweep touches nothing.
      expect(await expireActiveOffers()).toBe(0);
    });
  });

  describe('counter notifications', () => {
    it('seller counter notifies the BUYER (not the seller)', async () => {
      const { offer } = await makePendingOffer(350);

      await offerService.counterOffer(seller.id, offer.id, 420);

      const buyerNotifs = await prisma.notification.findMany({
        where: { userId: buyer.id, type: 'COUNTER_OFFER' },
      });
      expect(buyerNotifs.length).toBe(1);
      expect(buyerNotifs[0].message).toContain('420');

      const sellerNotifs = await prisma.notification.findMany({
        where: { userId: seller.id, type: 'COUNTER_OFFER' },
      });
      expect(sellerNotifs.length).toBe(0); // the seller must never be notified about their own counter
    });

    it('buyer counter notifies the SELLER (not the buyer)', async () => {
      const { offer } = await makePendingOffer(350);
      await offerService.counterOffer(seller.id, offer.id, 420); // seller counter
      await offerService.counterOffer(buyer.id, offer.id, 400); // buyer counter

      const sellerNotifs = await prisma.notification.findMany({
        where: { userId: seller.id, type: 'COUNTER_OFFER' },
      });
      expect(sellerNotifs.length).toBe(1);
      expect(sellerNotifs[0].message).toContain('400');

      const buyerNotifs = await prisma.notification.findMany({
        where: { userId: buyer.id, type: 'COUNTER_OFFER' },
      });
      expect(buyerNotifs.length).toBe(1); // only the first (seller→buyer) counter
    });
  });

  describe('price direction (counters must move toward agreement)', () => {
    it('seller counter must be strictly higher than the buyer\'s offer', async () => {
      const { offer } = await makePendingOffer(350); // buyer ₹350

      // Equal is not a counter — it would be an acceptance.
      for (const price of [350, 300, 250]) {
        const err: any = await offerService.counterOffer(seller.id, offer.id, price).catch((e) => e);
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('COUNTER_MUST_EXCEED_OFFER');
      }
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.currentPrice).toBe(350);

      const okCounter: any = await offerService.counterOffer(seller.id, offer.id, 351);
      expect(okCounter.currentPrice).toBe(351);
    });

    it('buyer counter must be strictly lower than the seller\'s counter', async () => {
      const { offer } = await makePendingOffer(350);
      await offerService.counterOffer(seller.id, offer.id, 450); // seller ₹450

      for (const price of [450, 500]) {
        const err: any = await offerService.counterOffer(buyer.id, offer.id, price).catch((e) => e);
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('COUNTER_MUST_BE_BELOW_COUNTER');
      }

      const okCounter: any = await offerService.counterOffer(buyer.id, offer.id, 449);
      expect(okCounter.currentPrice).toBe(449);
    });

    it('negotiation can repeat until both sides agree (multi-round countering)', async () => {
      const { offer } = await makePendingOffer(300); // buyer ₹300 (min)
      await offerService.counterOffer(seller.id, offer.id, 400); // seller ₹400
      await offerService.counterOffer(buyer.id, offer.id, 320); // buyer ₹320
      await offerService.counterOffer(seller.id, offer.id, 360); // seller ₹360
      await offerService.counterOffer(buyer.id, offer.id, 340); // buyer ₹340
      const result: any = await offerService.acceptOffer(seller.id, offer.id); // seller accepts ₹340

      expect(result.offer.status).toBe('ACCEPTED');
      expect(result.order.bookPrice).toBe(340);

      const histories = await prisma.offerHistory.findMany({
        where: { offerId: offer.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(histories.map((h) => h.action)).toEqual([
        'OFFER_CREATED',
        'COUNTER_OFFER',
        'COUNTER_OFFER',
        'COUNTER_OFFER',
        'COUNTER_OFFER',
        'ACCEPTED',
      ]);
      expect(histories.map((h) => h.price)).toEqual([300, 400, 320, 360, 340, 340]);
    });
  });

  describe('golden path (spec §39)', () => {
    it('offer → counter → counter → counter → accept → order at the accepted price', async () => {
      const { listing } = await makeListing();
      const offer: any = await offerService.createOffer(buyer.id, listing.id, 350);

      await offerService.counterOffer(seller.id, offer.id, 450); // Priya counters
      await offerService.counterOffer(buyer.id, offer.id, 400); // Rahul counters
      await offerService.counterOffer(seller.id, offer.id, 420); // Priya counters
      const result: any = await offerService.acceptOffer(buyer.id, offer.id); // Rahul accepts ₹420

      expect(result.offer.status).toBe('ACCEPTED');
      expect(result.order.status).toBe('PAYMENT_PENDING');
      expect(result.order.bookPrice).toBe(420); // accepted price, NOT the ₹500 asking price
      expect(result.order.buyerId).toBe(buyer.id);
      expect(result.order.sellerId).toBe(seller.id);

      const listingNow = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(listingNow?.status).toBe('RESERVED');
      expect(listingNow?.reservedByUserId).toBe(buyer.id);

      // Immutable history: 4 proposals + 1 acceptance = 5 records, in order.
      const histories = await prisma.offerHistory.findMany({
        where: { offerId: offer.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(histories.map((h) => h.action)).toEqual([
        'OFFER_CREATED',
        'COUNTER_OFFER',
        'COUNTER_OFFER',
        'COUNTER_OFFER',
        'ACCEPTED',
      ]);
      expect(histories.map((h) => h.price)).toEqual([350, 450, 400, 420, 420]);
    });
  });
});
