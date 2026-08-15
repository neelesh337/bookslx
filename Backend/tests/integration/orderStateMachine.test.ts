import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/config/db';
import { orderService } from '../../src/services/orderService';
import { AppError, ForbiddenError, NotFoundError } from '../../src/utils/errors';
import { truncateAll, createUser, createBook, createListing, createOrder } from '../helpers';

describe('Order state machine', () => {
  let buyer: any;
  let seller: any;
  let admin: any;
  let other: any;

  beforeEach(async () => {
    await truncateAll();
    buyer = await createUser({ name: 'Buyer' });
    seller = await createUser({ name: 'Seller' });
    admin = await createUser({ name: 'Admin', role: 'ADMIN' });
    other = await createUser({ name: 'Other' });
  });

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });

  /** Creates an ACTIVE listing reserved by the buyer, with a PAYMENT_PENDING order. */
  async function makeReservedOrder() {
    const book = await createBook();
    const listing = await createListing({ sellerId: seller.id, bookId: book.id });
    const order = await createOrder({
      buyerId: buyer.id,
      sellerId: seller.id,
      listingId: listing.id,
    });
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'RESERVED',
        reservedUntil: new Date(Date.now() + 900_000),
        reservedByUserId: buyer.id,
      },
    });
    return { book, listing, order };
  }

  describe('createDirectOrder', () => {
    it('creates a PAYMENT_PENDING order without reserving the listing, and snapshots addresses', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id });

      const order: any = await orderService.createDirectOrder(buyer.id, listing.id);

      expect(order.status).toBe('PAYMENT_PENDING');
      expect(order.buyerId).toBe(buyer.id);
      expect(order.sellerId).toBe(seller.id);
      expect(order.bookPrice).toBe(100);
      expect(order.totalAmount).toBe(155); // 100 + 50 shipping + 5 platform (5% of price)

      // Checkout-initiation must not block the book for other buyers — the
      // listing stays ACTIVE and is only claimed when payment completes.
      const saved = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(saved?.status).toBe('ACTIVE');
      expect(saved?.reservedByUserId).toBeNull();

      // Buyer has no saved addresses, so the service falls back to the user's name
      const delivery = JSON.parse(order.deliveryAddressSnapshot);
      expect(delivery.name).toBe('Buyer');
      const pickup = JSON.parse(order.pickupAddressSnapshot);
      expect(pickup.name).toBe('Seller');
    });

    it('rejects purchasing your own listing', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: buyer.id, bookId: book.id });
      await expect(orderService.createDirectOrder(buyer.id, listing.id)).rejects.toThrow(ForbiddenError);
    });

    it('rejects a listing that is not ACTIVE', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id, status: 'PAUSED' });
      await expect(orderService.createDirectOrder(buyer.id, listing.id)).rejects.toThrow(AppError);
    });

    it('is idempotent for the same idempotency key', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id });
      const first: any = await orderService.createDirectOrder(buyer.id, listing.id, undefined, 'IDEM-1');
      const second: any = await orderService.createDirectOrder(buyer.id, listing.id, undefined, 'IDEM-1');
      expect(second.id).toBe(first.id);
    });

    it('keeps competing offers open while in checkout, then expires them once paid', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id });
      const offer = await prisma.offer.create({
        data: {
          listingId: listing.id,
          buyerId: other.id,
          sellerId: seller.id,
          currentPrice: 90,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      // Merely initiating checkout must not kill other buyers' offers.
      const order: any = await orderService.createDirectOrder(buyer.id, listing.id);
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('PENDING');

      // Once the payment actually completes, the sale is real — competing offers expire.
      await orderService.processPayment(order.id, buyer.id);
      expect((await prisma.offer.findUnique({ where: { id: offer.id } }))?.status).toBe('EXPIRED');
    });

    it('returns the existing order instead of creating a duplicate on repeat checkout', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id });

      const first: any = await orderService.createDirectOrder(buyer.id, listing.id);
      const second: any = await orderService.createDirectOrder(buyer.id, listing.id);

      expect(second.id).toBe(first.id);
    });
  });

  // NOTE: processPayment's ConflictError guard (order no longer PAYMENT_PENDING when
  // the reservation was expired mid-payment) is intentionally not tested here — it only
  // triggers in a real race between the pre-read and the transaction.
  describe('updateDeliveryAddress (address added/changed at checkout)', () => {
    async function createBuyerAddress(overrides: Record<string, any> = {}) {
      return prisma.address.create({
        data: {
          userId: buyer.id,
          label: 'Work',
          name: 'Buyer',
          phone: '9999999999',
          line1: '456 Office Road',
          city: 'Pune',
          state: 'Maharashtra',
          postalCode: '411001',
          country: 'India',
          ...overrides,
        },
      });
    }

    it('updates the delivery snapshot to a saved address of the buyer', async () => {
      const { order } = await makeReservedOrder();
      const address = await createBuyerAddress();

      const updated: any = await orderService.updateDeliveryAddress(order.id, buyer.id, address.id);

      const snapshot = JSON.parse(updated.deliveryAddressSnapshot);
      expect(snapshot.id).toBe(address.id);
      expect(snapshot.city).toBe('Pune');
      expect(snapshot.label).toBe('Work');
    });

    it('rejects an address that does not belong to the buyer', async () => {
      const { order } = await makeReservedOrder();
      const sellersAddress = await prisma.address.create({
        data: {
          userId: seller.id,
          name: 'Seller',
          phone: '9888888888',
          line1: '1 Seller Lane',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'India',
        },
      });

      await expect(orderService.updateDeliveryAddress(order.id, buyer.id, sellersAddress.id)).rejects.toThrow(
        NotFoundError
      );
    });

    it('rejects updating the address after the order has been paid', async () => {
      const { order } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);
      const address = await createBuyerAddress();

      await expect(orderService.updateDeliveryAddress(order.id, buyer.id, address.id)).rejects.toThrow(AppError);
    });

    it('rejects a non-buyer updating the delivery address', async () => {
      const { order } = await makeReservedOrder();
      const address = await createBuyerAddress();

      await expect(orderService.updateDeliveryAddress(order.id, seller.id, address.id)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('processPayment', () => {
    it('moves a paid order to AWAITING_SHIPMENT with a PROTECTED payment', async () => {
      const { order } = await makeReservedOrder();

      const result: any = await orderService.processPayment(order.id, buyer.id);

      expect(result.success).toBe(true);
      expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('AWAITING_SHIPMENT');

      const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
      expect(payment?.status).toBe('PROTECTED');

      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
      expect(history.some((h) => h.toStatus === 'AWAITING_SHIPMENT')).toBe(true);

      const notifications = await prisma.notification.findMany({
        where: { userId: { in: [buyer.id, seller.id] } },
      });
      expect(notifications.length).toBeGreaterThanOrEqual(2);
    });

    it('cancels the order and releases the listing when payment fails', async () => {
      const { order, listing } = await makeReservedOrder();

      const result: any = await orderService.processPayment(order.id, buyer.id, true);

      expect(result.success).toBe(false);
      expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('CANCELLED');
      expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('ACTIVE');
      expect((await prisma.payment.findUnique({ where: { orderId: order.id } }))?.status).toBe('FAILED');
    });

    it('rejects a non-buyer paying for the order', async () => {
      const { order } = await makeReservedOrder();
      await expect(orderService.processPayment(order.id, seller.id)).rejects.toThrow(ForbiddenError);
    });

    it('rejects paying for an order that is not PAYMENT_PENDING', async () => {
      const { order } = await makeReservedOrder();
      await prisma.order.update({ where: { id: order.id }, data: { status: 'AWAITING_SHIPMENT' } });
      await expect(orderService.processPayment(order.id, buyer.id)).rejects.toThrow(AppError);
    });

    it('claims the listing for the buyer when payment completes (direct order)', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id });
      const order: any = await orderService.createDirectOrder(buyer.id, listing.id);

      expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('ACTIVE');

      await orderService.processPayment(order.id, buyer.id);

      const saved = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(saved?.status).toBe('RESERVED');
      expect(saved?.reservedByUserId).toBe(buyer.id);
    });

    it('rejects a second buyer paying for the same listing and refunds them', async () => {
      const book = await createBook();
      const listing = await createListing({ sellerId: seller.id, bookId: book.id });

      const orderA: any = await orderService.createDirectOrder(buyer.id, listing.id);
      const orderB: any = await orderService.createDirectOrder(other.id, listing.id);

      await orderService.processPayment(orderA.id, buyer.id);

      const err: any = await orderService.processPayment(orderB.id, other.id).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('LISTING_SOLD_ELSEWHERE');

      // The first buyer keeps the listing; the loser's order is cancelled and
      // the mock provider refund is a no-op.
      expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.reservedByUserId).toBe(buyer.id);
      expect((await prisma.order.findUnique({ where: { id: orderB.id } }))?.status).toBe('CANCELLED');
      expect((await prisma.order.findUnique({ where: { id: orderA.id } }))?.status).toBe('AWAITING_SHIPMENT');
    });
  });

  describe('cancelOrder (buyer-initiated refund)', () => {
    it('refunds an AWAITING_SHIPMENT order and relists the book', async () => {
      const { order, listing } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);

      const result: any = await orderService.cancelOrder(buyer.id, order.id, 'Changed my mind');

      expect(result?.status).toBe('REFUNDED');
      expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('ACTIVE');

      const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
      expect(payment?.status).toBe('REFUNDED');

      const events = await prisma.paymentEvent.findMany({ where: { paymentId: payment!.id } });
      expect(events.some((e) => e.eventType === 'REFUND')).toBe(true);

      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
      expect(history.some((h) => h.toStatus === 'REFUNDED')).toBe(true);

      const notifications = await prisma.notification.findMany({ where: { userId: buyer.id } });
      expect(notifications.some((n) => n.type === 'ORDER_CANCELLED')).toBe(true);
    });

    it('only lets the buyer cancel', async () => {
      const { order } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);
      await expect(orderService.cancelOrder(seller.id, order.id)).rejects.toThrow(ForbiddenError);
    });

    it('cannot cancel after the order has shipped', async () => {
      const { order } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);
      await orderService.sellerShipOrder(seller.id, order.id);
      await expect(orderService.cancelOrder(buyer.id, order.id)).rejects.toThrow(AppError);
    });

    it('cannot cancel an order twice', async () => {
      const { order } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);
      await orderService.cancelOrder(buyer.id, order.id);
      await expect(orderService.cancelOrder(buyer.id, order.id)).rejects.toThrow(AppError);
    });

    it('rejects cancellation when no payment record exists', async () => {
      const { order } = await makeReservedOrder();
      await prisma.order.update({ where: { id: order.id }, data: { status: 'AWAITING_SHIPMENT' } });
      await expect(orderService.cancelOrder(buyer.id, order.id)).rejects.toThrow(AppError);
    });
  });

  describe('sellerShipOrder', () => {
    it('creates a shipment and moves the order to SHIPPED', async () => {
      const { order } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);

      const result: any = await orderService.sellerShipOrder(seller.id, order.id);

      expect(result.order.status).toBe('SHIPPED');
      const shipment = await prisma.shipment.findUnique({ where: { orderId: order.id } });
      expect(shipment?.trackingNumber).toBeTruthy();

      const events = await prisma.shipmentEvent.findMany({ where: { shipmentId: shipment!.id } });
      expect(events.length).toBeGreaterThan(0);

      const buyerNotifications = await prisma.notification.findMany({ where: { userId: buyer.id } });
      expect(buyerNotifications.some((n) => n.type === 'SHIPMENT_CREATED')).toBe(true);
    });

    it('only lets the seller ship', async () => {
      const { order } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);
      await expect(orderService.sellerShipOrder(buyer.id, order.id)).rejects.toThrow(ForbiddenError);
    });

    it('cannot ship an unpaid order', async () => {
      const { order } = await makeReservedOrder();
      await expect(orderService.sellerShipOrder(seller.id, order.id)).rejects.toThrow(AppError);
    });
  });

  // NOTE: there is deliberately no seller-driven courier control anymore — the
  // logistics provider owns shipment status (mock simulator / tracking webhook),
  // so only autoAdvanceShipmentStatus below exercises the transitions.
  describe('autoAdvanceShipmentStatus (logistics-owned delivery simulator)', () => {
    async function makeShippedOrder() {
      const ctx = await makeReservedOrder();
      await orderService.processPayment(ctx.order.id, buyer.id);
      await orderService.sellerShipOrder(seller.id, ctx.order.id);
      return ctx;
    }

    it('advances the shipment and order without an actor, adding events and notifying the buyer', async () => {
      const { order } = await makeShippedOrder();

      const result: any = await orderService.autoAdvanceShipmentStatus(order.id, 'IN_TRANSIT', 'Central Distribution Center');

      expect(result.order.status).toBe('IN_TRANSIT');
      expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('IN_TRANSIT');

      const shipment = await prisma.shipment.findUnique({ where: { orderId: order.id } });
      expect(shipment?.status).toBe('IN_TRANSIT');

      const events = await prisma.shipmentEvent.findMany({ where: { shipmentId: shipment!.id } });
      expect(events.some((e) => e.status === 'IN_TRANSIT' && e.location === 'Central Distribution Center')).toBe(true);

      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
      expect(history.some((h) => h.toStatus === 'IN_TRANSIT')).toBe(true);

      const notifications = await prisma.notification.findMany({ where: { userId: buyer.id } });
      expect(notifications.some((n) => n.type === 'SHIPMENT_UPDATE')).toBe(true);
    });

    it('advances all the way to DELIVERED and stamps deliveredAt', async () => {
      const { order } = await makeShippedOrder();

      await orderService.autoAdvanceShipmentStatus(order.id, 'IN_TRANSIT');
      await orderService.autoAdvanceShipmentStatus(order.id, 'OUT_FOR_DELIVERY');
      await orderService.autoAdvanceShipmentStatus(order.id, 'DELIVERED', 'Mumbai');

      expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('DELIVERED');
      const shipment = await prisma.shipment.findUnique({ where: { orderId: order.id } });
      expect(shipment?.status).toBe('DELIVERED');
      expect(shipment?.deliveredAt).toBeTruthy();
    });

    it('is a no-op when the shipment is already at the target status', async () => {
      const { order } = await makeShippedOrder();
      await orderService.autoAdvanceShipmentStatus(order.id, 'IN_TRANSIT');

      const eventsBefore = await prisma.shipmentEvent.count();
      await orderService.autoAdvanceShipmentStatus(order.id, 'IN_TRANSIT');
      const eventsAfter = await prisma.shipmentEvent.count();

      expect(eventsAfter).toBe(eventsBefore);
    });
  });

  describe('completeOrder', () => {
    it('completes a DELIVERED order, releases settlement, and marks the listing SOLD', async () => {
      const { order, listing } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);
      await orderService.sellerShipOrder(seller.id, order.id);
      // The courier status comes from the logistics provider, not the seller.
      await orderService.autoAdvanceShipmentStatus(order.id, 'DELIVERED');

      await orderService.completeOrder(buyer.id, order.id);

      expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('COMPLETED');
      expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.status).toBe('SOLD');

      const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
      expect(payment?.status).toBe('RELEASED');

      const sellerAfter = await prisma.user.findUnique({ where: { id: seller.id } });
      const buyerAfter = await prisma.user.findUnique({ where: { id: buyer.id } });
      expect(sellerAfter?.totalSales).toBe(1);
      expect(buyerAfter?.totalPurchases).toBe(1);
    });

    it('only completes DELIVERED orders', async () => {
      const { order } = await makeReservedOrder();
      await orderService.processPayment(order.id, buyer.id);
      await expect(orderService.completeOrder(buyer.id, order.id)).rejects.toThrow(AppError);
    });
  });

  describe('getOrderDetails authorization', () => {
    it('lets participants and admins view the order but blocks outsiders', async () => {
      const { order } = await makeReservedOrder();

      await expect(orderService.getOrderDetails(buyer.id, order.id)).resolves.toBeTruthy();
      await expect(orderService.getOrderDetails(seller.id, order.id)).resolves.toBeTruthy();
      await expect(orderService.getOrderDetails(admin.id, order.id)).resolves.toBeTruthy();
      await expect(orderService.getOrderDetails(other.id, order.id)).rejects.toThrow(ForbiddenError);
    });
  });
});
