import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, KeyRound, AlertCircle, CheckCircle, ArrowLeft, Send } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldError('');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('A valid email address is required');
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      // Never reveal whether an account exists (anti-enumeration). Firebase throws
      // user-not-found when there is no account; surface a generic message instead.
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setSent(true);
      } else {
        setError(err.message || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-obsidian dark:to-graphite flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-2xl p-8 space-y-6">
          {sent ? (
            /* Success screen */
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-emerald-200/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h2 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory">
                  Reset Link Sent
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  If an account exists for <strong className="text-gold">{email}</strong>, we've sent a
                  password reset link to your inbox.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-1.5 text-left">
                <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Next steps:</p>
                <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-500 font-bold">✓</span>
                    <span>Check your inbox (and the spam / promotions folder)</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-500 font-bold">✓</span>
                    <span>Click the link and choose a new password</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-500 font-bold">✓</span>
                    <span>Sign in with your new password</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col space-y-2">
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-ivory hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                >
                  Resend to a different email
                </button>
                <Link
                  to="/login"
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gold text-obsidian hover:bg-amber-400 transition text-center"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          ) : (
            /* Request form */
            <div className="space-y-6">
              <div className="text-center space-y-3 pb-1">
                <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-gold/20 to-amber-200/20 border border-gold/30 flex items-center justify-center mx-auto">
                  <KeyRound className="w-7 h-7 text-gold" />
                </div>
                <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
                  Forgot Your Password?
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Enter your account email and we'll send you a secure link to reset your password.
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
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldError) setFieldError('');
                      }}
                      className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-obsidian border-2 transition text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none ${
                        fieldError
                          ? 'border-red-500 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700 focus:border-gold dark:focus:border-gold'
                      }`}
                    />
                  </div>
                  {fieldError && <p className="text-xs text-red-500 mt-1">{fieldError}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-gold to-amber-400 text-obsidian hover:from-amber-400 hover:to-yellow-400 shadow-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center space-x-2">
                      <span className="w-4 h-4 border-2 border-obsidian border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Reset Link</span>
                    </>
                  )}
                </button>
              </form>

              <Link
                to="/login"
                className="flex items-center justify-center space-x-2 text-xs text-slate-600 dark:text-slate-400 hover:text-gold transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Login</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
