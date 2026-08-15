import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required', 'AUTH_REQUIRED'));
  }

  if (req.user.role !== 'ADMIN') {
    return next(new ForbiddenError('Admin privileges required', 'ADMIN_ONLY'));
  }

  next();
};
