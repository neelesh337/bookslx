import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding BooksLX database...');

  // Clear existing records
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

  const userPasswordHash = await bcrypt.hash('user123', 10);
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  // 1. Seed Demo Users
  await prisma.user.create({
    data: {
      name: 'BooksLX System Admin',
      email: 'admin@bookslx.local',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      rating: 5.0,
      emailVerified: true,
      verifiedAt: new Date(),
      profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      addresses: {
        create: {
          label: 'Admin HQ',
          name: 'BooksLX Admin',
          phone: '9999900000',
          line1: 'Building 7, Tech Park',
          line2: 'BKC Complex',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400051',
          isDefault: true,
          isPickupAddress: true,
        },
      },
    },
  });

  const rahul = await prisma.user.create({
    data: {
      name: 'Rahul Sharma',
      email: 'rahul@bookslx.local',
      phone: '9876543210',
      passwordHash: userPasswordHash,
      role: 'USER',
      rating: 4.8,
      totalSales: 12,
      totalPurchases: 18,
      emailVerified: true,
      verifiedAt: new Date(),
      profileImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80',
      addresses: {
        create: [
          {
            label: 'Home',
            name: 'Rahul Sharma',
            phone: '9876543210',
            line1: 'Flat 402, Sunshine Heights',
            line2: 'Andheri West',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400053',
            isDefault: true,
            isPickupAddress: true,
          },
        ],
      },
    },
  });

  const priya = await prisma.user.create({
    data: {
      name: 'Priya Patel',
      email: 'priya@bookslx.local',
      phone: '9876543211',
      passwordHash: userPasswordHash,
      role: 'USER',
      rating: 4.9,
      totalSales: 24,
      totalPurchases: 9,
      emailVerified: true,
      verifiedAt: new Date(),
      profileImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
      addresses: {
        create: [
          {
            label: 'Hostel Pickup',
            name: 'Priya Patel',
            phone: '9876543211',
            line1: 'Room 304, Sarojini Naidu Hostel',
            line2: 'IIT Campus, Powai',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400076',
            isDefault: true,
            isPickupAddress: true,
          },
        ],
      },
    },
  });

  const aman = await prisma.user.create({
    data: {
      name: 'Aman Verma',
      email: 'aman@bookslx.local',
      phone: '9876543212',
      passwordHash: userPasswordHash,
      role: 'USER',
      rating: 4.7,
      totalSales: 5,
      totalPurchases: 14,
      emailVerified: true,
      verifiedAt: new Date(),
      profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
      addresses: {
        create: [
          {
            label: 'Home',
            name: 'Aman Verma',
            phone: '9876543212',
            line1: 'B-12, Sector 62',
            line2: 'Near Metro Station',
            city: 'Noida',
            state: 'Uttar Pradesh',
            postalCode: '201301',
            isDefault: true,
            isPickupAddress: true,
          },
        ],
      },
    },
  });

  const neha = await prisma.user.create({
    data: {
      name: 'Neha Gupta',
      email: 'neha@bookslx.local',
      phone: '9876543213',
      passwordHash: userPasswordHash,
      role: 'USER',
      rating: 5.0,
      totalSales: 8,
      totalPurchases: 5,
      emailVerified: true,
      verifiedAt: new Date(),
      profileImage: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80',
      addresses: {
        create: [
          {
            label: 'Apartment',
            name: 'Neha Gupta',
            phone: '9876543213',
            line1: '102 Green Enclave',
            line2: 'Koramangala 4th Block',
            city: 'Bengaluru',
            state: 'Karnataka',
            postalCode: '560034',
            isDefault: true,
            isPickupAddress: true,
          },
        ],
      },
    },
  });

  console.log('✅ Demo Users Seeded: Admin, Rahul, Priya, Aman, Neha');

  // 2. Seed Realistic Second-Hand Books & Listings
  const booksData = [
    {
      isbn: '9780132350884',
      title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
      author: 'Robert C. Martin',
      publisher: 'Prentice Hall',
      edition: '1st Edition',
      category: 'Programming',
      description: 'Even bad code can function. But if code isn\'t clean, it can bring a development organization to its knees. Essential reading for every developer.',
      coverImage: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=600&q=80',
      askingPrice: 450,
      minOffer: 350,
      condition: 'EXCELLENT',
      sellerId: priya.id,
      conditionDetails: {
        coverCondition: 'Clean, no creases',
        pagesCondition: 'Crisp white pages',
        bindingCondition: 'Firm binding',
        writingPresent: false,
        highlightingPresent: true,
        damageNotes: 'Minor yellow highlighting in Chapter 3',
      },
    },
    {
      isbn: '9780262033848',
      title: 'Introduction to Algorithms (CLRS)',
      author: 'Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest',
      publisher: 'MIT Press',
      edition: '3rd Edition',
      category: 'Engineering',
      description: 'The bible of Computer Science Algorithms. Covers a broad range of algorithms in depth, yet makes their design and analysis accessible.',
      coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
      askingPrice: 750,
      minOffer: 600,
      condition: 'GOOD',
      sellerId: rahul.id,
      conditionDetails: {
        coverCondition: 'Light shelf wear on corners',
        pagesCondition: 'Clean pages throughout',
        bindingCondition: 'Sturdy hardcover binding',
        writingPresent: true,
        highlightingPresent: false,
        damageNotes: 'Pencil notes on margin of page 142',
      },
    },
    {
      isbn: '9780134685991',
      title: 'Effective Java',
      author: 'Joshua Bloch',
      publisher: 'Addison-Wesley Professional',
      edition: '3rd Edition',
      category: 'Programming',
      description: 'Definitive guide to Java best practices. Updated to cover Java 7, 8, and 9 features including lambdas and streams.',
      coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80',
      askingPrice: 520,
      minOffer: 420,
      condition: 'LIKE_NEW',
      sellerId: priya.id,
      conditionDetails: {
        coverCondition: 'Pristine, unwrapped feel',
        pagesCondition: 'Brand new condition',
        bindingCondition: 'Perfect',
        writingPresent: false,
        highlightingPresent: false,
        damageNotes: 'No damage',
      },
    },
    {
      isbn: '9789352869152',
      title: 'Quantitative Aptitude for Competitive Examinations',
      author: 'R.S. Aggarwal',
      publisher: 'S. Chand Publishing',
      edition: 'Revised Edition 2024',
      category: 'Competitive Exams',
      description: 'Comprehensive guide for CAT, GATE, Bank PO, UPSC, and Campus Placements with over 5500 solved problems.',
      coverImage: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=600&q=80',
      askingPrice: 320,
      minOffer: 250,
      condition: 'ACCEPTABLE',
      sellerId: aman.id,
      conditionDetails: {
        coverCondition: 'Fold on front cover corner',
        pagesCondition: 'All pages intact, slight tanning',
        bindingCondition: 'Intact',
        writingPresent: true,
        highlightingPresent: true,
        damageNotes: 'Solved pencil tick marks on practice questions',
      },
    },
    {
      isbn: '9780073383095',
      title: 'Operating System Concepts (Silberschatz Dinosaur Book)',
      author: 'Abraham Silberschatz, Peter B. Galvin',
      publisher: 'Wiley',
      edition: '9th Edition',
      category: 'Engineering',
      description: 'Clear explanations of operating systems processes, memory management, file systems, and virtual machines.',
      coverImage: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=600&q=80',
      askingPrice: 480,
      minOffer: 380,
      condition: 'GOOD',
      sellerId: neha.id,
      conditionDetails: {
        coverCondition: 'Good condition',
        pagesCondition: 'Clean text',
        bindingCondition: 'Strong spine',
        writingPresent: false,
        highlightingPresent: false,
        damageNotes: 'Owner name written inside front cover',
      },
    },
    {
      isbn: '9780099590088',
      title: 'Sapiens: A Brief History of Humankind',
      author: 'Yuval Noah Harari',
      publisher: 'Vintage Books',
      edition: 'Paperback Edition',
      category: 'Non-Fiction',
      description: 'Earth is 4.5 billion years old. In just a fraction of that time, one species among countless others has conquered it: us. A global bestseller.',
      coverImage: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=600&q=80',
      askingPrice: 280,
      minOffer: 200,
      condition: 'LIKE_NEW',
      sellerId: rahul.id,
      conditionDetails: {
        coverCondition: 'Flawless paperback cover',
        pagesCondition: 'Unread quality',
        bindingCondition: 'Unbroken spine',
        writingPresent: false,
        highlightingPresent: false,
        damageNotes: 'None',
      },
    },
    {
      isbn: '9781786330895',
      title: 'Ikigai: The Japanese Secret to a Long and Happy Life',
      author: 'Héctor García & Francesc Miralles',
      publisher: 'Hutchinson',
      edition: 'Hardcover Edition',
      category: 'Self Help',
      description: 'Discovering your ikigai or passion will bring meaning and joy to your life every single day.',
      coverImage: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80',
      askingPrice: 220,
      minOffer: 180,
      condition: 'EXCELLENT',
      sellerId: neha.id,
      conditionDetails: {
        coverCondition: 'Hardcover with dust jacket',
        pagesCondition: 'Clean and crisp',
        bindingCondition: 'Perfect',
        writingPresent: false,
        highlightingPresent: false,
        damageNotes: 'None',
      },
    },
    {
      isbn: '9780099518471',
      title: 'Atomic Habits',
      author: 'James Clear',
      publisher: 'Random House Business',
      edition: '1st Edition',
      category: 'Self Help',
      description: 'An easy & proven way to build good habits & break bad ones. Small changes, remarkable results.',
      coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80',
      askingPrice: 350,
      minOffer: 280,
      condition: 'LIKE_NEW',
      sellerId: priya.id,
      conditionDetails: {
        coverCondition: 'Like new',
        pagesCondition: 'Spotless',
        bindingCondition: 'Tight',
        writingPresent: false,
        highlightingPresent: false,
        damageNotes: 'None',
      },
    },
  ];

  for (const item of booksData) {
    const book = await prisma.book.create({
      data: {
        isbn: item.isbn,
        title: item.title,
        author: item.author,
        publisher: item.publisher,
        edition: item.edition,
        category: item.category,
        description: item.description,
        coverImage: item.coverImage,
      },
    });

    await prisma.listing.create({
      data: {
        sellerId: item.sellerId,
        bookId: book.id,
        askingPrice: item.askingPrice,
        minimumOfferPrice: item.minOffer,
        condition: item.condition,
        conditionDetails: JSON.stringify(item.conditionDetails),
        status: 'ACTIVE',
        images: {
          create: [
            {
              url: item.coverImage,
              altText: `${item.title} Cover`,
              isPrimary: true,
              displayOrder: 0,
            },
            {
              url: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=600&q=80',
              altText: `${item.title} Inside Pages`,
              isPrimary: false,
              displayOrder: 1,
            },
          ],
        },
      },
    });
  }

  console.log('✅ Seeded 8 Second-Hand Books and Active Listings');

  // 3. Seed an active Offer & OfferHistory (Rahul offers ₹380 on Priya's Clean Code listing)
  const cleanCodeListing = await prisma.listing.findFirst({
    where: { book: { isbn: '9780132350884' } },
  });

  if (cleanCodeListing) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const offer = await prisma.offer.create({
      data: {
        listingId: cleanCodeListing.id,
        buyerId: rahul.id,
        sellerId: priya.id,
        currentPrice: 400,
        status: 'COUNTERED',
        expiresAt,
        histories: {
          create: [
            {
              senderId: rahul.id,
              price: 350,
              message: 'Can you give it for 350?',
              action: 'OFFER_CREATED',
            },
            {
              senderId: priya.id,
              price: 400,
              message: 'The book is in excellent condition with pristine pages. I can do 400.',
              action: 'COUNTER_OFFER',
            },
          ],
        },
      },
    });

    await prisma.notification.create({
      data: {
        userId: rahul.id,
        type: 'COUNTER_OFFER',
        title: 'Counter Offer Received from Priya',
        message: 'Priya counter-offered ₹400 for Clean Code.',
        link: `/offers/${offer.id}`,
      },
    });
  }

  // 4. Seed a Completed Order & Review (Aman bought Quantitative Aptitude from Priya)
  const qaListing = await prisma.listing.findFirst({
    where: { book: { isbn: '9789352869152' } },
  });

  if (qaListing) {
    const orderNumber = `ORD-DEMO-2026-9901`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        buyerId: rahul.id,
        sellerId: aman.id, // matches the listing's seller
        listingId: qaListing.id,
        bookPrice: 320,
        shippingFee: 50,
        platformFee: 16, // 5% of book price (320 * 0.05)
        discount: 0,
        totalAmount: 386,
        status: 'COMPLETED',
        deliveryAddressSnapshot: JSON.stringify({
          name: 'Rahul Sharma',
          phone: '9876543210',
          line1: 'Flat 402, Sunshine Heights',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400053',
          country: 'India',
        }),
        pickupAddressSnapshot: JSON.stringify({
          name: 'Aman Verma',
          phone: '9876543212',
          line1: 'B-12, Sector 62',
          city: 'Noida',
          state: 'Uttar Pradesh',
          postalCode: '201301',
          country: 'India',
        }),
        statusHistory: {
          create: [
            { fromStatus: 'PAYMENT_PENDING', toStatus: 'PAYMENT_PROTECTED', reason: 'Mock payment success' },
            { fromStatus: 'PAYMENT_PROTECTED', toStatus: 'SHIPPED', reason: 'Seller created shipment' },
            { fromStatus: 'SHIPPED', toStatus: 'DELIVERED', reason: 'Courier delivered parcel' },
            { fromStatus: 'DELIVERED', toStatus: 'COMPLETED', reason: 'Buyer confirmed receipt' },
          ],
        },
        payment: {
          create: {
            paymentNumber: 'PAY-DEMO-8801',
            provider: 'mock',
            providerTransactionId: 'MOCK_TX_7761',
            amount: 386,
            status: 'RELEASED',
          },
        },
        shipment: {
          create: {
            courierName: 'BooksLX Logistics Express',
            trackingNumber: 'BLX-998877665',
            trackingUrl: 'https://bookslx.local/track/BLX-998877665',
            status: 'DELIVERED',
            estDeliveryDate: new Date(),
            shippedAt: new Date(Date.now() - 3600000 * 72),
            deliveredAt: new Date(Date.now() - 3600000 * 12),
            events: {
              create: [
                { status: 'SHIPPED', description: 'Package picked up from seller', location: 'Bengaluru' },
                { status: 'IN_TRANSIT', description: 'Arrived at Mumbai sorting facility', location: 'Mumbai' },
                { status: 'DELIVERED', description: 'Handed over to Rahul Sharma', location: 'Mumbai' },
              ],
            },
          },
        },
        reviews: {
          create: [
            {
              reviewerId: rahul.id,
              revieweeId: aman.id,
              rating: 5,
              communicationRating: 5,
              accuracyRating: 5,
              shippingRating: 5,
              comment: 'Super fast delivery and book condition matched the photos perfectly!',
            },
          ],
        },
      },
    });

    console.log(`✅ Seeded Completed Order #${order.orderNumber} with Review`);
  }

  console.log('🎉 BooksLX Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
