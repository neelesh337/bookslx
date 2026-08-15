import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { AlertTriangle } from 'lucide-react';

export const DisputeHub: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('orderId') || '';

  const [orderId, setOrderId] = useState(orderIdParam);
  const [reason, setReason] = useState('CONDITION_DIFFERENT');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80');
  const [disputes, setDisputes] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchDisputes = () => {
    api.get('/disputes')
      .then((res: any) => setDisputes(res.data || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchDisputes();
  }, []);

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) {
      setError('Please provide a valid Order ID.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.post('/disputes', {
        orderId,
        reason,
        description,
        evidences: [
          { url: evidenceUrl, description: 'Photo of book condition received' },
        ],
      });
      setDescription('');
      fetchDisputes();
    } catch (err: any) {
      setError(err.message || 'Failed to submit dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
          Dispute & Resolution Center
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Raise issues regarding unreceived books, condition discrepancies, or seller shipping delays for admin investigation.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-brandError/10 border border-brandError/30 text-brandError text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-rose-500" />
          <span>Raise New Dispute</span>
        </h3>

        <form onSubmit={handleSubmitDispute} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Order ID *</label>
              <input
                type="text"
                placeholder="e.g. ord_xxx or ORD-DEMO..."
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                required
                className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Dispute Reason *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
              >
                <option value="BOOK_NOT_RECEIVED">Book Not Received</option>
                <option value="WRONG_BOOK">Wrong Book Received</option>
                <option value="CONDITION_DIFFERENT">Condition Different From Listing</option>
                <option value="DAMAGED_BOOK">Damaged Book</option>
                <option value="SELLER_DID_NOT_SHIP">Seller Did Not Ship</option>
                <option value="OTHER">Other Issue</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Detailed Description *</label>
            <textarea
              rows={3}
              placeholder="Explain clearly what was wrong with the shipment or book received..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Evidence Photo URL</label>
            <input
              type="text"
              placeholder="Direct URL of photo evidence showing damaged or wrong book..."
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="py-3 px-6 rounded-xl font-bold text-xs bg-rose-600 text-white hover:bg-rose-500 transition shadow-sm disabled:opacity-50"
          >
            {submitting ? 'Submitting Dispute...' : 'Submit Dispute for Admin Review'}
          </button>
        </form>
      </div>

      {/* Disputes History */}
      <div className="p-6 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Dispute History</h3>

        {disputes.length > 0 ? (
          <div className="space-y-4">
            {disputes.map((d) => (
              <div key={d.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-900 dark:text-ivory">Dispute Reason: {d.reason.replace(/_/g, ' ')}</span>
                  <span className="text-rose-500 uppercase">{d.status}</span>
                </div>
                <p className="text-slate-500">{d.description}</p>
                {d.resolutionOutcome && (
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                    <strong>Admin Outcome:</strong> {d.resolutionOutcome} — {d.resolutionNotes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No disputes filed.</p>
        )}
      </div>
    </div>
  );
};
