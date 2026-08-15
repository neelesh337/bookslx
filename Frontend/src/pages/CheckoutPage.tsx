import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, MapPin, CreditCard, CheckCircle2, AlertCircle, Loader2, Plus, X } from 'lucide-react';

/** Lazily loads the Razorpay checkout SDK once. */
let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      if ((window as any).Razorpay) return resolve();
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        razorpayScriptPromise = null;
        reject(new Error('Failed to load the Razorpay checkout. Please check your connection.'));
      };
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

export const CheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [gateway, setGateway] = useState<{ mode: string; env: string }>({ mode: 'mock', env: 'test' });

  // New-address-at-checkout state
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: 'Home',
    name: user?.name || '',
    phone: user?.phone || '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    isDefault: true,
  });

  const resetNewAddress = () => {
    setNewAddress({
      label: 'Home',
      name: user?.name || '',
      phone: user?.phone || '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'India',
      isDefault: true,
    });
  };

  /** Persists the chosen delivery address to the order's snapshot so the seller ships there. */
  const persistDeliveryAddress = async (addressId: string) => {
    try {
      await api.put(`/orders/${orderId}/delivery-address`, { addressId });
    } catch (err: any) {
      setError(err.message || 'Could not save the delivery address for this order.');
    }
  };

  const handleAddressSelect = (addressId: string) => {
    setSelectedAddressId(addressId);
    persistDeliveryAddress(addressId);
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAddress(true);
    setError('');
    try {
      const res: any = await api.post('/auth/addresses', newAddress);
      const created = res?.data;
      const addrRes: any = await api.get('/auth/addresses');
      setAddresses(addrRes.data || []);
      if (created?.id) {
        setSelectedAddressId(created.id);
        await persistDeliveryAddress(created.id);
      }
      setShowAddAddress(false);
      resetNewAddress();
    } catch (err: any) {
      setError(err.message || 'Failed to save the new address.');
    } finally {
      setSavingAddress(false);
    }
  };

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    Promise.all([
      api.get(`/orders/${orderId}`),
      api.get('/auth/addresses'),
      api.get('/payments/config').catch(() => ({ data: { mode: 'mock', env: 'test' } })),
    ])
      .then(([orderRes, addrRes, cfgRes]: any) => {
        setOrder(orderRes.data);
        setGateway(cfgRes.data || { mode: 'mock', env: 'test' });
        const addrs = addrRes.data || [];
        setAddresses(addrs);
        if (addrs.length > 0) {
          setSelectedAddressId(addrs[0].id);
        }
      })
      .catch((err) => setError(err.message || 'Failed to load order for checkout'))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Preparing authoritative order summary...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-ivory">Invalid Checkout Order</h2>
        <Link to="/books" className="text-xs font-bold text-gold hover:underline mt-2 inline-block">
          Return to Marketplace
        </Link>
      </div>
    );
  }

  // Role gate: only the buyer of this order may see the payment UI. A seller (or
  // any other user) who lands on this URL must not be shown the payment form.
  if (user && order.buyerId !== user.id) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <ShieldCheck className="w-10 h-10 text-gold mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-ivory">This Checkout Is Not Yours</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 mb-6">
          Only the buyer of this order can complete the payment here. If you are the seller,
          manage the order from your order page instead.
        </p>
        <div className="flex items-center justify-center space-x-4">
          <Link to="/profile/orders" className="text-xs font-bold text-gold hover:underline">
            View My Orders
          </Link>
          <Link to="/books" className="text-xs font-bold text-gold hover:underline">
            Browse Books
          </Link>
        </div>
      </div>
    );
  }

  // State gate: once the order is no longer awaiting payment (paid, shipped,
  // cancelled, ...) there is nothing to pay — show its status instead of a dead
  // payment form.
  if (user && order.status !== 'PAYMENT_PENDING') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-ivory">
          This Order Is Already {order.status.replace(/_/g, ' ').toLowerCase()}
        </h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 mb-6">No payment is needed for this order.</p>
        <Link to={`/orders/${order.id}`} className="text-xs font-bold text-gold hover:underline">
          View Order Details →
        </Link>
      </div>
    );
  }

  const completePayment = async (payload: {
    simulateFailure?: boolean;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  }) => {
    const res: any = await api.post(`/orders/${orderId}/pay`, {
      ...payload,
      idempotencyKey: `PAY-KEY-${orderId}-${Date.now()}`,
    });

    if (res.success) {
      navigate(`/orders/${orderId}`);
    } else {
      throw new Error('Payment was declined or failed.');
    }
  };

  const handleMockPay = async (simulateFailure = false) => {
    setProcessing(true);
    setError('');
    try {
      await completePayment({ simulateFailure });
      // completePayment navigates away on success; a failed simulation rejects.
    } catch (err: any) {
      setError(err.message || 'Payment processing error');
    } finally {
      setProcessing(false);
    }
  };

  const handleRazorpayPay = async () => {
    setProcessing(true);
    setError('');

    try {
      // 1. Ask the backend for a real Razorpay Order + checkout session
      const session: any = await api.post(`/orders/${orderId}/payment-session`);

      if (session.data?.mode !== 'razorpay') {
        // Keys not configured — gracefully fall back to the mock flow
        await completePayment({});
        return;
      }

      // 2. Load checkout.js and open the in-app modal
      await loadRazorpayScript();
      const RazorpayCtor = (window as any).Razorpay;
      if (!RazorpayCtor) throw new Error('Razorpay checkout is unavailable.');

      const options = {
        key: session.data.keyId,
        amount: session.data.amountPaise, // paise
        currency: 'INR',
        order_id: session.data.rzpOrderId,
        name: 'BooksLX',
        description: `Order #${session.data.orderNumber}`,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: { color: '#b58b3a' },
        modal: { ondismiss: () => setProcessing(false) },
        handler: async (response: any) => {
          try {
            setProcessing(true);
            await completePayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
          } catch (err: any) {
            setError(err.message || 'Payment verification failed.');
            setProcessing(false);
          }
        },
      };

      const rzp = new RazorpayCtor(options);
      rzp.on('payment.failed', (resp: any) => {
        const desc = resp?.error?.description || 'Payment was not completed.';
        setError(`Payment failed: ${desc}`);
        setProcessing(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize payment');
      setProcessing(false);
    }
  };

  const handlePay = () => {
    if (gateway.mode === 'razorpay') {
      handleRazorpayPay();
    } else {
      handleMockPay(false);
    }
  };

  const isRazorpay = gateway.mode === 'razorpay';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 text-xs text-gold font-bold uppercase tracking-wider mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Platform Protected Escrow Checkout</span>
        </div>
        <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
          Order Checkout #{order.orderNumber}
        </h1>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-brandError/10 border border-brandError/30 text-brandError text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Delivery Address & Method */}
        <div className="lg:col-span-2 space-y-6">
          {/* Address Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-gold" />
                <span>Delivery Shipping Address</span>
              </h3>
              {!showAddAddress && (
                <button
                  onClick={() => setShowAddAddress(true)}
                  className="px-3 py-1.5 rounded-xl bg-gold/10 text-gold border border-gold/30 font-bold text-xs flex items-center space-x-1 hover:bg-gold hover:text-obsidian transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Address</span>
                </button>
              )}
            </div>

            {addresses.length > 0 ? (
              <div className="space-y-3">
                {addresses.map((addr) => (
                  <label
                    key={addr.id}
                    className={`block p-4 rounded-2xl border cursor-pointer transition ${
                      selectedAddressId === addr.id
                        ? 'bg-gold/10 border-gold shadow-goldGlow'
                        : 'bg-slate-50 dark:bg-obsidian/60 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="radio"
                        name="address"
                        value={addr.id}
                        checked={selectedAddressId === addr.id}
                        onChange={() => handleAddressSelect(addr.id)}
                        className="text-gold focus:ring-gold"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-ivory">{addr.name} ({addr.label})</p>
                        <p className="text-xs text-slate-400">{addr.line1}, {addr.city}, {addr.state} - {addr.postalCode}</p>
                        <p className="text-[11px] text-slate-500">Phone: {addr.phone}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian/60 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-400">
                No saved addresses yet. Add a delivery address so the seller knows where to ship your book —
                otherwise your profile default will be used.
              </div>
            )}

            {showAddAddress && (
              <form
                onSubmit={handleAddAddress}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900 dark:text-ivory">Add New Delivery Address</p>
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-ivory transition"
                    aria-label="Cancel adding address"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Label (Home / Work)"
                    value={newAddress.label}
                    onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Country"
                    value={newAddress.country}
                    onChange={(e) => setNewAddress({ ...newAddress, country: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                  />
                </div>

                <input
                  type="text"
                  placeholder="Full Name *"
                  required
                  value={newAddress.name}
                  onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                />
                <input
                  type="tel"
                  placeholder="Phone Number *"
                  required
                  value={newAddress.phone}
                  onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                />
                <input
                  type="text"
                  placeholder="Address Line 1 * (House no, street, area)"
                  required
                  value={newAddress.line1}
                  onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                />
                <input
                  type="text"
                  placeholder="Address Line 2 (Optional: landmark, building)"
                  value={newAddress.line2}
                  onChange={(e) => setNewAddress({ ...newAddress, line2: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                />

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="City *"
                    required
                    value={newAddress.city}
                    onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Postal Code *"
                    required
                    value={newAddress.postalCode}
                    onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                  />
                </div>

                <input
                  type="text"
                  placeholder="State *"
                  required
                  value={newAddress.state}
                  onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-graphite border border-slate-300 dark:border-slate-800 focus:border-gold outline-none"
                />

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAddress.isDefault}
                    onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })}
                    className="text-gold focus:ring-gold"
                  />
                  <span className="text-slate-500">Set as my default address</span>
                </label>

                <div className="flex space-x-2 pt-1">
                  <button
                    type="submit"
                    disabled={savingAddress}
                    className="flex-1 py-2.5 rounded-xl font-bold bg-gold text-obsidian hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {savingAddress ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save & Use This Address</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(false)}
                    disabled={savingAddress}
                    className="px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-obsidian text-slate-500 hover:text-slate-900 dark:hover:text-ivory transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Payment Method Option */}
          <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-gold" />
              <span>Payment Gateway</span>
            </h3>

            {isRazorpay ? (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-slate-900 text-ivory border border-gold/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gold">Razorpay {gateway.env === 'test' ? 'TEST' : 'LIVE'} MODE</span>
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">UPI · Cards · NetBanking · Wallets</span>
                  </div>
                  <p className="text-slate-400">
                    You'll be redirected to a secure Razorpay checkout to complete the payment. Funds stay
                    escrowed by BooksLX until delivery is confirmed.
                  </p>
                </div>

                {gateway.env === 'test' && (
                  <div className="p-4 rounded-2xl bg-brandInfo/5 border border-sky-500/20 text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5">
                    <p className="font-bold text-sky-600 dark:text-sky-400 flex items-center space-x-1.5">
                      <span>🔬 Test mode — use a Razorpay test card</span>
                    </p>
                    <p><code className="font-mono bg-slate-100 dark:bg-obsidian px-1.5 py-0.5 rounded">4111 1111 1111 1111</code> · any future expiry · any CVV</p>
                    <p>UPI test: <code className="font-mono bg-slate-100 dark:bg-obsidian px-1.5 py-0.5 rounded">success@razorpay</code></p>
                    <p>OTP is auto-simulated by Razorpay (e.g. <code className="font-mono bg-slate-100 dark:bg-obsidian px-1.5 py-0.5 rounded">1234</code>). No real money moves.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-900 text-ivory border border-gold/30 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gold">Gateway Mode: DEVELOPMENT MOCK MODE</span>
                  <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">PAYMENT_MODE=mock</span>
                </div>
                <p className="text-slate-400">
                  Simulates Razorpay / UPI / NetBanking backend payment protection without real funds.
                  Set <code className="font-mono text-amber-400">PAYMENT_MODE=razorpay</code> in Backend/.env to enable real test-card checkout.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order Summary & Authoritative Totals */}
        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-4 h-fit shadow-sm">
          <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory">Authoritative Breakdown</h3>

          {/* Book item */}
          <div className="flex items-center space-x-3 p-3 rounded-2xl bg-slate-50 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800">
            <img
              src={order.listing?.images?.[0]?.url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'}
              alt={order.listing?.book?.title}
              className="w-12 h-14 object-cover rounded-lg"
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-900 dark:text-ivory truncate">{order.listing?.book?.title}</h4>
              <p className="text-[11px] text-slate-400">Seller: {order.seller?.name}</p>
              <p className="text-xs font-bold text-gold mt-0.5">₹{order.bookPrice}</p>
            </div>
          </div>

          <div className="space-y-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Agreed Book Price</span>
              <span className="font-bold">₹{order.bookPrice}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>3PL Doorstep Delivery Fee</span>
              <span className="font-bold">₹{order.shippingFee}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Platform Escrow Fee</span>
              <span className="font-bold">₹{order.platformFee}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-500">
                <span>Discount</span>
                <span className="font-bold">-₹{order.discount}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-ivory pt-1">
            <span>Total Amount</span>
            <span className="font-heading text-xl text-gold">₹{order.totalAmount}</span>
          </div>

          <div className="pt-2 space-y-2">
            <button
              onClick={handlePay}
              disabled={processing}
              className="w-full py-3.5 rounded-xl font-extrabold text-xs bg-gold text-obsidian hover:bg-amber-400 shadow-goldGlow transition disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isRazorpay ? 'Opening Secure Checkout...' : 'Processing Mock Payment...'}</span>
                </>
              ) : (
                <span>{isRazorpay ? `Pay ₹${order.totalAmount} with Razorpay` : 'Pay & Protect Order (Mock Success)'}</span>
              )}
            </button>

            {!isRazorpay && (
              <button
                onClick={() => handleMockPay(true)}
                disabled={processing}
                className="w-full py-2.5 rounded-xl font-semibold text-xs bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition disabled:opacity-50"
              >
                Simulate Payment Failure
              </button>
            )}
          </div>

          <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-400 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Escrow protected — seller is paid only after delivery is confirmed</span>
          </div>
        </div>
      </div>
    </div>
  );
};
