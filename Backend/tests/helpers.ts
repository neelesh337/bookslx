import { prisma } from '../src/config/db';

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}-${++counter}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Deletes every row in every table, in FK-safe order (same order as seed.ts). */
export async function truncateAll() {
  await prisma.notification.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.review.deleteMany();
  await prisma.disputeEvidence.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.shipmentEvent.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.offerHistory.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.book.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(overrides: Record<string, any> = {}) {
  return prisma.user.create({
    data: {
      name: 'Test User',
      email: `${uid('user')}@test.local`,
      passwordHash: 'test-hash',
      role: 'USER',
      ...overrides,
    },
  });
}

export async function createBook(overrides: Record<string, any> = {}) {
  return prisma.book.create({
    data: {
      isbn: uid('isbn'),
      title: 'Test Book',
      author: 'Test Author',
      category: 'Test',
      description: 'A book used in tests',
      ...overrides,
    },
  });
}

export async function createListing(overrides: Record<string, any> = {}) {
  const { price, ...rest } = overrides;
  return prisma.listing.create({
    data: {
      sellerId: rest.sellerId,
      bookId: rest.bookId,
      askingPrice: price ?? 100,
      condition: 'GOOD',
      conditionDetails: '{}',
      status: 'ACTIVE',
      ...rest,
    },
  });
}

export async function createOrder(data: {
  buyerId: string;
  sellerId: string;
  listingId: string;
  status?: string;
  bookPrice?: number;
  totalAmount?: number;
  [key: string]: any;
}) {
  const { buyerId, sellerId, listingId, status = 'PAYMENT_PENDING', bookPrice = 100, totalAmount = 170, ...rest } = data;
  return prisma.order.create({
    data: {
      orderNumber: uid('ORD'),
      buyerId,
      sellerId,
      listingId,
      bookPrice,
      shippingFee: 50,
      platformFee: 20,
      discount: 0,
      totalAmount,
      status,
      deliveryAddressSnapshot: JSON.stringify({
        name: 'Test Buyer',
        line1: '1 Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
      }),
      pickupAddressSnapshot: JSON.stringify({
        name: 'Test Seller',
        line1: '2 Test Street',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
        country: 'India',
      }),
      ...rest,
    },
  });
}
