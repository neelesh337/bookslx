import React, { useState, useEffect } from 'react';
import { useAuth, VerificationCompleteError } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Loader, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

export const EmailVerificationPage: React.FC = () => {
  const { verifyEmail, resendVerificationEmail, pendingVerificationEmail } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [verifiedNeedSignIn, setVerifiedNeedSignIn] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Check if there's a verification code in the URL (from email link)
  const verificationCode = searchParams.get('oobCode');

  useEffect(() => {
    if (verificationCode) {
      handleVerifyFromLink();
    }
  }, [verificationCode]);

  const handleVerifyFromLink = async () => {
    if (!verificationCode) return;
    
    setLoading(true);
    setError('');
    
    try {
      await verifyEmail(verificationCode);
      setSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err: any) {
      if (err instanceof VerificationCompleteError) {
        // Firebase confirmed the email, but the login couldn't be completed here
        // (e.g., the link was opened in a browser without the pending data). The
        // login flow will detect the verified account and finish verification.
        setVerifiedNeedSignIn(true);
      } else {
        setError(err.message || 'Verification failed. Please try again.');
      }
      console.error('Email verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setResendLoading(true);
    setError('');
    setResendSuccess(false);

    try {
      await resendVerificationEmail();
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend email. Please try again.');
      console.error('Resend verification email error:', err);
    } finally {
      setResendLoading(false);
    }
  };

  if (loading && verificationCode) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="p-8 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-premium space-y-6 text-center">
          <Loader className="w-12 h-12 text-gold animate-spin mx-auto" />
          <p className="text-slate-600 dark:text-slate-300">Verifying your email...</p>
        </div>
      </div>
    );
  }

  if (success && verificationCode) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="p-8 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-premium space-y-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory mb-2">
              Email Verified!
            </h1>
            <p className="text-xs text-slate-500">Redirecting to home page...</p>
          </div>
        </div>
      </div>
    );
  }

  if (verifiedNeedSignIn && verificationCode) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="p-8 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-premium space-y-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <div className="space-y-2">
            <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory mb-2">
              Email Verified!
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your email has been confirmed. You can now sign in to your account.
            </p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-gold to-amber-400 text-obsidian hover:from-amber-400 hover:to-yellow-400 shadow-lg transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="p-8 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-premium space-y-6">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center space-x-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Login</span>
        </button>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gold/10 text-gold border border-gold/30 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6" />
          </div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory">
            Verify Your Email
          </h1>
          <p className="text-xs text-slate-500">
            {pendingVerificationEmail ? `We've sent a verification link to ${pendingVerificationEmail}` : 'Check your email for verification link'}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-brandError/10 border border-brandError/30 text-brandError text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resendSuccess && (
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-600 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Verification email resent successfully!</span>
          </div>
        )}

        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-obsidian/50 border border-slate-200 dark:border-slate-800">
            <p className="font-bold text-slate-900 dark:text-ivory mb-2">Next steps:</p>
            <ol className="space-y-2 text-slate-600 dark:text-slate-300 list-decimal list-inside">
              <li>Check your email inbox (and spam folder)</li>
              <li>Click the verification link</li>
              <li>Your email will be confirmed automatically</li>
            </ol>
          </div>

          <button
            onClick={handleResendEmail}
            disabled={resendLoading}
            className="w-full py-3 rounded-xl font-bold text-xs bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-ivory hover:bg-slate-300 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            {resendLoading ? 'Sending...' : 'Resend Verification Email'}
          </button>
        </div>

        <p className="text-xs text-center text-slate-500">
          Having trouble? Make sure to check your spam folder or try resending the email
        </p>
      </div>
    </div>
  );
};
