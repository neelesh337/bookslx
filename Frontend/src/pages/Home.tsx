import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { BookCard } from '../components/BookCard';
import { OfferModal } from '../components/OfferModal';
import {
  Search,
  BookOpen,
  PlusCircle,
  Sparkles,
  TrendingUp
} from 'lucide-react';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [listings, setListings] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOfferListing, setSelectedOfferListing] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.get('/books/listings?limit=8'),
      api.get('/books/categories'),
    ])
      .then(([listingsRes, categoriesRes]: any) => {
        setListings(listingsRes.data || []);
        setCategories(categoriesRes.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/books?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="space-y-16 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 bg-gradient-to-b from-graphite/40 via-obsidian/20 to-transparent border-b border-slate-200 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-bold tracking-wide uppercase">
            <Sparkles className="w-4 h-4" />
            <span>Second-Hand Book Marketplace Mediator</span>
          </div>

          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-ivory tracking-tight max-w-4xl mx-auto leading-tight">
            Find Your Next Book for <span className="text-gold">Less.</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Buy and sell second-hand books directly from readers and students. Negotiate the price. Save more.
          </p>

          {/* Hero Search Box */}
          <form onSubmit={handleHeroSearch} className="max-w-2xl mx-auto flex items-center p-2 rounded-2xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 shadow-premium">
            <Search className="w-5 h-5 text-slate-400 ml-3" />
            <input
              type="text"
              placeholder="Search by Title, Author, ISBN, Engineering, GATE..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-3 text-sm bg-transparent text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-gold text-obsidian font-bold text-sm hover:bg-amber-400 shadow-goldGlow transition flex-shrink-0"
            >
              Search
            </button>
          </form>

          {/* CTA Buttons */}
          <div className="flex items-center justify-center space-x-4 pt-2">
            <Link
              to="/books"
              className="px-6 py-3 rounded-xl bg-slate-900 dark:bg-ivory text-ivory dark:text-obsidian font-bold text-sm hover:brightness-110 transition shadow-sm"
            >
              Browse All Books
            </Link>
            <Link
              to="/sell/create"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-sage to-forest text-ivory font-bold text-sm hover:brightness-110 transition shadow-sm flex items-center space-x-2"
            >
              <PlusCircle className="w-4 h-4 text-gold" />
              <span>Sell a Book</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Popular Categories Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-ivory">Popular Categories</h2>
            <p className="text-xs text-slate-500">Explore second-hand books by academic and reading discipline</p>
          </div>
          <Link to="/books" className="text-xs font-bold text-gold hover:underline">
            View All →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat}
              to={`/books?category=${encodeURIComponent(cat)}`}
              className="p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 text-center hover:border-gold/50 hover:shadow-premium transition group"
            >
              <BookOpen className="w-6 h-6 text-sage group-hover:text-gold mx-auto mb-2 transition-colors" />
              <h3 className="font-heading font-bold text-sm text-slate-800 dark:text-ivory group-hover:text-gold transition">
                {cat}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      {/* Trending Books / Recently Listed */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 text-gold" />
            <div>
              <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-ivory">Recently Listed Books</h2>
              <p className="text-xs text-slate-500">Authentic second-hand listings with condition details</p>
            </div>
          </div>
          <Link to="/books" className="text-xs font-bold text-gold hover:underline">
            Explore Marketplace →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-80 rounded-2xl bg-slate-200 dark:bg-graphite animate-pulse" />
            ))}
          </div>
        ) : listings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {listings.map((listing) => (
              <BookCard
                key={listing.id}
                listing={listing}
                onMakeOffer={(l) => setSelectedOfferListing(l)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500">No active book listings found.</p>
          </div>
        )}
      </section>

      {/* How BooksLX Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl bg-graphite border border-slate-800 text-ivory space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gold">Trusted P2P Mediator</span>
            <h2 className="font-heading text-3xl font-extrabold text-ivory">How BooksLX Works</h2>
            <p className="text-xs text-slate-400">Physical courier logistics combined with digital offer negotiation & escrow payment protection.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-obsidian border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center font-bold text-base border border-gold/30">1</div>
              <h3 className="font-heading font-bold text-base text-ivory">Discover & Negotiate</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Browse authentic second-hand listings. Submit custom price offers directly to the seller.</p>
            </div>

            <div className="p-6 rounded-2xl bg-obsidian border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center font-bold text-base border border-gold/30">2</div>
              <h3 className="font-heading font-bold text-base text-ivory">Payment Protection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Once price is agreed, buyer pays securely. Funds are protected until courier delivery.</p>
            </div>

            <div className="p-6 rounded-2xl bg-obsidian border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center font-bold text-base border border-gold/30">3</div>
              <h3 className="font-heading font-bold text-base text-ivory">3PL Courier Pickup</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Seller ships via 3PL courier. Both parties track the parcel in real-time on BooksLX.</p>
            </div>

            <div className="p-6 rounded-2xl bg-obsidian border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center font-bold text-base border border-gold/30">4</div>
              <h3 className="font-heading font-bold text-base text-ivory">Receive & Review</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Buyer receives book, confirms condition, and payment settlement is released to seller.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Offer Negotiation Modal */}
      {selectedOfferListing && (
        <OfferModal
          listing={selectedOfferListing}
          isOpen={!!selectedOfferListing}
          onClose={() => setSelectedOfferListing(null)}
        />
      )}
    </div>
  );
};
