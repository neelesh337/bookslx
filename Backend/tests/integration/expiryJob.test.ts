import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/config/db';
import { expireReservedListings } from '../../src/jobs/expireReservations';
import { truncateAll, createUser, createBook, createListing, createOrder } from '../helpers';

describe('reservation expiry job', () => {
  let buyer: any;
  let seller: any;

  beforeEach(async () => {
    await truncateAll();
    buyer = await createUser({ name: 'Buyer' });
    seller = await createUser({ name: 'Seller' });
  });

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });

  it('releases an expired unpaid reservation, cancels the order, and notifies the buyer', async () => {
    const book = await createBook();
    const listing = await createListing({
      sellerId: seller.id,
      bookId: book.id,
      status: 'RESERVED',
      reservedUntil: new Date(Date.now() - 60_000),
      reservedByUserId: buyer.id,
    });
    const order = await createOrder({
      buyerId: buyer.id,
      sellerId: seller.id,
      listingId: listing.id,
      status: 'PAYMENT_PENDING',
    });

    const result = await expireReservedListings();

    expect(result.releasedListings).toBe(1);
    expect(result.cancelledOrders).toBe(1);
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('ACTIVE');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('CANCELLED');

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history.some((h) => h.toStatus === 'CANCELLED')).toBe(true);

    const notifications = await prisma.notification.findMany({ where: { userId: buyer.id } });
    expect(notifications.some((n) => n.type === 'ORDER_EXPIRED')).toBe(true);
  });

  it('does not release a reservation whose order was already paid', async () => {
    const book = await createBook();
    const listing = await createListing({
      sellerId: seller.id,
      bookId: book.id,
      status: 'RESERVED',
      reservedUntil: new Date(Date.now() - 60_000),
      reservedByUserId: buyer.id,
    });
    const order = await createOrder({
      buyerId: buyer.id,
      sellerId: seller.id,
      listingId: listing.id,
      status: 'AWAITING_SHIPMENT',
    });

    const result = await expireReservedListings();

    expect(result.releasedListings).toBe(0);
    expect(result.cancelledOrders).toBe(0);
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('RESERVED');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('AWAITING_SHIPMENT');
  });

  it('does not release a reservation that is not yet expired', async () => {
    const book = await createBook();
    const listing = await createListing({
      sellerId: seller.id,
      bookId: book.id,
      status: 'RESERVED',
      reservedUntil: new Date(Date.now() + 600_000),
      reservedByUserId: buyer.id,
    });
    await createOrder({
      buyerId: buyer.id,
      sellerId: seller.id,
      listingId: listing.id,
      status: 'PAYMENT_PENDING',
    });

    const result = await expireReservedListings();

    expect(result.releasedListings).toBe(0);
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('RESERVED');
  });

  it('is a no-op when there is nothing to expire', async () => {
    const result = await expireReservedListings();
    expect(result.releasedListings).toBe(0);
    expect(result.cancelledOrders).toBe(0);
  });
});
