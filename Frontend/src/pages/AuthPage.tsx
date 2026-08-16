import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, AlertCircle, Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';

const GoogleLogo: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const AuthPage: React.FC = () => {
  const { login, loginWithGoogle, register, pendingVerificationEmail, resendVerificationEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isSignupPage = location.pathname === '/signup';
  const [isSignup, setIsSignup] = useState(isSignupPage);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [verificationSent, setVerificationSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Valid email is required';
    }

    if (!formData.password || formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (isSignup) {
      if (!formData.name || formData.name.trim().length < 2) {
        errors.name = 'Full name is required';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        await register({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
        });
        // register resolves without VERIFICATION_REQUIRED only for backend-only
        // signups, which are immediately logged in.
        navigate('/');
      } else {
        await login(formData.email, formData.password);
        navigate('/');
      }
    } catch (err: any) {
      if (err.message === 'VERIFICATION_REQUIRED' || err.message === 'EMAIL_NOT_VERIFIED') {
        setVerificationSent(true);
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err: any) {
      // User closed the popup or a new request superseded it — nothing to show.
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.code === 'auth/popup-closed'
      ) {
        return;
      }
      if (err?.code === 'auth/account-exists-with-different-credential') {
        setError('An account already exists with this email. Please sign in with your email and password.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Google sign-in popup was blocked. Please allow popups for this site and try again.');
      } else if (err?.status === 409) {
        setError(err.message || 'An account with this email already exists. Please sign in with your email and password.');
      } else {
        setError(err?.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    setResendSuccess(false);
    setError('');

    try {
      // Pass the entered credentials so the email can be re-sent even when the
      // Firebase session from signup is gone (e.g., resending after a login).
      await resendVerificationEmail(formData.email, formData.password);
      setResendSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-obsidian dark:to-graphite flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {verificationSent ? (
          // Email Verification Screen
          <div className="rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-2xl p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-gold/20 to-amber-200/20 border border-gold/30 flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8 text-gold" />
              </div>
              <h2 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
                Verify Your Email
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                We sent a verification link to:
              </p>
              <p className="font-bold text-gold">{pendingVerificationEmail}</p>
            </div>

            {resendSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-green-700 dark:text-green-200">
                  Verification email sent! Check your inbox.
                </p>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Check these steps:</p>
              <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 font-bold mt-0.5">✓</span>
                  <span>Check your email inbox</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 font-bold mt-0.5">✓</span>
                  <span>Look in spam/promotions folder</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 font-bold mt-0.5">✓</span>
                  <span>Click the verification link</span>
                </li>
              </ul>
            </div>

            <button
              onClick={handleResendVerification}
              disabled={resendLoading}
              className="w-full py-3 rounded-xl font-bold text-sm bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-ivory hover:bg-slate-300 dark:hover:bg-slate-600 transition disabled:opacity-50"
            >
              {resendLoading ? 'Sending...' : 'Resend Verification Email'}
            </button>

            <button
              onClick={() => {
                setVerificationSent(false);
                setFormData({ name: '', email: '', phone: '', password: '' });
                setError('');
              }}
              className="w-full py-3 rounded-xl font-bold text-sm bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-ivory hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              Back to Login
            </button>

            <p className="text-xs text-center text-slate-500">
              Didn't receive the email? Check your spam folder or resend it above.
            </p>
          </div>
        ) : (
          // Login/Signup Form
          <div className="rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-2xl p-8 space-y-6">
            {/* Header */}
            <div className="text-center space-y-3 pb-2">
              <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-gold/20 to-amber-200/20 border border-gold/30 flex items-center justify-center mx-auto">
                <BookOpen className="w-7 h-7 text-gold" />
              </div>
              <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
                {isSignup ? 'Create Account' : 'Welcome Back'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {isSignup
                  ? 'Join the peer-to-peer book community'
                  : 'Sign in to your BooksLX account'}
              </p>
            </div>

            {/* Tabs for Login/Signup */}
            <div className="flex gap-2 bg-slate-100 dark:bg-obsidian/50 p-1 rounded-xl">
              <button
                onClick={() => {
                  setIsSignup(false);
                  setError('');
                  setFieldErrors({});
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold text-xs transition ${
                  !isSignup
                    ? 'bg-white dark:bg-graphite text-slate-900 dark:text-ivory shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setIsSignup(true);
                  setError('');
                  setFieldErrors({});
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold text-xs transition ${
                  isSignup
                    ? 'bg-white dark:bg-graphite text-slate-900 dark:text-ivory shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Google Sign-In */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian text-slate-700 dark:text-ivory font-bold text-sm hover:bg-slate-50 dark:hover:bg-graphite hover:border-slate-300 dark:hover:border-slate-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <GoogleLogo />
                )}
                <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  or
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-red-900 dark:text-red-200 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Field - Signup Only */}
              {isSignup && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-obsidian border-2 transition text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none ${
                        fieldErrors.name
                          ? 'border-red-500 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700 focus:border-gold dark:focus:border-gold'
                      }`}
                    />
                  </div>
                  {fieldErrors.name && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>
                  )}
                </div>
              )}

              {/* Email Field */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-obsidian border-2 transition text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none ${
                      fieldErrors.email
                        ? 'border-red-500 dark:border-red-500'
                        : 'border-slate-200 dark:border-slate-700 focus:border-gold dark:focus:border-gold'
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Phone Field - Signup Only */}
              {isSignup && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs">
                    Phone Number (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="9876543210"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-obsidian border-2 border-slate-200 dark:border-slate-700 transition text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none focus:border-gold dark:focus:border-gold"
                    />
                  </div>
                </div>
              )}

              {/* Password Field */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    className={`w-full pl-11 pr-12 py-3 rounded-xl bg-slate-50 dark:bg-obsidian border-2 transition text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none ${
                      fieldErrors.password
                        ? 'border-red-500 dark:border-red-500'
                        : 'border-slate-200 dark:border-slate-700 focus:border-gold dark:focus:border-gold'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-gold to-amber-400 text-obsidian hover:from-amber-400 hover:to-yellow-400 shadow-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <span className="w-4 h-4 border-2 border-obsidian border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </span>
                ) : isSignup ? (
                  'Create Account'
                ) : (
                  'Sign In'
                )}
              </button>

              {/* Password Help - Login Only */}
              {!isSignup && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="text-xs text-slate-600 dark:text-slate-400 hover:text-gold transition"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </form>

            {/* Privacy Info - Signup Only */}
            {isSignup && (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                By signing up, you agree to our Terms of Service and Privacy Policy
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
