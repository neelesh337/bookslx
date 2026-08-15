import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/config/db';
import { advanceMockShipments } from '../../src/jobs/advanceShipments';
import { truncateAll, createUser, createBook, createListing, createOrder, uid } from '../helpers';

describe('mock shipment auto-advance job', () => {
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

  /** Creates a SHIPPED order with a mock shipment that was shipped at `shippedAt`. */
  async function makeShippedOrder(shippedAt: Date) {
    const book = await createBook();
    const listing = await createListing({ sellerId: seller.id, bookId: book.id });
    const order = await createOrder({
      buyerId: buyer.id,
      sellerId: seller.id,
      listingId: listing.id,
      status: 'SHIPPED',
    });
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        courierName: 'BooksLX Express Logistics',
        trackingNumber: uid('BLX'),
        trackingUrl: `https://bookslx.local/track/${uid('t')}`,
        status: 'SHIPPED',
        estDeliveryDate: new Date(Date.now() + 3 * 24 * 3600_000),
        shippedAt,
        events: {
          create: { status: 'SHIPPED', description: 'Package picked up', location: 'Mumbai' },
        },
      },
    });
    return { order };
  }

  it('advances a shipment whose stage timer has elapsed', async () => {
    // Shipped 31s ago → the 30s SHIPPED→IN_TRANSIT timer has elapsed.
    const { order } = await makeShippedOrder(new Date(Date.now() - 31_000));

    const result = await advanceMockShipments(new Date());

    expect(result.advanced).toBe(1);
    expect((await prisma.shipment.findUnique({ where: { orderId: order.id } }))?.status).toBe('IN_TRANSIT');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('IN_TRANSIT');
  });

  it('does not advance a shipment that is not yet due', async () => {
    // Shipped 5s ago → nothing has elapsed yet.
    const { order } = await makeShippedOrder(new Date(Date.now() - 5_000));

    const result = await advanceMockShipments(new Date());

    expect(result.advanced).toBe(0);
    expect((await prisma.shipment.findUnique({ where: { orderId: order.id } }))?.status).toBe('SHIPPED');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('SHIPPED');
  });

  it('catches an overdue shipment all the way through to DELIVERED', async () => {
    // Shipped 91s ago → all three stage timers (30s/60s/90s) have elapsed.
    const { order } = await makeShippedOrder(new Date(Date.now() - 91_000));

    const result = await advanceMockShipments(new Date());

    expect(result.advanced).toBe(3);
    const shipment = await prisma.shipment.findUnique({ where: { orderId: order.id } });
    expect(shipment?.status).toBe('DELIVERED');
    expect(shipment?.deliveredAt).toBeTruthy();
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('DELIVERED');
  });

  it('is a no-op when there are no shipments', async () => {
    const result = await advanceMockShipments(new Date());
    expect(result.advanced).toBe(0);
  });
});
