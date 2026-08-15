import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/config/db';
import { authService } from '../../src/services/authService';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../src/utils/errors';
import { truncateAll, uid } from '../helpers';

const PASSWORD = 'secret123';
const FIREBASE_UID = 'FB_TEST_UID_12345';

describe('Auth registration & Firebase email verification', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });

  describe('register', () => {
    it('creates an immediately-usable account when only a password is provided', async () => {
      const result: any = await authService.register({
        name: 'Alice',
        email: 'alice@test.local',
        password: PASSWORD,
      });

      expect(result.requiresVerification).toBe(false);
      expect(result.token).toBeTruthy();
      expect(result.user.emailVerified).toBe(true);
      expect(result.user.role).toBe('USER');

      const saved = await prisma.user.findUnique({ where: { email: 'alice@test.local' } });
      expect(saved?.emailVerified).toBe(true);
      expect(saved?.verifiedAt).toBeTruthy();
      expect(saved?.firebaseUid).toBeNull();

      // The password is hashed properly — password login works immediately.
      await expect(authService.login({ email: 'alice@test.local', password: PASSWORD })).resolves.toBeTruthy();
    });

    it('creates an unverified account with NO token when a firebaseUid is supplied', async () => {
      const result: any = await authService.register({
        name: 'Bob',
        email: 'bob@test.local',
        password: PASSWORD,
        firebaseUid: FIREBASE_UID,
      });

      expect(result.requiresVerification).toBe(true);
      expect(result.token).toBeNull();
      expect(result.user.emailVerified).toBe(false);

      const saved = await prisma.user.findUnique({ where: { email: 'bob@test.local' } });
      expect(saved?.firebaseUid).toBe(FIREBASE_UID);
      expect(saved?.emailVerified).toBe(false);
      expect(saved?.verifiedAt).toBeNull();
    });

    it('creates the account when firebaseUid is given without a password (placeholder hash)', async () => {
      const result: any = await authService.register({
        name: 'Carol',
        email: 'carol@test.local',
        firebaseUid: FIREBASE_UID,
      });

      expect(result.requiresVerification).toBe(true);
      expect(result.token).toBeNull();
      expect(result.user.emailVerified).toBe(false);

      // The placeholder hash is unguessable — no password can authenticate.
      await expect(
        authService.login({ email: 'carol@test.local', password: PASSWORD })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('blocks registering the same email twice', async () => {
      await authService.register({ name: 'Alice', email: 'alice@test.local', password: PASSWORD });

      await expect(
        authService.register({ name: 'Alice 2', email: 'alice@test.local', password: 'other123' })
      ).rejects.toThrow(ConflictError);

      // A firebaseUid signup for the same email is rejected too.
      const err: any = await authService
        .register({ name: 'Alice 3', email: 'alice@test.local', firebaseUid: FIREBASE_UID })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.code).toBe('EMAIL_IN_USE');
    });
  });

  describe('login (email-verification gate)', () => {
    it('rejects password login for an unverified Firebase account with EMAIL_NOT_VERIFIED', async () => {
      await authService.register({
        name: 'Bob',
        email: 'bob@test.local',
        password: PASSWORD,
        firebaseUid: FIREBASE_UID,
      });

      const err: any = await authService
        .login({ email: 'bob@test.local', password: PASSWORD })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('still allows legacy/seeded accounts (no firebaseUid) to log in even if unverified', async () => {
      // Seeded demo users were created before email verification existed, so their
      // emailVerified flag defaults to false but they carry no firebaseUid.
      const user = await prisma.user.create({
        data: {
          name: 'Legacy',
          email: `${uid('legacy')}@test.local`,
          passwordHash: await bcrypt.hash(PASSWORD, 10),
          emailVerified: false,
        },
      });

      await expect(authService.login({ email: user.email, password: PASSWORD })).resolves.toBeTruthy();
    });
  });

  describe('loginVerified', () => {
    it('verifies the account, issues a token, and unlocks password login', async () => {
      await authService.register({
        name: 'Bob',
        email: 'bob@test.local',
        password: PASSWORD,
        firebaseUid: FIREBASE_UID,
      });

      const result: any = await authService.loginVerified({
        email: 'bob@test.local',
        firebaseUid: FIREBASE_UID,
      });

      expect(result.token).toBeTruthy();
      expect(result.user.emailVerified).toBe(true);

      const saved = await prisma.user.findUnique({ where: { email: 'bob@test.local' } });
      expect(saved?.emailVerified).toBe(true);
      expect(saved?.verifiedAt).toBeTruthy();

      // Normal password login now succeeds as well.
      await expect(authService.login({ email: 'bob@test.local', password: PASSWORD })).resolves.toBeTruthy();
    });

    it('rejects an unknown email', async () => {
      await expect(
        authService.loginVerified({ email: 'nobody@test.local', firebaseUid: FIREBASE_UID })
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects a firebaseUid that does not match the stored account', async () => {
      await authService.register({
        name: 'Bob',
        email: 'bob@test.local',
        password: PASSWORD,
        firebaseUid: FIREBASE_UID,
      });

      const err: any = await authService
        .loginVerified({ email: 'bob@test.local', firebaseUid: 'SOMEONE_ELSES_UID' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect(err.code).toBe('INVALID_CREDENTIALS');

      // The account stays unverified after a failed attempt.
      const saved = await prisma.user.findUnique({ where: { email: 'bob@test.local' } });
      expect(saved?.emailVerified).toBe(false);
    });

    it('attaches a firebaseUid to accounts that did not have one', async () => {
      await authService.register({ name: 'Dave', email: 'dave@test.local', password: PASSWORD });

      const result: any = await authService.loginVerified({
        email: 'dave@test.local',
        firebaseUid: FIREBASE_UID,
      });
      expect(result.token).toBeTruthy();

      const saved = await prisma.user.findUnique({ where: { email: 'dave@test.local' } });
      expect(saved?.firebaseUid).toBe(FIREBASE_UID);
      expect(saved?.emailVerified).toBe(true);
    });
  });
});
