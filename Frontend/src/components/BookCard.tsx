import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';

interface BookCardProps {
  listing: {
    id: string;
    askingPrice: number;
    minimumOfferPrice?: number;
    condition: string;
    status: string;
    book: {
      title: string;
      author: string;
      category: string;
      edition?: string;
    };
    seller: {
      id: string;
      name: string;
      rating: number;
      totalSales?: number;
    };
    images?: Array<{ url: string }>;
  };
  onMakeOffer?: (listing: any) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ listing, onMakeOffer }) => {
  const primaryImage = listing.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

  const conditionColors: Record<string, string> = {
    LIKE_NEW: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    EXCELLENT: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30',
    GOOD: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    ACCEPTABLE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    POOR: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  };

  return (
    <div className="group rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-premium hover:border-gold/40 transition-all duration-200 flex flex-col justify-between">
      <div>
        {/* Cover Image Container */}
        <div className="relative aspect-[4/3] bg-slate-100 dark:bg-obsidian/60 overflow-hidden">
          <img
            src={primaryImage}
            alt={listing.book.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-3 left-3">
            <span
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold tracking-wider uppercase border backdrop-blur-md ${
                conditionColors[listing.condition] || 'bg-slate-500/10 text-slate-400'
              }`}
            >
              {listing.condition.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="absolute top-3 right-3">
            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-obsidian/80 text-gold border border-gold/30">
              {listing.book.category}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 space-y-2">
          <Link to={`/books/${listing.id}`} className="block group-hover:text-gold transition">
            <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory line-clamp-1">
              {listing.book.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
              by {listing.book.author}
            </p>
          </Link>

          {/* Seller Snippet */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
            <span className="truncate max-w-[120px]">Seller: <strong className="text-slate-700 dark:text-slate-300">{listing.seller.name}</strong></span>
            <span className="flex items-center text-gold font-medium">
              <Star className="w-3 h-3 fill-gold mr-1" />
              {listing.seller.rating}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Price & Buttons */}
      <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800/60 mt-2">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Asking Price</span>
            <span className="font-heading text-lg font-extrabold text-slate-900 dark:text-ivory">
              ₹{listing.askingPrice}
            </span>
          </div>
          {listing.minimumOfferPrice && (
            <span className="text-[10px] text-sage font-medium bg-sage/10 px-2 py-0.5 rounded">
              Offers from ₹{listing.minimumOfferPrice}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            to={`/books/${listing.id}`}
            className="w-full text-center py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-obsidian text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            Buy Now
          </Link>
          <button
            onClick={() => onMakeOffer && onMakeOffer(listing)}
            className="w-full py-2 rounded-xl text-xs font-bold bg-gold/10 text-gold border border-gold/30 hover:bg-gold hover:text-obsidian transition"
          >
            Make Offer
          </button>
        </div>
      </div>
    </div>
  );
};
