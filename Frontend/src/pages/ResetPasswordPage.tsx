import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KeyRound, AlertCircle, CheckCircle, Eye, EyeOff, Lock, Mail, ArrowLeft } from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(() => localStorage.getItem('pendingResetEmail') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'A valid email address is required';
    }
    if (!password || password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    if (confirmPassword !== password) {
      errors.confirm = 'Passwords do not match';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setLoading(true);
    try {
      await resetPassword(oobCode, email.trim(), password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      if (err.code === 'auth/invalid-action-code' || err.code === 'auth/expired-action-code') {
        setError('This reset link is invalid or has expired. Please request a new one.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account matches this email. Please check and try again.');
      } else {
        setError(err.message || 'Password reset failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!oobCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-obsidian dark:to-graphite flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-2xl p-8 space-y-5 text-center">
          <div className="w-14 h-14 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-rose-500" />
          </div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory">
            Invalid Reset Link
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This link is missing the reset code — it may be broken or truncated.
          </p>
          <Link
            to="/forgot-password"
            className="block w-full py-3 rounded-xl font-bold text-sm bg-gold text-obsidian hover:bg-amber-400 transition"
          >
            Request a New Reset Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-obsidian dark:to-graphite flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-2xl p-8 space-y-6">
          {success ? (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-emerald-200/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h2 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory">
                  Password Updated!
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Your password has been changed successfully. Redirecting you to sign in...
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center space-y-3 pb-1">
                <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-gold/20 to-amber-200/20 border border-gold/30 flex items-center justify-center mx-auto">
                  <KeyRound className="w-7 h-7 text-gold" />
                </div>
                <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
                  Set a New Password
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Choose a new password for your BooksLX account.
                </p>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="font-bold text-red-900 dark:text-red-200 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs">
                    Account Email *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' });
                      }}
                      className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-obsidian border-2 transition text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none ${
                        fieldErrors.email
                          ? 'border-red-500 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700 focus:border-gold dark:focus:border-gold'
                      }`}
                    />
                  </div>
                  {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs">
                    New Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: '' });
                      }}
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
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2 text-xs">
                    Confirm New Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Re-enter your new password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (fieldErrors.confirm) setFieldErrors({ ...fieldErrors, confirm: '' });
                      }}
                      className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-obsidian border-2 transition text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none ${
                        fieldErrors.confirm
                          ? 'border-red-500 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700 focus:border-gold dark:focus:border-gold'
                      }`}
                    />
                  </div>
                  {fieldErrors.confirm && <p className="text-xs text-red-500 mt-1">{fieldErrors.confirm}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-gold to-amber-400 text-obsidian hover:from-amber-400 hover:to-yellow-400 shadow-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center space-x-2">
                      <span className="w-4 h-4 border-2 border-obsidian border-t-transparent rounded-full animate-spin" />
                      <span>Updating...</span>
                    </span>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </form>

              <Link
                to="/forgot-password"
                className="flex items-center justify-center space-x-2 text-xs text-slate-600 dark:text-slate-400 hover:text-gold transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Request a new reset link</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
