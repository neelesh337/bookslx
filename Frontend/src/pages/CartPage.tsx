import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ShoppingCart, Trash2, ArrowRight } from 'lucide-react';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchCart = () => {
    setLoading(true);
    api.get('/cart')
      .then((res: any) => setCart(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const handleRemove = async (listingId: string) => {
    try {
      await api.delete(`/cart/${listingId}`);
      fetchCart();
    } catch (e) {}
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Loading your cart items...</p>
      </div>
    );
  }

  const items = cart?.items || [];
  const bookTotal = items.reduce((sum: number, item: any) => sum + (item.listing?.askingPrice || 0), 0);
  const shippingFee = items.length > 0 ? 50 : 0;
  // Preview estimate — the authoritative 5% fee is computed server-side at order creation.
  const platformFee = items.length > 0 ? Math.round(bookTotal * 0.05 * 100) / 100 : 0;
  const totalAmount = bookTotal + shippingFee + platformFee;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
          Your Shopping Cart
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Review second-hand book listings before proceeding to authoritative checkout.
        </p>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items List */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item: any) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm"
              >
                <div className="flex items-center space-x-4">
                  <img
                    src={item.listing?.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'}
                    alt={item.listing?.book?.title}
                    className="w-14 h-16 object-cover rounded-xl"
                  />
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-ivory">{item.listing?.book?.title}</h3>
                    <p className="text-xs text-slate-400">Seller: {item.listing?.seller?.name}</p>
                    <span className="text-[10px] font-bold text-sage bg-sage/10 px-2 py-0.5 rounded mt-1 inline-block">
                      Condition: {item.listing?.condition}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <span className="font-heading font-black text-lg text-slate-900 dark:text-ivory">
                    ₹{item.listing?.askingPrice}
                  </span>
                  <button
                    onClick={() => handleRemove(item.listingId)}
                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Authoritative Order Summary */}
          <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 h-fit">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Authoritative Summary</h3>

            <div className="space-y-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Book Total</span>
                <span className="font-bold">₹{bookTotal}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>3PL Courier Delivery Fee</span>
                <span className="font-bold">₹{shippingFee}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Platform Escrow Protection (5% of item price)</span>
                <span className="font-bold">₹{platformFee}</span>
              </div>
            </div>

            <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-ivory pt-2">
              <span>Total Payable</span>
              <span className="font-heading text-xl text-gold">₹{totalAmount}</span>
            </div>

            {items.length === 1 && (
              <button
                onClick={() => {
                  api.post('/orders/direct', { listingId: items[0].listingId })
                    .then((res: any) => navigate(`/checkout?orderId=${res.data.id}`))
                    .catch(() => {});
                }}
                className="w-full py-3.5 rounded-xl font-bold text-xs bg-gold text-obsidian hover:bg-amber-400 shadow-goldGlow transition flex items-center justify-center space-x-2"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800">
          <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Your shopping cart is currently empty.</p>
          <Link to="/books" className="text-xs font-bold text-gold hover:underline mt-2 inline-block">
            Browse books to add items →
          </Link>
        </div>
      )}
    </div>
  );
};
