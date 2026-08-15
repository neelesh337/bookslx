import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { auth } from '../config/firebase';import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  applyActionCode,
  checkActionCode,
  signOut,
  sendPasswordResetEmail,
  confirmPasswordReset,
  signInWithEmailAndPassword
} from 'firebase/auth';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'USER' | 'ADMIN';
  rating: number;
  totalSales: number;
  totalPurchases: number;
  profileImage?: string;
  addresses?: any[];
  emailVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  pendingVerificationEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerificationEmail: (email?: string, password?: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (oobCode: string, email: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PENDING_EMAIL_KEY = 'pendingVerificationEmail';
const PENDING_UID_KEY = 'pendingVerificationFirebaseUid';

/**
 * Thrown by `login` when the account exists but its email has not been verified
 * yet. The login page shows the verification screen with a resend option.
 */
export class EmailNotVerifiedError extends Error {
  email: string;
  constructor(email: string) {
    super('EMAIL_NOT_VERIFIED');
    this.name = 'EmailNotVerifiedError';
    this.email = email;
  }
}

/**
 * Thrown by `verifyEmail` when Firebase confirmed the email but the local login
 * could not be completed (e.g., the link was opened in a browser without the
 * pending verification data). The user should sign in — `login` will detect the
 * verified account and finish the job.
 */
export class VerificationCompleteError extends Error {
  email: string;
  constructor(email: string) {
    super('VERIFICATION_COMPLETE');
    this.name = 'VerificationCompleteError';
    this.email = email;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  const fetchCurrentUser = async () => {
    try {
      const res: any = await api.get('/auth/me');
      setUser(res.data);
    } catch (err) {
      setUser(null);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();

    // Check for pending verification email from localStorage
    const pending = localStorage.getItem(PENDING_EMAIL_KEY);
    if (pending) {
      setPendingVerificationEmail(pending);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res: any = await api.post('/auth/login', { email, password });
      if (res.data?.token) {
        localStorage.setItem('token', res.data.token);
      }
      setUser(res.data?.user);
    } catch (err: any) {
      if (err.status === 401) {
        throw new Error('Invalid email or password.');
      }
      if (err.status === 403) {
        // The local record still says the email is unverified. The user may have
        // verified it in another browser/device (or the local flag is stale), so
        // ask Firebase — it is the source of truth for email verification.
        if (auth) {
          try {
            const firebaseUser = (await signInWithEmailAndPassword(auth, email, password)).user;
            localStorage.setItem(PENDING_EMAIL_KEY, email);
            localStorage.setItem(PENDING_UID_KEY, firebaseUser.uid);

            if (firebaseUser.emailVerified) {
              // Verified in Firebase — complete the local verification and log in.
              const loginRes: any = await api.post('/auth/login-verified', {
                email,
                firebaseUid: firebaseUser.uid,
              });
              if (loginRes.data?.token) {
                localStorage.setItem('token', loginRes.data.token);
              }
              setUser(loginRes.data?.user);
              localStorage.removeItem(PENDING_EMAIL_KEY);
              localStorage.removeItem(PENDING_UID_KEY);
              setPendingVerificationEmail(null);
              return;
            }
          } catch (firebaseErr: any) {
            if (firebaseErr && typeof firebaseErr.status === 'number') {
              // A backend call failed (e.g., /auth/login-verified) — surface it.
              throw new Error(firebaseErr.message || 'Login failed. Please try again.');
            }
            // Firebase unreachable or the credentials don't match the Firebase
            // account — fall through to the unverified prompt below.
            console.warn(
              'Could not check verification status with Firebase:',
              firebaseErr?.code || firebaseErr?.message
            );
          }
        }

        localStorage.setItem(PENDING_EMAIL_KEY, email);
        setPendingVerificationEmail(email);
        throw new EmailNotVerifiedError(email);
      }
      throw new Error(err.message || 'Login failed. Please try again.');
    }
  };

  const register = async (data: any) => {
    let firebaseUid: string | undefined;

    // Try Firebase first (email-verification flow). If Firebase is missing or
    // rejects the signup, fall back to backend-only password registration so the
    // account is still created and immediately usable.
    if (auth) {
      try {
        const firebaseUser = await createUserWithEmailAndPassword(auth, data.email, data.password);
        firebaseUid = firebaseUser.user.uid;

        try {
          await sendEmailVerification(firebaseUser.user, {
            url: `${window.location.origin}/verify-email`,
            handleCodeInApp: true,
          });
        } catch (e) {
          console.error('Failed to send verification email:', e);
        }
      } catch (err: any) {
        // Handle Firebase specific errors
        if (err.code) {
          switch (err.code) {
            case 'auth/email-already-in-use':
              throw new Error('Email is already registered. Please sign in instead.');
            case 'auth/weak-password':
              throw new Error('Password should be at least 6 characters.');
            case 'auth/invalid-email':
              throw new Error('Invalid email address.');
            default:
              // Unknown Firebase error — fall through to backend-only signup so
              // registration still works when Firebase is misconfigured.
              console.warn('Firebase signup unavailable, falling back to backend-only registration:', err.message || err.code);
          }
        }
      }
    }

    // Register the account in the backend (password + optional firebaseUid).
    const res: any = await api.post('/auth/register', {
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password,
      firebaseUid,
    });

    if (firebaseUid) {
      // Email verification required before first login
      localStorage.setItem(PENDING_EMAIL_KEY, data.email);
      localStorage.setItem(PENDING_UID_KEY, firebaseUid);
      setPendingVerificationEmail(data.email);
      throw new Error('VERIFICATION_REQUIRED');
    }

    // Backend-only signup — session created immediately
    if (res.data?.token) {
      localStorage.setItem('token', res.data.token);
    }
    setUser(res.data?.user);
  };

  const verifyEmail = async (code: string) => {
    try {
      if (!auth) {
        throw new Error('Firebase is not configured.');
      }

      if (!code) {
        throw new Error('Invalid verification code.');
      }

      // Recover the verified email from the action code itself so verification
      // works even when the link is opened in a browser without local state
      // (e.g., a different device). checkActionCode must run before
      // applyActionCode consumes the code.
      let email = pendingVerificationEmail || localStorage.getItem(PENDING_EMAIL_KEY);
      if (!email) {
        try {
          const info = await checkActionCode(auth, code);
          email = info.data.email || null;
        } catch {
          // Ignore — applyActionCode below will surface invalid codes.
        }
      }

      await applyActionCode(auth, code);

      const uid = localStorage.getItem(PENDING_UID_KEY);

      if (email && uid) {
        const loginRes: any = await api.post('/auth/login-verified', {
          email,
          firebaseUid: uid,
        });

        if (loginRes.data?.token) {
          localStorage.setItem('token', loginRes.data.token);
        }

        setUser(loginRes.data?.user);
        localStorage.removeItem(PENDING_EMAIL_KEY);
        localStorage.removeItem(PENDING_UID_KEY);
        setPendingVerificationEmail(null);
      } else if (email) {
        // Firebase confirmed the email, but the Firebase UID isn't available here
        // (link opened on a new device). The user can now sign in — the login
        // flow detects the verified account and completes verification.
        localStorage.setItem(PENDING_EMAIL_KEY, email);
        setPendingVerificationEmail(email);
        throw new VerificationCompleteError(email);
      } else {
        throw new Error('Unable to complete verification — missing account details. Please sign in.');
      }
    } catch (err: any) {
      if (err instanceof VerificationCompleteError) {
        throw err;
      }
      if (err.code === 'auth/invalid-action-code') {
        throw new Error('Verification link has expired. Please request a new one.');
      }
      if (err.code === 'auth/user-disabled') {
        throw new Error('This account has been disabled.');
      }
      throw new Error(err.message || 'Email verification failed. Please try again.');
    }
  };

  const resendVerificationEmail = async (email?: string, password?: string) => {
    try {
      if (!auth) {
        throw new Error('Firebase is not configured.');
      }

      let firebaseUser = auth.currentUser;

      // No session exists (e.g., resending from the login page after a failed
      // login) — sign in with the provided credentials to reach the account.
      if (!firebaseUser && email && password) {
        firebaseUser = (await signInWithEmailAndPassword(auth, email, password)).user;
      }

      if (firebaseUser) {
        // Remember the pending verification data so the verification page can
        // complete the login automatically after the user clicks the link.
        if (email) {
          localStorage.setItem(PENDING_EMAIL_KEY, email);
        }
        localStorage.setItem(PENDING_UID_KEY, firebaseUser.uid);
        setPendingVerificationEmail(email || pendingVerificationEmail);

        await sendEmailVerification(firebaseUser, {
          url: `${window.location.origin}/verify-email`,
          handleCodeInApp: true,
        });
      } else {
        throw new Error('No user found for verification.');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Failed to resend verification email.');
    }
  };

  /** Sends a Firebase password-reset email. The link opens /reset-password in-app. */
  const forgotPassword = async (email: string) => {
    if (!auth) {
      throw new Error('Firebase is not configured.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }

    // Remember the email so the reset page can pre-fill it.
    localStorage.setItem('pendingResetEmail', email);

    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/reset-password`,
      handleCodeInApp: true,
    });
  };

  /**
   * Completes the Firebase password reset (oobCode from the emailed link), then
   * syncs the new password hash into the backend so password login keeps working.
   */
  const resetPassword = async (oobCode: string, email: string, newPassword: string) => {
    if (!auth) {
      throw new Error('Firebase is not configured.');
    }
    if (!oobCode) {
      throw new Error('This reset link is invalid or expired.');
    }

    // 1. Firebase confirms the new password using the action code from the link.
    await confirmPasswordReset(auth, oobCode, newPassword);

    // 2. Sign in with the fresh password to recover the Firebase UID (works even
    //    when the link was opened in a browser without local state), then sync the
    //    backend hash.
    const firebaseUser = await signInWithEmailAndPassword(auth, email, newPassword);
    await api.post('/auth/reset-password', {
      email,
      newPassword,
      firebaseUid: firebaseUser.user.uid,
    });

    localStorage.removeItem('pendingResetEmail');
  };

  const logout = async () => {
    try {
      // Sign out from Firebase if configured
      if (auth) {
        try {
          await signOut(auth);
        } catch (firebaseError) {
          console.error('Firebase signOut error:', firebaseError);
          // Continue with logout even if Firebase fails
        }
      }

      // Sign out from backend
      try {
        await api.post('/auth/logout');
      } catch (e) {
        console.error('Backend logout error:', e);
        // Continue with local cleanup even if backend fails
      }
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      // Always clear local state
      localStorage.removeItem('token');
      localStorage.removeItem(PENDING_EMAIL_KEY);
      localStorage.removeItem(PENDING_UID_KEY);
      setUser(null);
      setPendingVerificationEmail(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pendingVerificationEmail,
        login,
        register,
        logout,
        refreshUser: fetchCurrentUser,
        verifyEmail,
        resendVerificationEmail,
        forgotPassword,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
