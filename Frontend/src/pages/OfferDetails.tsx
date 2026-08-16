import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ArrowRightLeft, CheckCircle2, XCircle, Clock, Send, AlertCircle } from 'lucide-react';

export const OfferDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [offer, setOffer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [counterPrice, setCounterPrice] = useState<number>(0);
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [now, setNow] = useState(Date.now());

  const fetchOffer = () => {
    if (!id) return;
    setLoading(true);
    api.get(`/offers/${id}`)
      .then((res: any) => {
        setOffer(res.data);
        // Prefill the counter toward agreement: the seller must counter HIGHER
        // than the buyer's offer; the buyer must counter LOWER than the seller's.
        const isViewerSeller = user?.id === res.data.sellerId;
        const min = res.data.listing?.minimumOfferPrice || 10;
        setCounterPrice(
          isViewerSeller ? res.data.currentPrice + 1 : Math.max(res.data.currentPrice - 1, min)
        );
      })
      .catch((err) => setError(err.message || 'Failed to load offer'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOffer();
  }, [id]);

  // Visual-only expiry countdown — the backend is the authority on expiry.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Loading negotiation timeline...</p>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-ivory">Offer Not Found</h2>
        <Link to="/offers" className="text-xs font-bold text-gold hover:underline mt-2 inline-block">
          Return to Offers Hub
        </Link>
      </div>
    );
  }

  const isSeller = user?.id === offer.sellerId;
  const isBuyer = user?.id === offer.buyerId;
  const ACTIVE = offer.status === 'PENDING' || offer.status === 'COUNTERED';

  // Who proposed the CURRENT price? (Mirrors the backend turn model — the
  // proposer can never respond to their own price, only the other party can.)
  const lastProposal = [...(offer.histories || [])]
    .reverse()
    .find((h: any) => h.action === 'OFFER_CREATED' || h.action === 'COUNTER_OFFER');
  const proposedByMe = !!lastProposal && lastProposal.senderId === user?.id;
  const myTurn = ACTIVE && !proposedByMe;
  const otherPartyName = isSeller ? offer.buyer?.name : offer.seller?.name;

  // Visual-only countdown. The backend rejects expired offers regardless.
  const expiresAt = offer.expiresAt ? new Date(offer.expiresAt) : null;
  const msLeft = expiresAt ? expiresAt.getTime() - now : 0;
  const expired = ACTIVE && msLeft <= 0;
  const hrsLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const minsLeft = Math.max(0, Math.floor((msLeft % 3_600_000) / 60_000));

  // Role-aware actions: a seller accepts the buyer's PENDING offer; a buyer
  // accepts the seller's COUNTER offer. Nobody can accept their own offer, and
  // a pending offer is always waiting on the seller's decision.
  const canAccept =
    (isSeller && offer.status === 'PENDING') || (isBuyer && offer.status === 'COUNTERED');
  const canReject =
    (isSeller && offer.status === 'PENDING') || (isBuyer && offer.status === 'COUNTERED');
  const canCounter =
    (isSeller && offer.status === 'PENDING') || (isBuyer && offer.status === 'COUNTERED');
  const isWaitingOnOther = !canAccept && !canReject && !canCounter;

  // Price-direction bounds: the seller counters HIGHER than the buyer's offer;
  // the buyer counters LOWER than the seller's counter (but never below the
  // seller's minimum). The backend enforces these too.
  const counterMin = isSeller ? offer.currentPrice + 1 : offer.listing?.minimumOfferPrice || 10;
  const counterMax = isBuyer ? offer.currentPrice - 1 : undefined;

  const handleCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await api.post(`/offers/${id}/counter`, {
        counterPrice: Number(counterPrice),
        message: counterMessage.trim() || undefined,
      });
      setSuccessMsg('Counter offer submitted!');
      setCounterMessage('');
      fetchOffer();
    } catch (err: any) {
      setError(err.message || 'Failed to send counter offer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async () => {
    setSubmitting(true);
    setError('');

    try {
      const res: any = await api.post(`/offers/${id}/accept`);

      if (isBuyer) {
        // The buyer accepted the seller's counter offer — they must complete payment.
        setSuccessMsg('Offer accepted! Completing payment...');
        setTimeout(() => {
          navigate(`/checkout?orderId=${res.data.order.id}`);
        }, 1000);
      } else {
        // The seller accepted the buyer's offer — payment is the buyer's job, so
        // the seller stays here instead of being sent to the payment page.
        setSuccessMsg('Offer accepted! The buyer will complete payment. The listing is reserved for them.');
        fetchOffer();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to accept offer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    setError('');

    try {
      await api.post(`/offers/${id}/reject`);
      fetchOffer();
    } catch (err: any) {
      setError(err.message || 'Failed to reject offer');
    } finally {
      setSubmitting(false);
    }
  };

  // Buyer withdraws their OWN pending offer — distinct from a rejection by the
  // other party. The backend ends it with status CANCELLED.
  const handleCancel = async () => {
    setSubmitting(true);
    setError('');

    try {
      await api.post(`/offers/${id}/cancel`);
      setSuccessMsg('Offer withdrawn. The negotiation has been cancelled.');
      fetchOffer();
    } catch (err: any) {
      setError(err.message || 'Failed to withdraw offer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gold/10 text-gold border border-gold/30">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-sage block">Negotiation Engine</span>
              <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory">
                Offer for "{offer.listing?.book?.title}"
              </h1>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className={`px-3 py-1.5 rounded-xl font-extrabold text-xs tracking-wider uppercase border ${
                offer.status === 'ACCEPTED'
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                  : offer.status === 'REJECTED' || offer.status === 'EXPIRED'
                  ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
              }`}
            >
              Status: {offer.status}
            </span>

            {ACTIVE && (
              <>
                <span
                  className={`px-3 py-1 rounded-xl font-extrabold text-[11px] border ${
                    myTurn && !expired
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                      : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                  }`}
                >
                  {expired
                    ? 'Offer Expired'
                    : myTurn
                    ? 'Your Turn'
                    : `Waiting for ${otherPartyName || 'the other party'}`}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {expired ? 'You cannot respond to an expired offer' : `Expires in ${hrsLeft}h ${minsLeft}m`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Listing Overview */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-100 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <img
              src={offer.listing?.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'}
              alt={offer.listing?.book?.title}
              className="w-12 h-14 object-cover rounded-lg"
            />
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-ivory">{offer.listing?.book?.title}</h3>
              <p className="text-xs text-slate-400">Seller: {offer.seller?.name} • Buyer: {offer.buyer?.name}</p>
              <p className="text-xs font-bold text-gold mt-0.5">Original Asking Price: ₹{offer.listing?.askingPrice}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-medium">Agreed / Current Price</span>
            <span className="font-heading text-2xl font-black text-slate-900 dark:text-ivory">
              ₹{offer.currentPrice}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-brandError/10 border border-brandError/30 text-brandError text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-brandSuccess/10 border border-brandSuccess/30 text-brandSuccess text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Immutable Offer History Timeline */}
      <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-6">
        <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory flex items-center space-x-2">
          <Clock className="w-5 h-5 text-gold" />
          <span>Immutable Negotiation History Log</span>
        </h3>

        <div className="space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          {offer.histories?.map((h: any, idx: number) => {
            const isSenderUser = h.senderId === user?.id;
            return (
              <div key={h.id || idx} className="flex items-start space-x-4 relative z-10 pl-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    h.action === 'ACCEPTED'
                      ? 'bg-emerald-500 text-white'
                      : h.action === 'COUNTER_OFFER'
                      ? 'bg-gold text-obsidian'
                      : 'bg-slate-200 dark:bg-obsidian text-slate-700 dark:text-slate-300'
                  }`}
                >
                  ₹
                </div>

                <div className="flex-1 p-4 rounded-2xl bg-slate-50 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800/80">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-900 dark:text-ivory">
                      {h.sender?.name || (h.senderId === offer.sellerId ? offer.seller?.name : offer.buyer?.name)}
                      {isSenderUser && <span className="ml-1 text-[10px] text-gold">(You)</span>}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="font-heading font-black text-lg text-gold">₹{h.price}</span>
                    <span className="text-[11px] font-semibold uppercase text-slate-400">({h.action.replace(/_/g, ' ')})</span>
                  </div>
                  {h.message && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">"{h.message}"</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Box */}
      {(offer.status === 'PENDING' || offer.status === 'COUNTERED') && (
        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-6">
          <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory">Respond to Offer</h3>

          {!isWaitingOnOther ? (
            <>
              {(canAccept || canReject) && (
                <div className="flex flex-wrap items-center gap-3">
                  {canAccept && (
                    <button
                      onClick={handleAccept}
                      disabled={submitting}
                      className="flex-1 py-3 px-4 rounded-xl font-extrabold text-xs bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept Offer of ₹{offer.currentPrice}</span>
                    </button>
                  )}

                  {canReject && (
                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="py-3 px-4 rounded-xl font-bold text-xs bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition flex items-center justify-center space-x-1 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  )}
                </div>
              )}

              {canCounter && (
                <form onSubmit={handleCounter} className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Or Send Counter Offer</h4>
                  <div className="flex gap-3">
                    <input
                      type="number"
                      min={counterMin}
                      max={counterMax}
                      value={counterPrice}
                      onChange={(e) => setCounterPrice(Number(e.target.value))}
                      className="w-32 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                    />
                    <input
                      type="text"
                      placeholder="Optional message with counter offer..."
                      value={counterMessage}
                      onChange={(e) => setCounterMessage(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-gold text-obsidian hover:bg-amber-400 transition flex items-center space-x-1 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Counter</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {isSeller
                      ? `Counter must be higher than the buyer's offer of ₹${offer.currentPrice}`
                      : `Counter must be between ₹${counterMin} and ₹${offer.currentPrice - 1}`}
                  </p>
                </form>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {isSeller
                  ? 'Waiting for the buyer to respond to your counter offer.'
                  : 'Waiting for the seller to respond to your offer.'}
              </p>
              {isBuyer && offer.status === 'PENDING' && (
                <button
                  onClick={handleCancel}
                  disabled={submitting}
                  className="text-[11px] font-semibold text-rose-500 hover:underline disabled:opacity-50"
                >
                  Withdraw offer
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
