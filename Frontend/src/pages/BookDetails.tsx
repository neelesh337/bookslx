import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { OfferModal } from '../components/OfferModal';
import {
  Truck,
  ArrowRightLeft,
  ShoppingCart,
  Heart,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  UserCheck
} from 'lucide-react';

export const BookDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<any>(null);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [cartAdding, setCartAdding] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/books/listings/${id}`)
      .then((res: any) => {
        setListing(res.data);
        setSelectedImage(res.data.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80');
      })
      .catch((err) => setError(err.message || 'Failed to load book details'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Loading second-hand listing & condition breakdown...</p>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-slate-900 dark:text-ivory">Listing Not Found</h2>
        <Link to="/books" className="text-sm font-bold text-gold hover:underline mt-2 inline-block">
          Return to Marketplace
        </Link>
      </div>
    );
  }

  let parsedConditionDetails: any = {};
  try {
    parsedConditionDetails = typeof listing.conditionDetails === 'string'
      ? JSON.parse(listing.conditionDetails)
      : listing.conditionDetails;
  } catch (e) {
    parsedConditionDetails = {};
  }

  const handleBuyNow = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (listing.sellerId === user.id) {
      setError('You cannot purchase your own listing');
      return;
    }

    setBuying(true);
    setError('');

    try {
      const res: any = await api.post('/orders/direct', { listingId: listing.id });
      navigate(`/checkout?orderId=${res.data.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize checkout');
    } finally {
      setBuying(false);
    }
  };

  const handleAddToCart = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (listing.sellerId === user.id) {
      setError('You cannot add your own listing to cart');
      return;
    }

    setCartAdding(true);
    setError('');

    try {
      await api.post('/cart', { listingId: listing.id });
      setSuccessMsg('Added to cart!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add to cart');
    } finally {
      setCartAdding(false);
    }
  };

  const handleToggleWishlist = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const res: any = await api.post('/wishlist/toggle', { listingId: listing.id });
      setSuccessMsg(res.data.isWishlisted ? 'Added to Wishlist!' : 'Removed from Wishlist');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {}
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Messages */}
      {error && (
        <div className="p-4 rounded-2xl bg-brandError/10 border border-brandError/30 text-brandError text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-brandSuccess/10 border border-brandSuccess/30 text-brandSuccess text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Grid: Images & Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Left: Image Gallery */}
        <div className="space-y-4">
          <div className="aspect-[4/3] rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 overflow-hidden p-4 shadow-sm flex items-center justify-center">
            <img
              src={selectedImage}
              alt={listing.book.title}
              className="max-h-full max-w-full object-contain rounded-2xl"
            />
          </div>

          {/* Thumbnails */}
          {listing.images && listing.images.length > 1 && (
            <div className="flex space-x-3 overflow-x-auto pb-2">
              {listing.images.map((img: any) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(img.url)}
                  className={`w-16 h-16 rounded-xl border-2 overflow-hidden flex-shrink-0 transition ${
                    selectedImage === img.url ? 'border-gold shadow-goldGlow' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img.url} alt="Thumbnail" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Metadata & Actions */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider bg-gold/10 text-gold border border-gold/30">
                {listing.condition.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-slate-400 font-medium">Category: {listing.book.category}</span>
            </div>

            <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory leading-tight">
              {listing.book.title}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              by <strong className="text-slate-800 dark:text-slate-200">{listing.book.author}</strong> • {listing.book.publisher} ({listing.book.edition || 'Edition N/A'})
            </p>
            <p className="text-xs text-slate-400 mt-0.5">ISBN: {listing.book.isbn}</p>
          </div>

          {/* Price Box */}
          <div className="p-6 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs text-slate-400 block font-medium">Authoritative Second-Hand Price</span>
                <span className="font-heading text-3xl font-black text-slate-900 dark:text-ivory">
                  ₹{listing.askingPrice}
                </span>
              </div>
              {listing.minimumOfferPrice && (
                <span className="text-xs text-sage bg-sage/10 px-3 py-1.5 rounded-xl font-bold border border-sage/30">
                  Negotiable from ₹{listing.minimumOfferPrice}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Truck className="w-4 h-4 text-gold" />
              <span>Doorstep 3PL Delivery Fee: <strong>₹50</strong> • Escrow Fee (5% of price): <strong>₹{((listing.askingPrice || 0) * 0.05).toFixed(2)}</strong></span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleBuyNow}
                disabled={buying || listing.status !== 'ACTIVE'}
                className="py-3.5 px-4 rounded-xl font-bold text-sm bg-gold text-obsidian hover:bg-amber-400 shadow-goldGlow transition disabled:opacity-50"
              >
                {buying ? 'Initializing...' : 'Buy Now'}
              </button>
              <button
                onClick={() => setIsOfferModalOpen(true)}
                disabled={listing.status !== 'ACTIVE'}
                className="py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-sage to-forest text-ivory hover:brightness-110 shadow-sm transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <ArrowRightLeft className="w-4 h-4 text-gold" />
                <span>Make Offer</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleAddToCart}
                disabled={cartAdding || listing.status !== 'ACTIVE'}
                className="py-3 px-4 rounded-xl font-semibold text-xs bg-slate-100 dark:bg-obsidian text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-800 hover:border-gold transition flex items-center justify-center space-x-2"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Add to Cart</span>
              </button>
              <button
                onClick={handleToggleWishlist}
                className="py-3 px-4 rounded-xl font-semibold text-xs bg-slate-100 dark:bg-obsidian text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-800 hover:border-gold transition flex items-center justify-center space-x-2"
              >
                <Heart className="w-4 h-4 text-rose-500" />
                <span>Wishlist</span>
              </button>
            </div>
          </div>

          {/* Seller Metadata Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img
                src={listing.seller.profileImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                alt={listing.seller.name}
                className="w-10 h-10 rounded-xl object-cover border border-gold/40"
              />
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-ivory flex items-center space-x-1">
                  <span>Seller: {listing.seller.name}</span>
                  <UserCheck className="w-3.5 h-3.5 text-sage" />
                </h4>
                <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                  <span className="flex items-center text-gold font-bold">★ {listing.seller.rating}</span>
                  <span>•</span>
                  <span>{listing.seller.totalSales} books sold</span>
                </div>
              </div>
            </div>

            <span className="text-[10px] font-semibold text-sage bg-sage/10 px-2 py-1 rounded">
              Verified Reader
            </span>
          </div>
        </div>
      </div>

      {/* Condition Breakdown Matrix */}
      <section className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800/80 space-y-6">
        <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-ivory flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-gold" />
          <span>Physical Condition Breakdown Matrix</span>
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Cover Condition</span>
            <span className="text-sm font-bold text-slate-900 dark:text-ivory mt-1 block">
              {parsedConditionDetails.coverCondition || 'Good'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Pages Quality</span>
            <span className="text-sm font-bold text-slate-900 dark:text-ivory mt-1 block">
              {parsedConditionDetails.pagesCondition || 'Clean'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Spine / Binding</span>
            <span className="text-sm font-bold text-slate-900 dark:text-ivory mt-1 block">
              {parsedConditionDetails.bindingCondition || 'Intact'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Markings & Writing</span>
            <span className="text-sm font-bold text-slate-900 dark:text-ivory mt-1 block">
              {parsedConditionDetails.writingPresent ? 'Writing Present' : 'No Writing'}
            </span>
          </div>
        </div>

        {parsedConditionDetails.damageNotes && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
            <strong className="font-bold">Seller Damage Notes:</strong> {parsedConditionDetails.damageNotes}
          </div>
        )}

        <div className="pt-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Book Synopsis</h4>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {listing.book.description}
          </p>
        </div>
      </section>

      {/* Offer Modal */}
      <OfferModal
        listing={listing}
        isOpen={isOfferModalOpen}
        onClose={() => setIsOfferModalOpen(false)}
      />
    </div>
  );
};
