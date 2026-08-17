import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { onRealtime } from '../api/realtime';
import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingBag,
  Star,
  PlusCircle,
  Plus,
  Heart,
  Bell,
  CheckCheck,
  BellRing,
  MessageSquare,
  Truck,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';

type Tab = 'selling' | 'orders' | 'wishlist' | 'notifications' | 'addresses' | 'reviews';

const TAB_FROM_PATH: Record<string, Tab> = {
  '/profile': 'selling',
  '/profile/orders': 'orders',
  '/wishlist': 'wishlist',
  '/notifications': 'notifications',
};

export const UserProfile: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>(TAB_FROM_PATH[location.pathname] || 'selling');

  const [listings, setListings] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: 'Home',
    name: user?.name || '',
    phone: user?.phone || '9876543210',
    line1: '',
    line2: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    isDefault: true,
    isPickupAddress: true,
  });

  // Keep the active tab in sync with the route (e.g. /wishlist, /notifications)
  useEffect(() => {
    const tab = TAB_FROM_PATH[location.pathname];
    if (tab) setActiveTab(tab);
  }, [location.pathname]);

  const fetchWishlist = () => {
    api.get('/wishlist').then((res: any) => setWishlist(res.data || [])).catch(() => {});
  };

  const fetchNotifications = () => {
    api.get('/notifications').then((res: any) => setNotifications(res.data || [])).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    Promise.all([
      api.get('/books/seller/listings'),
      api.get('/orders'),
      api.get('/auth/addresses'),
      api.get('/reviews/user'),
    ])
      .then(([listingsRes, ordersRes, addrsRes, reviewsRes]: any) => {
        setListings(listingsRes.data || []);
        setOrders(ordersRes.data || []);
        setAddresses(addrsRes.data || []);
        setReviews(reviewsRes.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetchWishlist();
    fetchNotifications();
  }, [user]);

  // Live: any realtime event (offer/counter/accept) refreshes notifications
  // immediately. SSE may be blocked by reverse proxies on deployed builds, so
  // polling below serves as a safety net.
  useEffect(() => {
    return onRealtime(() => {
      fetchNotifications();
    });
  }, []);

  // Polling fallback — refresh notifications every 15 seconds so the buyer
  // sees counter-offers even when SSE is buffered by Render's proxy.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => fetchNotifications(), 15000);
    return () => clearInterval(t);
  }, [user]);

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/auth/addresses', newAddress);
      setShowAddressModal(false);
      const res: any = await api.get('/auth/addresses');
      setAddresses(res.data || []);
      refreshUser();
    } catch (e) {}
  };

  const handleRemoveWishlist = async (listingId: string) => {
    try {
      await api.post('/wishlist/toggle', { listingId });
      fetchWishlist();
    } catch (e) {}
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      fetchNotifications();
    } catch (e) {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      fetchNotifications();
    } catch (e) {}
  };

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const notificationIcon = (type: string) => {
    if (type === 'OFFER_RECEIVED' || type === 'COUNTER_OFFER' || type === 'OFFER_ACCEPTED') {
      return <MessageSquare className="w-4 h-4 text-gold" />;
    }
    if (type.includes('ORDER') || type === 'PAYMENT_SUCCESS') {
      return <ShoppingBag className="w-4 h-4 text-sage" />;
    }
    if (type.includes('SHIPMENT')) {
      return <Truck className="w-4 h-4 text-sky-500" />;
    }
    if (type.includes('DISPUTE')) {
      return <AlertTriangle className="w-4 h-4 text-rose-500" />;
    }
    if (type === 'DELIVERED' || type === 'REVIEW_REQUEST') {
      return <Star className="w-4 h-4 text-gold" />;
    }
    return <Bell className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Profile Summary Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <img
            src={user.profileImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
            alt={user.name}
            className="w-16 h-16 rounded-2xl object-cover border-2 border-gold shadow-goldGlow"
          />
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory flex items-center space-x-2">
              <span>{user.name}</span>
              <span className="text-[10px] font-extrabold bg-gold/10 text-gold px-2 py-0.5 rounded border border-gold/30 uppercase">
                {user.role}
              </span>
            </h1>
            <p className="text-xs text-slate-500">{user.email} • {user.phone || 'No phone'}</p>
            <div className="flex items-center space-x-4 text-xs font-bold text-gold mt-1">
              <span>★ {user.rating} Rating</span>
              <span>•</span>
              <span>{user.totalSales} Sales</span>
              <span>•</span>
              <span>{user.totalPurchases} Purchases</span>
            </div>
          </div>
        </div>

        <Link
          to="/sell/create"
          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gold text-obsidian hover:bg-amber-400 shadow-goldGlow transition flex items-center space-x-1.5"
        >
          <PlusCircle className="w-4 h-4" />
          <span>List Book to Sell</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('selling')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeTab === 'selling' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          Selling Listings ({listings.length})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeTab === 'orders' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          Orders & Purchases ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('wishlist')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 ${
            activeTab === 'wishlist' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          <Heart className="w-3.5 h-3.5" />
          <span>Wishlist ({wishlist.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 ${
            activeTab === 'notifications' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Notifications {unreadCount > 0 && <span className="bg-brandError text-white text-[9px] rounded-full w-4 h-4 inline-flex items-center justify-center ml-0.5">{unreadCount}</span>}</span>
        </button>
        <button
          onClick={() => setActiveTab('addresses')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeTab === 'addresses' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          Addresses ({addresses.length})
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeTab === 'reviews' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          Reviews Received ({reviews.length})
        </button>
      </div>

      {/* Tab: Selling Listings */}
      {activeTab === 'selling' && (
        <div className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-52 rounded-2xl bg-slate-200 dark:bg-graphite animate-pulse" />
              ))}
            </div>
          ) : listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((l) => (
                <div key={l.id} className="p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex space-x-3">
                    <img src={l.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'} alt="Cover" className="w-14 h-16 object-cover rounded-xl" />
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-ivory line-clamp-1">{l.book?.title}</h4>
                      <p className="text-[11px] text-slate-400">Asking: ₹{l.askingPrice}</p>
                      <span className="text-[10px] font-bold text-sage bg-sage/10 px-2 py-0.5 rounded mt-1 inline-block">
                        Status: {l.status}
                      </span>
                    </div>
                  </div>
                  <Link to={`/books/${l.id}`} className="block text-center py-2 text-xs font-bold bg-slate-100 dark:bg-obsidian text-gold rounded-xl hover:underline">
                    View Listing Page →
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              You haven't listed any books for sale yet.
              <Link to="/sell/create" className="text-gold font-bold hover:underline ml-1">List your first book →</Link>
            </div>
          )}
        </div>
      )}

      {/* Tab: Orders */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-200 dark:bg-graphite animate-pulse" />)}</div>
          ) : orders.length > 0 ? (
            <div className="space-y-3">
              {orders.map((o) => (
                <Link
                  key={o.id}
                  to={`/orders/${o.id}`}
                  className="block p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 hover:border-gold/50 transition"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-ivory">#{o.orderNumber} — {o.listing?.book?.title}</span>
                      <p className="text-[11px] text-slate-400">Total: ₹{o.totalAmount} • {new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-gold uppercase">{o.status.replace(/_/g, ' ')}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              No orders found.
              <Link to="/books" className="text-gold font-bold hover:underline ml-1">Browse books to buy →</Link>
            </div>
          )}
        </div>
      )}

      {/* Tab: Wishlist */}
      {activeTab === 'wishlist' && (
        <div className="space-y-4">
          {wishlist.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {wishlist.map((l) => (
                <div key={l.id} className="p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex space-x-3">
                    <img src={l.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'} alt="Cover" className="w-14 h-16 object-cover rounded-xl" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-ivory line-clamp-1">{l.book?.title}</h4>
                      <p className="text-[11px] text-slate-400 line-clamp-1">by {l.book?.author}</p>
                      <p className="text-xs font-extrabold text-gold mt-1">₹{l.askingPrice}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Link to={`/books/${l.id}`} className="flex-1 text-center py-2 text-xs font-bold bg-slate-100 dark:bg-obsidian text-gold rounded-xl hover:underline">
                      View →
                    </Link>
                    <button
                      onClick={() => handleRemoveWishlist(l.id)}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition"
                      title="Remove from wishlist"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800">
              <Heart className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Your wishlist is empty.</p>
              <Link to="/books" className="text-xs font-bold text-gold hover:underline mt-2 inline-block">
                Save books you love → 
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tab: Notifications */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-ivory flex items-center space-x-2">
              <BellRing className="w-4 h-4 text-gold" />
              <span>All Notifications</span>
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="px-3 py-1.5 rounded-xl bg-gold/10 text-gold border border-gold/30 font-bold text-xs flex items-center space-x-1.5 hover:bg-gold hover:text-obsidian transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>

          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 rounded-2xl border transition ${
                    n.isRead
                      ? 'bg-white dark:bg-graphite border-slate-200 dark:border-slate-800 opacity-70'
                      : 'bg-gold/5 dark:bg-graphite border-gold/40 shadow-sm'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-xl flex-shrink-0 ${n.isRead ? 'bg-slate-100 dark:bg-obsidian' : 'bg-gold/10'}`}>
                      {notificationIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-ivory">{n.title}</h4>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {new Date(n.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                      <div className="flex items-center space-x-3 mt-2">
                        {n.link && (
                          <Link to={n.link} className="text-[11px] font-bold text-gold hover:underline">
                            View Details →
                          </Link>
                        )}
                        {!n.isRead && (
                          <button
                            onClick={() => handleMarkNotificationRead(n.id)}
                            className="text-[11px] font-semibold text-slate-400 hover:text-gold transition"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-gold mt-1.5 flex-shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800">
              <Bell className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No notifications yet.</p>
              <p className="text-xs text-slate-400 mt-1">Offers, orders, and shipment updates will appear here.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Addresses */}
      {activeTab === 'addresses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-900 dark:text-ivory">Saved Addresses</h3>
            <button
              onClick={() => setShowAddressModal(true)}
              className="px-3 py-1.5 rounded-xl bg-gold text-obsidian font-bold text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Address</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {addresses.map((a) => (
              <div key={a.id} className="p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between font-bold text-slate-900 dark:text-ivory">
                  <span>{a.name} ({a.label})</span>
                  <div className="flex items-center space-x-1.5">
                    {a.isPickupAddress && <span className="text-[9px] text-sage font-bold uppercase">Pickup</span>}
                    {a.isDefault && <span className="text-gold text-[10px]">DEFAULT</span>}
                  </div>
                </div>
                <p className="text-slate-400">{a.line1}, {a.city}, {a.state} - {a.postalCode}</p>
                <p className="text-slate-500">Phone: {a.phone}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Reviews */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-900 dark:text-ivory">From: {r.reviewer?.name}</span>
                    <span className="text-gold font-bold">★ {r.rating} / 5</span>
                  </div>
                  {r.order?.listing?.book?.title && (
                    <p className="text-[10px] text-slate-400">For: {r.order.listing.book.title}</p>
                  )}
                  <p className="text-slate-400 italic">"{r.comment}"</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              No reviews received yet.
            </div>
          )}
        </div>
      )}

      {/* Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-premium space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Add New Address</h3>
            <form onSubmit={handleAddAddress} className="space-y-3 text-xs">
              <input type="text" placeholder="Address Label (Home / Work)" value={newAddress.label} onChange={(e) => setNewAddress({...newAddress, label: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800" />
              <input type="text" placeholder="Full Name" value={newAddress.name} onChange={(e) => setNewAddress({...newAddress, name: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800" />
              <input type="text" placeholder="Phone Number" value={newAddress.phone} onChange={(e) => setNewAddress({...newAddress, phone: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800" />
              <input type="text" placeholder="Address Line 1" value={newAddress.line1} onChange={(e) => setNewAddress({...newAddress, line1: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="City" value={newAddress.city} onChange={(e) => setNewAddress({...newAddress, city: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800" />
                <input type="text" placeholder="Postal Code" value={newAddress.postalCode} onChange={(e) => setNewAddress({...newAddress, postalCode: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800" />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl font-bold bg-gold text-obsidian">Save Address</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
