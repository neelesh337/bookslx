import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { ShieldCheck, Gavel } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'orders' | 'disputes'>('overview');
  const [loading, setLoading] = useState(true);

  // Dispute resolution modal state
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [resolutionOutcome, setResolutionOutcome] = useState<'REFUND' | 'RELEASE_FUNDS'>('REFUND');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchAdminData = () => {
    setLoading(true);
    Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/orders'),
      api.get('/disputes'),
    ])
      .then(([statsRes, usersRes, ordersRes, disputesRes]: any) => {
        setStats(statsRes.data);
        setUsers(usersRes.data || []);
        setOrders(ordersRes.data || []);
        setDisputes(disputesRes.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;
    setProcessing(true);

    try {
      await api.post(`/disputes/${selectedDispute.id}/resolve`, {
        resolutionOutcome,
        resolutionNotes,
      });
      setSelectedDispute(null);
      fetchAdminData();
    } catch (err) {
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500">Loading admin metrics & moderation console...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header */}
      <div className="flex items-center space-x-3">
        <div className="p-3 rounded-2xl bg-gold/10 text-gold border border-gold/30">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
            BooksLX Platform Admin Console
          </h1>
          <p className="text-xs text-slate-500">Real-time marketplace volume, dispute resolution, and listing moderation</p>
        </div>
      </div>

      {/* Stats Cards Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 block font-medium">Gross Market Volume</span>
            <span className="font-heading font-black text-2xl text-gold mt-1 block">₹{stats.grossMarketplaceVolume}</span>
            <span className="text-[10px] text-sage">Total GMV Completed</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 block font-medium">Platform Escrow Revenue</span>
            <span className="font-heading font-black text-2xl text-emerald-500 mt-1 block">₹{stats.totalPlatformRevenue}</span>
            <span className="text-[10px] text-slate-400">5% of item price per order</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 block font-medium">Active Book Listings</span>
            <span className="font-heading font-black text-2xl text-slate-900 dark:text-ivory mt-1 block">{stats.activeListings}</span>
            <span className="text-[10px] text-slate-400">out of {stats.totalListings} total</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-400 block font-medium">Open Disputes</span>
            <span className="font-heading font-black text-2xl text-rose-500 mt-1 block">{stats.openDisputes}</span>
            <span className="text-[10px] text-rose-400">Requires Admin Decision</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeTab === 'overview' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          Dispute Resolution ({disputes.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeTab === 'users' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          Registered Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition ${
            activeTab === 'orders' ? 'bg-gold text-obsidian' : 'text-slate-500 hover:text-slate-900 dark:hover:text-ivory'
          }`}
        >
          Marketplace Orders ({orders.length})
        </button>
      </div>

      {/* Tab 1: Dispute Resolution */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {disputes.length > 0 ? (
            <div className="space-y-4">
              {disputes.map((d) => (
                <div key={d.id} className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                        Dispute Reason: {d.reason}
                      </span>
                      <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory mt-1">
                        Order #{d.order?.orderNumber} — {d.order?.listing?.book?.title}
                      </h3>
                      <p className="text-xs text-slate-400">Raised By: {d.raisedBy?.name} ({d.raisedBy?.email})</p>
                    </div>

                    <button
                      onClick={() => setSelectedDispute(d)}
                      className="px-4 py-2 rounded-xl font-bold text-xs bg-gold text-obsidian hover:bg-amber-400 shadow-goldGlow transition flex items-center space-x-1"
                    >
                      <Gavel className="w-4 h-4" />
                      <span>Judge & Resolve</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-obsidian/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    "{d.description}"
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              No open disputes requiring admin action.
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Users */}
      {activeTab === 'users' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="py-3 px-2">Name</th>
                <th className="py-3 px-2">Email</th>
                <th className="py-3 px-2">Role</th>
                <th className="py-3 px-2">Rating</th>
                <th className="py-3 px-2">Sales</th>
                <th className="py-3 px-2">Purchases</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/60">
                  <td className="py-3 px-2 font-bold text-slate-900 dark:text-ivory">{u.name}</td>
                  <td className="py-3 px-2 text-slate-400">{u.email}</td>
                  <td className="py-3 px-2 font-mono text-[10px] text-gold">{u.role}</td>
                  <td className="py-3 px-2 text-gold font-bold">★ {u.rating}</td>
                  <td className="py-3 px-2">{u.totalSales}</td>
                  <td className="py-3 px-2">{u.totalPurchases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Orders */}
      {activeTab === 'orders' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="py-3 px-2">Order #</th>
                <th className="py-3 px-2">Buyer</th>
                <th className="py-3 px-2">Seller</th>
                <th className="py-3 px-2">Total Amount</th>
                <th className="py-3 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 dark:border-slate-800/60">
                  <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-ivory">{o.orderNumber}</td>
                  <td className="py-3 px-2">{o.buyer?.name}</td>
                  <td className="py-3 px-2">{o.seller?.name}</td>
                  <td className="py-3 px-2 font-bold text-gold">₹{o.totalAmount}</td>
                  <td className="py-3 px-2 font-bold text-emerald-500">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin Dispute Resolution Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-premium space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Admin Dispute Verdict</h3>
            
            <form onSubmit={handleResolveDispute} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Decision Outcome *</label>
                <select
                  value={resolutionOutcome}
                  onChange={(e) => setResolutionOutcome(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800"
                >
                  <option value="REFUND">Approve Full Refund to Buyer</option>
                  <option value="RELEASE_FUNDS">Release Funds to Seller (Reject Claim)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Resolution Notes *</label>
                <textarea
                  rows={3}
                  placeholder="Explain why this decision was reached..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDispute(null)}
                  className="flex-1 py-2.5 rounded-xl font-medium bg-slate-100 dark:bg-obsidian"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-gold text-obsidian shadow-goldGlow"
                >
                  Confirm Verdict
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
