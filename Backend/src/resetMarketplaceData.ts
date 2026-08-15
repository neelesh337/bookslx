import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Resets marketplace activity data while preserving the catalog and accounts.
 *
 * KEPT: users, their addresses, books, listings, listing images.
 * DELETED: notifications, wishlists, reviews, disputes, shipments, payments,
 * orders, carts, offers (and their child events/histories).
 *
 * Deletion order is FK-safe (same order as seed.ts / purgeNonDemoUsers.ts).
 */
async function main() {
  const counts: Record<string, number> = {};

  counts.notifications = (await prisma.notification.deleteMany()).count;
  counts.wishlists = (await prisma.wishlist.deleteMany()).count;
  counts.reviews = (await prisma.review.deleteMany()).count;
  counts.disputeEvidence = (await prisma.disputeEvidence.deleteMany()).count;
  counts.disputes = (await prisma.dispute.deleteMany()).count;
  counts.shipmentEvents = (await prisma.shipmentEvent.deleteMany()).count;
  counts.shipments = (await prisma.shipment.deleteMany()).count;
  counts.paymentEvents = (await prisma.paymentEvent.deleteMany()).count;
  counts.payments = (await prisma.payment.deleteMany()).count;
  counts.orderStatusHistory = (await prisma.orderStatusHistory.deleteMany()).count;
  counts.orders = (await prisma.order.deleteMany()).count;
  counts.cartItems = (await prisma.cartItem.deleteMany()).count;
  counts.carts = (await prisma.cart.deleteMany()).count;
  counts.offerHistories = (await prisma.offerHistory.deleteMany()).count;
  counts.offers = (await prisma.offer.deleteMany()).count;

  const deleted = Object.values(counts).reduce((a, b) => a + b, 0);

  console.log(`🧹 Marketplace activity cleared (${deleted} records):`);
  for (const [table, n] of Object.entries(counts)) {
    if (n > 0) console.log(`   ${table}: ${n}`);
  }

  const remaining = {
    users: await prisma.user.count(),
    addresses: await prisma.address.count(),
    books: await prisma.book.count(),
    listings: await prisma.listing.count(),
    listingImages: await prisma.listingImage.count(),
  };

  console.log('\n✅ Done. Preserved:');
  for (const [table, n] of Object.entries(remaining)) {
    console.log(`   ${table}: ${n}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
