import { Request, Response, NextFunction } from 'express';
import { bookService } from '../services/bookService';

export class BookController {
  async searchListings(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        query,
        category,
        condition,
        minPrice,
        maxPrice,
        minRating,
        sortBy,
        page,
        limit,
      } = req.query;

      const result = await bookService.searchListings({
        query: query as string,
        category: category as string,
        condition: condition as any,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        minRating: minRating ? Number(minRating) : undefined,
        sortBy: sortBy as any,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 12,
      });

      return res.json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getListingDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await bookService.getListingDetails(id);
      return res.json({
        success: true,
        data: result.listing,
        similarListings: result.similarListings,
      });
    } catch (error) {
      next(error);
    }
  }

  async createListing(req: Request, res: Response, next: NextFunction) {
    try {
      const sellerId = req.user!.id;
      const listing = await bookService.createListing(sellerId, req.body);
      return res.status(201).json({
        success: true,
        message: 'Listing created successfully',
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateListingStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const sellerId = req.user!.id;
      const { id } = req.params;
      const { status } = req.body;
      const listing = await bookService.updateListingStatus(sellerId, id, status);
      return res.json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSellerListings(req: Request, res: Response, next: NextFunction) {
    try {
      const sellerId = req.user!.id;
      const listings = await bookService.getSellerListings(sellerId);
      return res.json({
        success: true,
        data: listings,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await bookService.getCategories();
      return res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const bookController = new BookController();
