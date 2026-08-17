import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { onRealtime } from '../api/realtime';
import { useAuth } from '../context/AuthContext';
import { ArrowRightLeft, CheckCircle2, XCircle, Clock, Send, AlertCircle, PartyPopper, Handshake } from 'lucide-react';

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

  const fetchOffer = (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    api.get(`/offers/${id}`)
      .then((res: any) => {
        setOffer(res.data);
        // Prefill the counter toward agreement
        const isViewerSeller = user?.id === res.data.sellerId;
        const min = res.data.listing?.minimumOfferPrice || 10;
        setCounterPrice(
          isViewerSeller ? res.data.currentPrice + 1 : Math.max(res.data.currentPrice - 1, min)
        );
      })
      .catch((err) => {
        if (!silent) setError(err.message || 'Failed to load offer');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOffer();
  }, [id]);

  // Live negotiation via SSE
  useEffect(() => {
    if (!id) return;
    return onRealtime((ev) => {
      fetchOffer(true);
      if (['COUNTER_OFFER', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'OFFER_CANCELLED', 'OFFER_EXPIRED', 'SELLER_ACCEPTED', 'DEAL_CONFIRMED'].includes(ev.type)) {
        setSuccessMsg(`⚡ Live update: ${ev.message || 'the negotiation changed'}`);
        setTimeout(() => setSuccessMsg(''), 5000);
      }
    });
  }, [id]);

  // Slow fallback poll
  useEffect(() => {
    if (!id) return;
    const active = offer?.status === 'PENDING' || offer?.status === 'COUNTERED' || offer?.status === 'SELLER_ACCEPTED';
    if (!active) return;
    const t = setInterval(() => fetchOffer(true), 30000);
    return () => clearInterval(t);
  }, [id, offer?.status]);

  // Visual-only expiry countdown — tick every 30 s so the confirmation
  // deadline and offer expiry stay visually up-to-date.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
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
  
  // Determine whose turn it is based on the new model
  // PENDING: Buyer's price on table -> Seller's turn
  // COUNTERED: Seller's price on table -> Buyer's turn
  // SELLER_ACCEPTED: Seller has agreed -> Buyer's turn (Confirm/Decline)
  // DEAL_ACCEPTED: Buyer has confirmed -> Next steps (Checkout)
  
  const isNegotiating = offer.status === 'PENDING' || offer.status === 'COUNTERED';
  const isPendingSellerResponse = offer.status === 'PENDING';
  const isPendingBuyerResponse = offer.status === 'COUNTERED' || offer.status === 'SELLER_ACCEPTED';
  
  const myTurn = (isSeller && isPendingSellerResponse) || (isBuyer && isPendingBuyerResponse);
  const otherPartyName = isSeller ? offer.buyer?.name : offer.seller?.name;

  // Visual-only countdown
  const expiresAt = offer.expiresAt ? new Date(offer.expiresAt) : null;
  const msLeft = expiresAt ? expiresAt.getTime() - now : 0;
  const expired = isNegotiating && msLeft <= 0;
  const hrsLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const minsLeft = Math.max(0, Math.floor((msLeft % 3_600_000) / 60_000));

  // Confirmation deadline for SELLER_ACCEPTED state
  const confirmExpiresAt = offer.confirmationExpiresAt ? new Date(offer.confirmationExpiresAt) : null;
  const confirmMsLeft = confirmExpiresAt ? confirmExpiresAt.getTime() - now : 0;
  const confirmExpired = offer.status === 'SELLER_ACCEPTED' && confirmMsLeft <= 0;
  const confirmMinsLeft = Math.max(0, Math.floor(confirmMsLeft / 60_000));

  // Price-direction bounds
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

  // SELLER accepts buyer's price -> SELLER_ACCEPTED
  const handleSellerAccept = async () => {
    setSubmitting(true);
    setError('');

    try {
      await api.post(`/offers/${id}/accept`);
      setSuccessMsg('Offer accepted! Waiting for buyer confirmation.');
      fetchOffer();
    } catch (err: any) {
      setError(err.message || 'Failed to accept offer');
    } finally {
      setSubmitting(false);
    }
  };

  // BUYER confirms the seller-approved deal -> DEAL_ACCEPTED + Order Created
  const handleBuyerConfirm = async () => {
    setSubmitting(true);
    setError('');

    try {
      const res: any = await api.post(`/offers/${id}/confirm`);
      setSuccessMsg('Deal confirmed! Redirecting to checkout...');
      setTimeout(() => {
        navigate(`/checkout?orderId=${res.data.order.id}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to confirm deal');
    } finally {
      setSubmitting(false);
    }
  };

  // BUYER declines the seller-approved deal
  const handleBuyerDecline = async () => {
    setSubmitting(true);
    setError('');

    try {
      await api.post(`/offers/${id}/decline`);
      setSuccessMsg('Deal declined. The book is back on sale.');
      fetchOffer();
    } catch (err: any) {
      setError(err.message || 'Failed to decline deal');
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

  const handleCancel = async () => {
    const confirmed = window.confirm('Are you sure you want to withdraw this offer? This cannot be undone.');
    if (!confirmed) return;

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
                offer.status === 'DEAL_ACCEPTED' || offer.status === 'SELLER_ACCEPTED'
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                  : offer.status === 'REJECTED' || offer.status === 'EXPIRED' || offer.status === 'CANCELLED' || offer.status === 'CANCELLED_BY_BUYER'
                  ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
              }`}
            >
              Status: {offer.status?.replace(/_/g, ' ')}
            </span>

            {(isNegotiating || offer.status === 'SELLER_ACCEPTED') && (
              <>
                <span
                  className={`px-3 py-1 rounded-xl font-extrabold text-[11px] border ${
                    myTurn && !expired && !confirmExpired
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                      : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                  }`}
                >
                  {expired || confirmExpired
                    ? 'Time Expired'
                    : myTurn
                    ? 'Your Turn'
                    : `Waiting for ${otherPartyName || 'the other party'}`}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {offer.status === 'SELLER_ACCEPTED' 
                    ? `Buyer must confirm in ${confirmMinsLeft}m`
                    : expired ? 'You cannot respond to an expired offer' : `Expires in ${hrsLeft}h ${minsLeft}m`
                  }
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
            <span className="text-[10px] text-slate-400 block font-medium">
              {offer.status === 'SELLER_ACCEPTED' ? 'Locked Price' : 'Current Proposal'}
            </span>
            <span className="font-heading text-2xl font-black text-slate-900 dark:text-ivory">
              ₹{offer.finalNegotiatedPrice || offer.currentPrice}
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

      {/* Final Deal Confirmation Card (Buyer Only) */}
      {offer.status === 'SELLER_ACCEPTED' && isBuyer && (
        <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500/30 space-y-6 shadow-lg shadow-emerald-500/10">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-emerald-500 text-white">
              <PartyPopper className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-300 block">Final Step</span>
              <h2 className="font-heading text-xl font-extrabold text-slate-900 dark:text-ivory">
                Seller Accepted Your Offer!
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 block mb-1">Negotiated Price</span>
              <span className="font-heading font-black text-2xl text-emerald-600">₹{offer.finalNegotiatedPrice}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">You Save</span>
              <span className="font-heading font-black text-2xl text-gold">
                ₹{offer.listing?.askingPrice - offer.finalNegotiatedPrice}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 italic">
            The seller has agreed to your price. Would you like to proceed with this deal?
          </p>

          {confirmExpired ? (
            <div className="text-center text-rose-500 font-bold text-sm py-2">
              Confirmation window expired. The listing has been released.
            </div>
          ) : (
            <div className="flex gap-4 pt-2">
              <button
                onClick={handleBuyerConfirm}
                disabled={submitting}
                className="flex-1 py-4 px-6 rounded-xl font-extrabold text-base bg-emerald-600 text-white hover:bg-emerald-500 shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Handshake className="w-5 h-5" />
                <span>Accept Deal & Continue</span>
              </button>
              
              <button
                onClick={handleBuyerDecline}
                disabled={submitting}
                className="py-4 px-6 rounded-xl font-bold text-sm bg-rose-500/10 text-rose-600 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition flex items-center justify-center space-x-1 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>Decline Deal</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Seller Waiting for Buyer Confirmation */}
      {offer.status === 'SELLER_ACCEPTED' && isSeller && (
        <div className="p-6 rounded-3xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-500/30 text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-3 rounded-2xl bg-amber-100 text-amber-600 animate-pulse">
              <Clock className="w-8 h-8" />
            </div>
          </div>
          <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">
            Waiting for Buyer Confirmation
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            You've accepted the offer at ₹{offer.finalNegotiatedPrice || offer.currentPrice}. The buyer must confirm the deal within the time limit.
          </p>
          {!confirmExpired ? (
            <div className="flex items-center justify-center space-x-2 text-sm font-bold text-amber-600">
              <Clock className="w-4 h-4" />
              <span>Buyer has {confirmMinsLeft}m to confirm</span>
            </div>
          ) : (
            <div className="text-rose-500 font-bold text-sm py-2">
              The buyer did not confirm in time. The listing has been released.
            </div>
          )}
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
                    h.action === 'ACCEPTED' || h.action === 'DEAL_ACCEPTED'
                      ? 'bg-emerald-500 text-white'
                      : h.action === 'COUNTER_OFFER'
                      ? 'bg-gold text-obsidian'
                      : h.action === 'REJECTED' || h.action === 'CANCELLED'
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-200 dark:bg-obsidian text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {h.action === 'ACCEPTED' || h.action === 'DEAL_ACCEPTED' ? '✓' : h.action === 'REJECTED' ? '✕' : '₹'}
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
      {isNegotiating && (
        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-6">
          <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory">
            {myTurn ? 'Your Turn to Respond' : `Waiting for ${otherPartyName}`}
          </h3>

          {!myTurn ? (
            <div className="space-y-3 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-obsidian mx-auto flex items-center justify-center">
                <Clock className="w-6 h-6 text-slate-400 animate-spin-slow" />
              </div>
              <p className="text-xs text-slate-500">
                {isPendingSellerResponse
                  ? `${offer.buyer?.name} is waiting for your decision on their offer.`
                  : `You are waiting for ${otherPartyName} to respond to the counter offer.`
                }
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
          ) : (
            <div className="space-y-4">
              {/* Seller Actions: Accept, Counter, Reject (when buyer's price is on table) */}
              {isSeller && isPendingSellerResponse && !expired && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleSellerAccept}
                      disabled={submitting}
                      className="flex-1 py-3 px-4 rounded-xl font-extrabold text-xs bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept ₹{offer.currentPrice}</span>
                    </button>

                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="py-3 px-4 rounded-xl font-bold text-xs bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition flex items-center justify-center space-x-1 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>

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
                        placeholder="Optional message..."
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
                      Counter must be higher than the buyer's offer of ₹{offer.currentPrice}
                    </p>
                  </form>
                </>
              )}

              {/* Buyer Actions: Only Counter (when seller's price is on table) */}
              {isBuyer && isPendingBuyerResponse && offer.status === 'COUNTERED' && !expired && (
                <form onSubmit={handleCounter} className="space-y-3">
                  <p className="text-xs text-slate-500 italic">
                    You cannot directly accept the seller's counter. Please propose your best price.
                  </p>
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
                      placeholder="Optional message..."
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
                    Counter must be lower than ₹{offer.currentPrice}
                  </p>
                </form>
              )}

              {expired && (
                <div className="text-center py-4">
                  <p className="text-xs font-bold text-rose-500">This offer has expired. You can no longer respond.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Terminal States: Rejected / Expired / Cancelled */}
      {(offer.status === 'REJECTED' || offer.status === 'EXPIRED' || offer.status === 'CANCELLED' || offer.status === 'CANCELLED_BY_BUYER') && (
        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 text-center space-y-4">
          {offer.status === 'REJECTED' && (
            <>
              <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-ivory">Offer Rejected</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                {isSeller ? 'You rejected the buyer\'s offer.' : `Your offer of ₹${offer.currentPrice} was rejected by the seller.`}
              </p>
            </>
          )}
          {offer.status === 'EXPIRED' && (
            <>
              <Clock className="w-12 h-12 text-amber-500 mx-auto" />
              <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-ivory">Negotiation Expired</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                This negotiation has expired. The listing may still be available.
              </p>
            </>
          )}
          {(offer.status === 'CANCELLED' || offer.status === 'CANCELLED_BY_BUYER') && (
            <>
              <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
              <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-ivory">Negotiation Cancelled</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                {offer.status === 'CANCELLED_BY_BUYER'
                  ? 'The buyer declined the deal. No order was created.'
                  : 'This negotiation has been cancelled.'}
              </p>
            </>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link 
              to="/offers" 
              className="inline-block px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-obsidian text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-800 hover:border-gold transition"
            >
              View Your Offers
            </Link>
            {offer.listing?.id && (
              <Link 
                to={`/books/${offer.listing.id}`} 
                className="inline-block px-5 py-2.5 rounded-xl text-xs font-bold bg-gold text-obsidian hover:bg-amber-400 transition"
              >
                Back to Listing
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Deal Accepted State */}
      {offer.status === 'DEAL_ACCEPTED' && (
        <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500/30 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-ivory">
            Deal Confirmed!
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            The negotiation is complete at <strong className="text-emerald-600">₹{offer.finalNegotiatedPrice || offer.currentPrice}</strong>. The listing is reserved and an order has been created.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link 
              to="/offers" 
              className="inline-block px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-obsidian text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-800 hover:border-gold transition"
            >
              View Your Offers
            </Link>
            <Link 
              to="/profile/orders" 
              className="inline-block px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm transition"
            >
              Go to Orders
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
