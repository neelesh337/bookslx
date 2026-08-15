import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ShipmentTimeline } from '../components/ShipmentTimeline';
import {
  Truck,
  CheckCircle2,
  AlertTriangle,
  Star,
  XCircle,
  ExternalLink
} from 'lucide-react';

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  // Cancel & refund modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const fetchOrder = () => {
    if (!id) return;
    setLoading(true);
    api.get(`/orders/${id}`)
      .then((res: any) => setOrder(res.data))
      .catch((err) => setError(err.message || 'Failed to load order details'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Loading order status & shipment history...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-ivory">Order Not Found</h2>
        <Link to="/profile/orders" className="text-xs font-bold text-gold hover:underline mt-2 inline-block">
          Return to Orders
        </Link>
      </div>
    );
  }

  const isBuyer = user?.id === order.buyerId;
  const isSeller = user?.id === order.sellerId;

  let deliveryAddr: any = {};
  let pickupAddr: any = {};
  try {
    deliveryAddr = typeof order.deliveryAddressSnapshot === 'string'
      ? JSON.parse(order.deliveryAddressSnapshot)
      : order.deliveryAddressSnapshot;
    pickupAddr = typeof order.pickupAddressSnapshot === 'string'
      ? JSON.parse(order.pickupAddressSnapshot)
      : order.pickupAddressSnapshot;
  } catch (e) {}

  const handleCancelOrder = async () => {
    setProcessing(true);
    setError('');

    try {
      await api.post(`/orders/${id}/cancel`, { reason: cancelReason.trim() || undefined });
      setSuccessMsg(`Order cancelled! Refund of ₹${order.totalAmount} has been returned to you.`);
      setShowCancelModal(false);
      fetchOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order');
    } finally {
      setProcessing(false);
    }
  };

  const handleSellerShip = async () => {
    setProcessing(true);
    setError('');

    try {
      await api.post(`/orders/${id}/ship`);
      setSuccessMsg('Shipment label generated! 3PL Courier dispatch initialized.');
      fetchOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to create shipment');
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteOrder = async () => {
    setProcessing(true);
    setError('');

    try {
      await api.post(`/orders/${id}/complete`);
      setSuccessMsg('Delivery confirmed! Settlement released to seller.');
      fetchOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to complete order');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError('');

    try {
      await api.post('/reviews', {
        orderId: order.id,
        rating,
        comment,
      });
      setSuccessMsg('Review submitted successfully!');
      setShowReviewModal(false);
      fetchOrder();
    } catch (err: any) {
      setError(err.message || 'Failed to submit review');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Order Top Banner */}
      <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-sage">Order Number</span>
              <span className="font-mono text-xs font-bold text-slate-500">#{order.orderNumber}</span>
            </div>
            <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-ivory mt-0.5">
              {order.listing?.book?.title}
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <span
              className={`px-3.5 py-1.5 rounded-xl font-extrabold text-xs tracking-wider uppercase border ${
                order.status === 'COMPLETED'
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                  : order.status === 'CANCELLED' || order.status === 'REFUNDED'
                  ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
              }`}
            >
              Status: {order.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Roles overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-slate-400 block font-medium">Buyer</span>
            <strong className="text-slate-800 dark:text-slate-200">{order.buyer?.name}</strong>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Seller</span>
            <strong className="text-slate-800 dark:text-slate-200">{order.seller?.name}</strong>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Total Amount</span>
            <strong className="text-gold font-bold">₹{order.totalAmount}</strong>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Payment State</span>
            <strong className="text-emerald-500 font-bold">{order.payment?.status || 'PAID'}</strong>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-brandError/10 border border-brandError/30 text-brandError text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-brandSuccess/10 border border-brandSuccess/30 text-brandSuccess text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Interactive Seller / Courier / Buyer Action Toolbar */}
      <div className="p-6 rounded-3xl bg-slate-900 text-ivory border border-gold/30 shadow-premium space-y-4">
        <h3 className="font-heading font-bold text-sm text-gold uppercase tracking-wider">
          Order Action Console
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          {/* Buyer Action: Cancel Order & Refund before shipment */}
          {isBuyer && (order.status === 'AWAITING_SHIPMENT' || order.status === 'PAYMENT_PROTECTED') && (
            <button
              onClick={() => setShowCancelModal(true)}
              disabled={processing}
              className="py-2.5 px-5 rounded-xl font-bold text-xs bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition flex items-center space-x-2 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel Order & Refund</span>
            </button>
          )}

          {/* Seller Action: Ship Order */}
          {isSeller && (order.status === 'AWAITING_SHIPMENT' || order.status === 'PAYMENT_PROTECTED') && (
            <button
              onClick={handleSellerShip}
              disabled={processing}
              className="py-2.5 px-5 rounded-xl font-bold text-xs bg-gold text-obsidian hover:bg-amber-400 shadow-goldGlow transition flex items-center space-x-2 disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              <span>Ship Order Now</span>
            </button>
          )}

          {/* Logistics-owned status: courier updates come from the logistics
              provider — the seller cannot move the shipment status manually. */}
          {order.shipment && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && (
            <a
              href={order.shipment.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-5 rounded-xl font-bold text-xs bg-sky-600 text-white hover:bg-sky-500 shadow-sm transition flex items-center space-x-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Live Tracking — {order.shipment.courierName} ↗</span>
            </a>
          )}

          {/* Buyer Action: Confirm Receipt & Complete Order */}
          {isBuyer && order.status === 'DELIVERED' && (
            <button
              onClick={handleCompleteOrder}
              disabled={processing}
              className="py-2.5 px-5 rounded-xl font-bold text-xs bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm transition flex items-center space-x-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Book Receipt & Release Settlement</span>
            </button>
          )}

          {/* Buyer Action: Submit Review if COMPLETED */}
          {order.status === 'COMPLETED' && (
            <button
              onClick={() => setShowReviewModal(true)}
              className="py-2.5 px-4 rounded-xl font-bold text-xs bg-gold/20 text-gold border border-gold/40 hover:bg-gold hover:text-obsidian transition flex items-center space-x-1.5"
            >
              <Star className="w-4 h-4" />
              <span>Write Review</span>
            </button>
          )}

          {/* Buyer Action: Raise Dispute */}
          {isBuyer && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && (
            <Link
              to={`/disputes/new?orderId=${order.id}`}
              className="py-2.5 px-4 rounded-xl font-semibold text-xs bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition flex items-center space-x-1.5"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Raise Dispute</span>
            </Link>
          )}
        </div>
      </div>

      {/* Shipment Timeline Visualization */}
      <ShipmentTimeline orderStatus={order.status} shipment={order.shipment} />

      {/* Address Snapshots */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Buyer Delivery Address Snapshot</h4>
          <p className="text-sm font-bold text-slate-900 dark:text-ivory">{deliveryAddr.name}</p>
          <p className="text-xs text-slate-500">{deliveryAddr.line1}, {deliveryAddr.city}, {deliveryAddr.state} - {deliveryAddr.postalCode}</p>
          <p className="text-[11px] text-slate-400">Phone: {deliveryAddr.phone}</p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Seller Pickup Address Snapshot</h4>
          <p className="text-sm font-bold text-slate-900 dark:text-ivory">{pickupAddr.name}</p>
          <p className="text-xs text-slate-500">{pickupAddr.line1}, {pickupAddr.city}, {pickupAddr.state} - {pickupAddr.postalCode}</p>
          <p className="text-[11px] text-slate-400">Phone: {pickupAddr.phone}</p>
        </div>
      </div>

      {/* Cancel & Refund Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-premium space-y-4">
            <div className="flex items-center space-x-2">
              <XCircle className="w-6 h-6 text-rose-500" />
              <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Cancel Order & Get Refund?</h3>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <p>
                <strong className="text-rose-500">Order #{order.orderNumber}</strong> is awaiting shipment.
                Cancelling now will refund the full protected amount of{' '}
                <strong className="text-gold">₹{order.totalAmount}</strong> back to you, and the book will be
                relisted for other buyers.
              </p>
              <p className="text-slate-400">This action cannot be undone once the seller ships the order.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Reason (optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Found a better price elsewhere, changed my mind..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-obsidian text-slate-700 dark:text-slate-300"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={processing}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition disabled:opacity-50"
              >
                {processing ? 'Processing Refund...' : 'Cancel & Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-premium space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Submit Review & Rating</h3>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Rating (1 to 5 Stars)</label>
              <div className="flex space-x-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    className={`p-2 rounded-xl text-lg font-bold transition ${
                      rating >= s ? 'bg-gold text-obsidian' : 'bg-slate-100 dark:bg-obsidian text-slate-400'
                    }`}
                  >
                    ★ {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Review Comment</label>
              <textarea
                rows={3}
                placeholder="Share your experience with the book condition, shipping speed, and seller communication..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-obsidian text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={processing}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-gold text-obsidian hover:bg-amber-400 transition disabled:opacity-50"
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
