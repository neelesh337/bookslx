import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { onRealtime } from '../api/realtime';
import { ArrowRightLeft, Package, MessageSquare } from 'lucide-react';

type OfferTab = 'seller' | 'buyer';

export const OfferHub: React.FC = () => {
  const [tab, setTab] = useState<OfferTab>('seller');
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOffers = useCallback((role: OfferTab, silent = false) => {
    if (!silent) setLoading(true);
    api.get('/offers', { params: { role } })
      .then((res: any) => setOffers(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOffers(tab);
  }, [tab, fetchOffers]);

  // Live: any negotiation event refreshes the offer list immediately.
  useEffect(() => {
    return onRealtime(() => {
      fetchOffers(tab, true);
    });
  }, [tab, fetchOffers]);

  // Polling fallback — SSE may be blocked by reverse proxies (Render) that
  // buffer event-stream responses, so we poll as a safety net.
  useEffect(() => {
    const t = setInterval(() => fetchOffers(tab, true), 15000);
    return () => clearInterval(t);
  }, [tab, fetchOffers]);

  const switchTab = (next: OfferTab) => {
    if (next === tab) return;
    setTab(next);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
          Offers & Price Negotiations
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Offers are sorted by amount — highest price on top.
        </p>
      </div>

      {/* Role tabs: incoming offers on your books vs. offers you have made */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => switchTab('seller')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 ${
            tab === 'seller' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Offers for My Books</span>
          {!loading && tab === 'seller' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === 'seller' ? 'bg-obsidian/20' : 'bg-slate-200 dark:bg-graphite'}`}>
              {offers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => switchTab('buyer')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 ${
            tab === 'buyer' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>My Offers</span>
          {!loading && tab === 'buyer' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === 'buyer' ? 'bg-obsidian/20' : 'bg-slate-200 dark:bg-graphite'}`}>
              {offers.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-graphite animate-pulse" />
          ))}
        </div>
      ) : offers.length > 0 ? (
        <div className="space-y-4">
          {offers.map((offer) => (
            <Link
              key={offer.id}
              to={`/offers/${offer.id}`}
              className="block p-5 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 hover:border-gold/50 shadow-sm hover:shadow-premium transition group"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <img
                    src={offer.listing?.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'}
                    alt={offer.listing?.book?.title}
                    className="w-12 h-14 object-cover rounded-xl"
                  />
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-ivory group-hover:text-gold transition">
                      {offer.listing?.book?.title}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {tab === 'seller' ? (
                        <>Buyer: {offer.buyer?.name}</>
                      ) : (
                        <>Seller: {offer.seller?.name}</>
                      )}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {tab === 'seller' ? 'Offered' : 'You offered'} on {new Date(offer.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Offer Price</span>
                    <span className="font-heading font-black text-xl text-gold">₹{offer.currentPrice}</span>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${
                      offer.status === 'SELLER_ACCEPTED' || offer.status === 'DEAL_ACCEPTED'
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                        : offer.status === 'REJECTED' || offer.status === 'EXPIRED' || offer.status === 'CANCELLED' || offer.status === 'CANCELLED_BY_BUYER'
                        ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                        : offer.status === 'COUNTERED'
                        ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                        : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    }`}
                  >
                    {offer.status?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800">
          <ArrowRightLeft className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {tab === 'seller' ? 'No offers received on your books yet.' : 'You have not made any offers yet.'}
          </p>
          <Link to="/books" className="text-xs font-bold text-gold hover:underline mt-2 inline-block">
            {tab === 'seller' ? 'Your listings will appear here once buyers make offers' : 'Browse books to make your first offer →'}
          </Link>
        </div>
      )}
    </div>
  );
};
