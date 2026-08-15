import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { UnauthorizedError } from '../utils/errors';
import { AuthUser } from '../types/express';

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token missing', 'TOKEN_MISSING');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;

    // A token can be validly signed yet reference a user that no longer exists
    // (e.g. after a reseed wipes users). Reject those here so downstream writes
    // fail with a clean 401 instead of confusing foreign-key constraint errors.
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedError('Account no longer exists. Please sign in again.', 'TOKEN_INVALID');
    }

    req.user = user as AuthUser;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid or expired token', 'TOKEN_INVALID'));
    } else {
      next(error);
    }
  }
};
