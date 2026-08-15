import { prisma } from '../config/db';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';

export type ListingCondition = 'LIKE_NEW' | 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR';

export interface SearchListingsParams {
  query?: string;
  category?: string;
  condition?: ListingCondition;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'popular';
  page?: number;
  limit?: number;
}

export class BookService {
  async searchListings(params: SearchListingsParams) {
    const page = params.page || 1;
    const limit = params.limit || 12;
    const skip = (page - 1) * limit;

    const where: any = {
      status: 'ACTIVE',
    };

    if (params.category && params.category !== 'All') {
      where.book = { category: params.category };
    }

    if (params.condition) {
      where.condition = params.condition;
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.askingPrice = {};
      if (params.minPrice !== undefined) where.askingPrice.gte = params.minPrice;
      if (params.maxPrice !== undefined) where.askingPrice.lte = params.maxPrice;
    }

    if (params.query) {
      where.OR = [
        { book: { title: { contains: params.query } } },
        { book: { author: { contains: params.query } } },
        { book: { isbn: { contains: params.query } } },
        { book: { category: { contains: params.query } } },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    if (params.sortBy === 'price_asc') {
      orderBy = { askingPrice: 'asc' };
    } else if (params.sortBy === 'price_desc') {
      orderBy = { askingPrice: 'desc' };
    } else if (params.sortBy === 'popular') {
      orderBy = { offers: { _count: 'desc' } };
    }

    const [items, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: {
          book: true,
          seller: {
            select: {
              id: true,
              name: true,
              rating: true,
              totalSales: true,
              profileImage: true,
            },
          },
          images: {
            orderBy: { isPrimary: 'desc' },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.listing.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getListingDetails(id: string) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        book: true,
        seller: {
          select: {
            id: true,
            name: true,
            rating: true,
            totalSales: true,
            totalPurchases: true,
            createdAt: true,
            profileImage: true,
          },
        },
        images: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    const similarListings = await prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: id },
        book: { category: listing.book.category },
      },
      include: {
        book: true,
        images: { where: { isPrimary: true } },
      },
      take: 4,
    });

    return {
      listing,
      similarListings,
    };
  }

  async createListing(
    sellerId: string,
    data: {
      isbn: string;
      title: string;
      author: string;
      publisher?: string;
      edition?: string;
      category: string;
      description: string;
      askingPrice: number;
      minimumOfferPrice?: number;
      condition: ListingCondition;
      conditionDetails: any;
      images: Array<{ url: string; altText?: string; isPrimary?: boolean }>;
    }
  ) {
    let book = await prisma.book.findUnique({ where: { isbn: data.isbn } });

    if (!book) {
      book = await prisma.book.create({
        data: {
          isbn: data.isbn,
          title: data.title,
          author: data.author,
          publisher: data.publisher,
          edition: data.edition,
          category: data.category,
          description: data.description,
          coverImage: data.images[0]?.url || null,
        },
      });
    }

    const listing = await prisma.listing.create({
      data: {
        sellerId,
        bookId: book.id,
        askingPrice: data.askingPrice,
        minimumOfferPrice: data.minimumOfferPrice,
        condition: data.condition,
        conditionDetails: typeof data.conditionDetails === 'string' ? data.conditionDetails : JSON.stringify(data.conditionDetails),
        status: 'ACTIVE',
        images: {
          create: data.images.map((img, idx) => ({
            url: img.url,
            altText: img.altText || `${data.title} Image ${idx + 1}`,
            isPrimary: img.isPrimary || idx === 0,
            displayOrder: idx,
          })),
        },
      },
      include: {
        book: true,
        images: true,
      },
    });

    return listing;
  }

  async updateListingStatus(sellerId: string, listingId: string, status: 'ACTIVE' | 'PAUSED' | 'DELETED') {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing not found');

    if (listing.sellerId !== sellerId) {
      throw new ForbiddenError('You can only update your own listings');
    }

    if (listing.status === 'SOLD') {
      throw new AppError('Cannot update status of a sold listing');
    }

    return await prisma.listing.update({
      where: { id: listingId },
      data: { status },
    });
  }

  async getSellerListings(sellerId: string) {
    return await prisma.listing.findMany({
      where: { sellerId, status: { not: 'DELETED' } },
      include: {
        book: true,
        images: true,
        offers: {
          where: { status: 'PENDING' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCategories() {
    return [
      'Engineering',
      'Programming',
      'Competitive Exams',
      'School',
      'College',
      'Novels',
      'Fiction',
      'Non-Fiction',
      'Business',
      'Self Help',
    ];
  }
}

export const bookService = new BookService();
