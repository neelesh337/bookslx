import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { UnauthorizedError } from '../utils/errors';
import { AuthUser } from '../types/express';

async function resolveUserFromToken(token: string) {
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

  return user as AuthUser;
}

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

    req.user = await resolveUserFromToken(token);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid or expired token', 'TOKEN_INVALID'));
    } else {
      next(error);
    }
  }
};

/**
 * SSE (EventSource) cannot send Authorization headers, so the realtime stream
 * carries the token as a query parameter. Only the realtime route uses this —
 * every regular API route keeps requiring the header/cookie.
 */
export const authenticateSSE = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedError('Authentication token missing', 'TOKEN_MISSING');
    }

    req.user = await resolveUserFromToken(token);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid or expired token', 'TOKEN_INVALID'));
    } else {
      next(error);
    }
  }
};
