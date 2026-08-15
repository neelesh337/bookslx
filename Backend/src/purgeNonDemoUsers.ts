import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Demo accounts that must survive the purge. Everything else — users, their
// credentials, and any data that references them — is removed.
const DEMO_EMAILS = [
  'admin@bookslx.local',
  'rahul@bookslx.local',
  'priya@bookslx.local',
  'aman@bookslx.local',
  'neha@bookslx.local',
];

async function main() {
  const doomed = await prisma.user.findMany({
    where: { email: { notIn: DEMO_EMAILS } },
    select: { id: true, email: true },
  });

  if (doomed.length === 0) {
    console.log('✅ No non-demo users found — nothing to remove.');
    return;
  }

  const ids = doomed.map((u) => u.id);
  console.log(`🧹 Removing ${doomed.length} non-demo user(s):`);
  for (const u of doomed) console.log(`   - ${u.email}`);

  // Delete child records in FK-safe order. Orders/offers/reviews that involve a
  // removed user are deleted even when the other party is a demo user.
  const counts: Record<string, number> = {};

  counts.notifications = (
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } })
  ).count;

  counts.wishlists = (
    await prisma.wishlist.deleteMany({ where: { userId: { in: ids } } })
  ).count;

  counts.reviews = (
    await prisma.review.deleteMany({
      where: { OR: [{ reviewerId: { in: ids } }, { revieweeId: { in: ids } }] },
    })
  ).count;

  counts.disputeEvidence = (
    await prisma.disputeEvidence.deleteMany({ where: { uploadedById: { in: ids } } })
  ).count;

  counts.disputes = (
    await prisma.dispute.deleteMany({ where: { raisedById: { in: ids } } })
  ).count;

  const orderScope = { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] };

  counts.shipmentEvents = (
    await prisma.shipmentEvent.deleteMany({ where: { shipment: { order: orderScope } } })
  ).count;

  counts.paymentEvents = (
    await prisma.paymentEvent.deleteMany({ where: { payment: { order: orderScope } } })
  ).count;

  counts.payments = (
    await prisma.payment.deleteMany({ where: { order: orderScope } })
  ).count;

  counts.orderStatusHistory = (
    await prisma.orderStatusHistory.deleteMany({ where: { order: orderScope } })
  ).count;

  counts.orders = (
    await prisma.order.deleteMany({ where: orderScope })
  ).count;

  counts.cartItems = (
    await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: ids } } } })
  ).count;

  counts.carts = (
    await prisma.cart.deleteMany({ where: { userId: { in: ids } } })
  ).count;

  counts.offerHistories = (
    await prisma.offerHistory.deleteMany({ where: { offer: orderScope } })
  ).count;

  counts.offers = (
    await prisma.offer.deleteMany({ where: orderScope })
  ).count;

  counts.listingImages = (
    await prisma.listingImage.deleteMany({ where: { listing: { sellerId: { in: ids } } } })
  ).count;

  counts.listings = (
    await prisma.listing.deleteMany({ where: { sellerId: { in: ids } } })
  ).count;

  counts.addresses = (
    await prisma.address.deleteMany({ where: { userId: { in: ids } } })
  ).count;

  // Books whose every listing belonged to a removed seller are now orphaned.
  counts.books = (
    await prisma.book.deleteMany({ where: { listings: { none: {} } } })
  ).count;

  counts.users = (
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
  ).count;

  console.log('🗑️  Deleted records:');
  for (const [table, n] of Object.entries(counts)) {
    if (n > 0) console.log(`   ${table}: ${n}`);
  }

  const remaining = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log(`\n✅ Done. Remaining users (${remaining.length}):`);
  for (const u of remaining) console.log(`   - ${u.email} (${u.role})`);
}

main()
  .catch((e) => {
    console.error('❌ Purge failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
