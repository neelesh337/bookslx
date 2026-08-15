import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { X, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface OfferModalProps {
  listing: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const OfferModal: React.FC<OfferModalProps> = ({ listing, isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offerPrice, setOfferPrice] = useState<number>(listing?.minimumOfferPrice || listing?.askingPrice * 0.8 || 0);
  const [message, setMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!isOpen || !listing) return null;

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    if (listing.sellerId === user.id) {
      setError('You cannot make an offer on your own listing.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res: any = await api.post('/offers', {
        listingId: listing.id,
        offerPrice: Number(offerPrice),
        message: message.trim() || undefined,
      });

      if (onSuccess) onSuccess();
      onClose();
      navigate(`/offers/${res.data.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit offer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-premium relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 rounded-2xl bg-gold/10 text-gold border border-gold/30">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Negotiate Book Price</h3>
            <p className="text-xs text-slate-500">Send an offer directly to seller {listing.seller?.name}</p>
          </div>
        </div>

        {/* Listing Summary */}
        <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-100 dark:bg-obsidian/60 mb-4 border border-slate-200 dark:border-slate-800">
          <img
            src={listing.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'}
            alt={listing.book?.title}
            className="w-12 h-14 object-cover rounded-lg"
          />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-slate-900 dark:text-ivory truncate">{listing.book?.title}</h4>
            <p className="text-[11px] text-slate-400 truncate">Condition: {listing.condition}</p>
            <p className="text-xs font-extrabold text-gold mt-0.5">Listed Price: ₹{listing.askingPrice}</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-brandError/10 border border-brandError/30 text-brandError text-xs flex items-center space-x-2 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmitOffer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Your Offer Price (₹)
            </label>
            <input
              type="number"
              min={listing.minimumOfferPrice || 10}
              max={listing.askingPrice}
              value={offerPrice}
              onChange={(e) => setOfferPrice(Number(e.target.value))}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory font-heading font-bold text-lg focus:outline-none focus:border-gold transition"
            />
            {listing.minimumOfferPrice && (
              <p className="text-[11px] text-slate-400 mt-1">Minimum offer allowed by seller: ₹{listing.minimumOfferPrice}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Note to Seller (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Can pick up today / I am a student at IIT..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold transition"
            />
          </div>

          <div className="pt-2 flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-obsidian text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-gold text-obsidian hover:bg-amber-400 shadow-goldGlow transition disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
