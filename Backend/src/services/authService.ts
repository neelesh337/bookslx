import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors';

export type Role = 'USER' | 'ADMIN';

export class AuthService {
  /**
   * Registers a new user. Two supported paths:
   *
   * 1. `password` provided (no `firebaseUid`) — classic backend-only signup.
   *    The account is immediately usable and a token is returned.
   *
   * 2. `firebaseUid` provided — the account was created in Firebase and an
   *    email-verification link was sent. The user record is created with
   *    `emailVerified: false` and NO token is returned; the user must click the
   *    verification link, after which `/auth/login-verified` issues a token.
   *    The `password` (if also provided) is still hashed so later password
   *    logins work after verification.
   */
  async register(data: { name: string; email: string; phone?: string; password?: string; role?: Role; firebaseUid?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictError('User with this email already exists', 'EMAIL_IN_USE');
    }

    const requiresVerification = !!data.firebaseUid;

    // Firebase signups may arrive without a password; store an unguessable
    // placeholder hash so the column is never null and password logins stay locked
    // until the user verifies (password logins are only meaningful when a real
    // password was provided).
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 10)
      : await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash,
        role: data.role || 'USER',
        firebaseUid: data.firebaseUid || null,
        emailVerified: !requiresVerification, // backend-only signups are self-verified
        verifiedAt: !requiresVerification ? new Date() : null,
      },
    });

    const token = requiresVerification
      ? null
      : this.generateToken(user.id, user.name, user.email, user.role as Role);

    return {
      user: this.serializeUser(user),
      token,
      requiresVerification,
    };
  }

  async login(data: { email: string; password: string }) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Only Firebase-verified accounts must confirm their email before logging in.
    // Backend-only (and legacy/seeded) accounts carry no firebaseUid and are
    // immediately usable.
    if (user.firebaseUid && !user.emailVerified) {
      throw new ForbiddenError(
        'Email not verified. Please check your inbox for the verification link.',
        'EMAIL_NOT_VERIFIED'
      );
    }

    const token = this.generateToken(user.id, user.name, user.email, user.role as Role);

    return {
      user: this.serializeUser(user),
      token,
    };
  }

  /**
   * Completes a Google sign-in. The frontend has already obtained the Google
   * identity via Firebase (`signInWithPopup`) and passes the verified profile
   * here. Three cases:
   *
   * 1. The `firebaseUid` is already linked to a local account — log in.
   * 2. The email matches a local account without a Firebase UID (legacy /
   *    backend-only signup) — link the Google identity and log in. Google has
   *    verified the email, so the account also becomes verified.
   * 3. No local account — create one (email is Google-verified, so no
   *    email-verification step is needed) and log in.
   */
  async googleLogin(data: {
    firebaseUid: string;
    email: string;
    name?: string;
    profileImage?: string;
  }) {
    if (!data.firebaseUid || !data.email) {
      throw new AppError('Missing required fields for Google sign-in', 400, 'INVALID_GOOGLE_PAYLOAD');
    }
    const email = data.email.toLowerCase();
    const name = data.name && data.name.trim() ? data.name.trim() : undefined;
    const profileImage = data.profileImage || undefined;

    // Case 1: the Google identity is already linked to a local account.
    let user = await prisma.user.findUnique({ where: { firebaseUid: data.firebaseUid } });
    if (user) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          profileImage: profileImage || user.profileImage,
          emailVerified: true,
          verifiedAt: user.verifiedAt || new Date(),
        },
      });

      return {
        user: this.serializeUser(updated),
        token: this.generateToken(updated.id, updated.name, updated.email, updated.role as Role),
      };
    }

    // Case 2: the email exists but belongs to a different Firebase account.
    user = await prisma.user.findUnique({ where: { email } });
    if (user && user.firebaseUid && user.firebaseUid !== data.firebaseUid) {
      throw new ConflictError(
        'An account with this email already exists. Please sign in with your email and password.',
        'EMAIL_IN_USE'
      );
    }

    // Case 2b: legacy / backend-only account — link the Google identity.
    if (user) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: data.firebaseUid,
          name: name || user.name,
          profileImage: profileImage || user.profileImage,
          emailVerified: true,
          verifiedAt: new Date(),
        },
      });

      return {
        user: this.serializeUser(updated),
        token: this.generateToken(updated.id, updated.name, updated.email, updated.role as Role),
      };
    }

    // Case 3: brand-new Google user — create a verified account. The password
    // column gets an unguessable placeholder hash so it is never null.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const created = await prisma.user.create({
      data: {
        name: name || email.split('@')[0] || 'User',
        email,
        passwordHash,
        profileImage: profileImage || null,
        firebaseUid: data.firebaseUid,
        emailVerified: true,
        verifiedAt: new Date(),
      },
    });

    return {
      user: this.serializeUser(created),
      token: this.generateToken(created.id, created.name, created.email, created.role as Role),
    };
  }

  /**
   * Completes the Firebase email-verification login. Called by the frontend after
   * `applyActionCode` succeeds. Marks the account verified and issues a token.
   */
  async loginVerified(data: { email: string; firebaseUid: string }) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new NotFoundError('User not found for this email');
    }

    if (user.firebaseUid && user.firebaseUid !== data.firebaseUid) {
      throw new UnauthorizedError('Firebase account does not match this user', 'INVALID_CREDENTIALS');
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        firebaseUid: user.firebaseUid || data.firebaseUid,
        emailVerified: true,
        verifiedAt: new Date(),
      },
    });

    const token = this.generateToken(updatedUser.id, updatedUser.name, updatedUser.email, updatedUser.role as Role);

    return {
      user: this.serializeUser(updatedUser),
      token,
    };
  }

  /**
   * Syncs a password reset performed in Firebase back into the local user record.
   *
   * Firebase owns the actual password reset (the user clicks the emailed link and
   * Firebase confirms the new password). This endpoint re-hashes the same new
   * password locally so `/auth/login` keeps working afterwards.
   *
   * The caller must prove they own the Firebase account by supplying the account's
   * `firebaseUid` (a long, unguessable Firebase identifier — the same trust level
   * used by `/auth/login-verified`). Accounts without a Firebase UID (legacy /
   * backend-only signups) cannot use this flow.
   */
  async resetPassword(data: { email: string; newPassword: string; firebaseUid: string }) {
    if (!data.newPassword || data.newPassword.length < 6) {
      throw new AppError('Password must be at least 6 characters', 400, 'WEAK_PASSWORD');
    }

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new NotFoundError('User not found for this email');
    }

    if (!user.firebaseUid) {
      throw new AppError(
        'Password reset is only available for Firebase-registered accounts',
        400,
        'RESET_UNAVAILABLE'
      );
    }

    if (!data.firebaseUid || user.firebaseUid !== data.firebaseUid) {
      throw new ForbiddenError('Password reset verification failed', 'RESET_UNAUTHORIZED');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return { success: true };
  }

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      ...this.serializeUser(user),
      addresses: user.addresses,
    };
  }

  async addAddress(userId: string, addressData: any) {
    // The Address model requires these fields — reject incomplete submissions
    // with a clear 400 instead of letting Prisma fail with a 500.
    const requiredFields = ['name', 'phone', 'line1', 'city', 'state', 'postalCode'];
    for (const field of requiredFields) {
      if (!addressData[field] || !String(addressData[field]).trim()) {
        throw new AppError(`Address field "${field}" is required`, 400, 'INVALID_ADDRESS');
      }
    }

    if (addressData.isDefault) {
      await prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    if (addressData.isPickupAddress) {
      await prisma.address.updateMany({
        where: { userId },
        data: { isPickupAddress: false },
      });
    }

    return await prisma.address.create({
      data: {
        ...addressData,
        userId,
      },
    });
  }

  async getUserAddresses(userId: string) {
    return await prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });
  }

  private serializeUser(user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    rating: number;
    totalSales: number;
    totalPurchases: number;
    profileImage: string | null;
    emailVerified: boolean;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      rating: user.rating,
      totalSales: user.totalSales,
      totalPurchases: user.totalPurchases,
      profileImage: user.profileImage,
      emailVerified: user.emailVerified,
    };
  }

  private generateToken(id: string, name: string, email: string, role: Role): string {
    return jwt.sign({ id, name, email, role }, env.JWT_SECRET, {
      expiresIn: '7d',
    });
  }
}

export const authService = new AuthService();
