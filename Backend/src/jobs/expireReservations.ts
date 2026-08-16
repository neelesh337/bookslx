import { prisma } from '../config/db';

// Listings are reserved for 15 minutes while the buyer completes payment.
// This job sweeps for lapsed reservations on a regular interval.
const RESERVATION_EXPIRY_INTERVAL_MS = 60_000;
const RESERVATION_STARTUP_DELAY_MS = 5_000;

// Order statuses that indicate the reservation is "live" — payment completed or
// fulfillment already in progress. A listing with any such order must never be
// released back to the marketplace.
const LIVE_ORDER_STATUSES = [
  'AWAITING_SHIPMENT',
  'PAYMENT_PROTECTED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DISPUTED',
];

export interface ExpirySweepResult {
  releasedListings: number;
  cancelledOrders: number;
}

/**
 * Releases every listing whose reservation window has lapsed and whose buyer never
 * completed payment, then cancels the linked unpaid orders and notifies the buyers.
 *
 * All mutations run in a single transaction and every write is conditional on the
 * state still being the one we expect, so a concurrent payment, cancellation, or
 * sale cannot be clobbered by the sweep.
 */
export async function expireReservedListings(): Promise<ExpirySweepResult> {
  const now = new Date();

  const expiredListings = await prisma.listing.findMany({
    where: {
      status: 'RESERVED',
      reservedUntil: { lt: now },
      // Only listings with no live (paid/in-transit) order are candidates
      orders: { none: { status: { in: LIVE_ORDER_STATUSES } } },
    },
    include: {
      book: { select: { title: true } },
      orders: {
        where: { status: 'PAYMENT_PENDING' },
        select: { id: true, buyerId: true },
      },
    },
  });

  if (expiredListings.length === 0) {
    return { releasedListings: 0, cancelledOrders: 0 };
  }

  let releasedListings = 0;
  let cancelledOrders = 0;

  await prisma.$transaction(async (tx) => {
    for (const listing of expiredListings) {
      // 1. Cancel each unpaid order, but only if it is still awaiting payment.
      //    If the buyer paid in the meantime, the order is no longer ours to touch.
      for (const order of listing.orders) {
        const cancelled = await tx.order.updateMany({
          where: { id: order.id, status: 'PAYMENT_PENDING' },
          data: { status: 'CANCELLED' },
        });

        if (cancelled.count === 0) continue;

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: 'PAYMENT_PENDING',
            toStatus: 'CANCELLED',
            changedById: null,
            reason: 'Reservation window expired: payment not completed within 15 minutes',
          },
        });

        await tx.notification.create({
          data: {
            userId: order.buyerId,
            type: 'ORDER_EXPIRED',
            title: 'Order Expired — Payment Not Completed',
            message: `Your order for "${listing.book.title}" was cancelled because payment wasn't completed within the reservation window. The book is back on sale.`,
            link: `/books/${listing.id}`,
          },
        });

        cancelledOrders += 1;
      }

      // 2. Release the listing back to ACTIVE, but only if it is still reserved AND
      //    no live order exists for it (re-validated under the transaction lock).
      const released = await tx.listing.updateMany({
        where: {
          id: listing.id,
          status: 'RESERVED',
          orders: { none: { status: { in: LIVE_ORDER_STATUSES } } },
        },
        data: { status: 'ACTIVE', reservedUntil: null, reservedByUserId: null },
      });

      if (released.count > 0) releasedListings += 1;
    }
  });

  return { releasedListings, cancelledOrders };
}

/**
 * Marks PENDING/COUNTERED offers whose expiry window has passed as EXPIRED and
 * notifies both parties. The server is the only authority on expiry — the
 * browser countdown is purely visual. Each offer is only touched once (the
 * status guard makes the sweep idempotent).
 */
export async function expireActiveOffers(): Promise<number> {
  const now = new Date();
  const expired = await prisma.offer.findMany({
    where: { status: { in: ['PENDING', 'COUNTERED'] }, expiresAt: { lt: now } },
    include: { listing: { select: { book: { select: { title: true } } } } },
  });

  let count = 0;
  for (const offer of expired) {
    const updated = await prisma.offer.updateMany({
      where: { id: offer.id, status: { in: ['PENDING', 'COUNTERED'] } },
      data: { status: 'EXPIRED' },
    });
    if (updated.count === 0) continue; // resolved concurrently — leave it alone

    // Immutable audit trail for the expiry.
    await prisma.offerHistory.create({
      data: {
        offerId: offer.id,
        senderId: offer.buyerId,
        price: offer.currentPrice,
        message: 'Offer expired',
        action: 'EXPIRED',
      },
    });

    const title = '"' + offer.listing.book.title + '"';
    await prisma.notification.createMany({
      data: [
        {
          userId: offer.buyerId,
          type: 'OFFER_EXPIRED',
          title: 'Offer Expired',
          message: 'Your offer for ' + title + ' has expired.',
          link: '/offers/' + offer.id,
        },
        {
          userId: offer.sellerId,
          type: 'OFFER_EXPIRED',
          title: 'Offer Expired',
          message: 'The offer for ' + title + ' has expired.',
          link: '/offers/' + offer.id,
        },
      ],
    });

    count += 1;
  }
  return count;
}

let intervalHandle: NodeJS.Timeout | null = null;
let startupHandle: NodeJS.Timeout | null = null;
let sweepRunning = false;

async function runSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const result = await expireReservedListings();
    if (result.releasedListings > 0 || result.cancelledOrders > 0) {
      console.log(
        `[jobs] Released ${result.releasedListings} expired reservation(s), cancelled ${result.cancelledOrders} unpaid order(s)`
      );
    }

    const expiredOffers = await expireActiveOffers();
    if (expiredOffers > 0) {
      console.log(`[jobs] Expired ${expiredOffers} offer(s) whose window lapsed`);
    }
  } catch (error) {
    console.error('[jobs] Reservation expiry sweep failed:', error);
  } finally {
    sweepRunning = false;
  }
}

/**
 * Starts the periodic reservation-expiry sweep. Runs once shortly after boot (to
 * clean up reservations that lapsed while the server was offline), then on a
 * regular interval. Idempotent — safe to call multiple times.
 */
export function startReservationExpiryJob(
  intervalMs: number = RESERVATION_EXPIRY_INTERVAL_MS
): void {
  if (intervalHandle) return;

  startupHandle = setTimeout(() => {
    startupHandle = null;
    runSweep();
  }, RESERVATION_STARTUP_DELAY_MS);

  intervalHandle = setInterval(runSweep, intervalMs);
}

export function stopReservationExpiryJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (startupHandle) {
    clearTimeout(startupHandle);
    startupHandle = null;
  }
}
