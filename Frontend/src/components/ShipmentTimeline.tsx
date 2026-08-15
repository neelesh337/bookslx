import React from 'react';
import { Truck, CheckCircle2, MapPin } from 'lucide-react';

interface ShipmentTimelineProps {
  orderStatus: string;
  shipment?: {
    courierName: string;
    trackingNumber: string;
    trackingUrl: string;
    status: string;
    estDeliveryDate: string;
    events?: Array<{
      status: string;
      description: string;
      location?: string;
      timestamp: string;
    }>;
  };
}

export const ShipmentTimeline: React.FC<ShipmentTimelineProps> = ({ orderStatus, shipment }) => {
  const steps = [
    { key: 'PAYMENT_PROTECTED', label: 'Payment Protected', desc: 'Platform escrow holds funds' },
    { key: 'AWAITING_SHIPMENT', label: 'Awaiting Shipment', desc: 'Seller preparing book package' },
    { key: 'SHIPPED', label: 'Shipped', desc: 'Courier picked up parcel' },
    { key: 'IN_TRANSIT', label: 'In Transit', desc: 'Between logistics sorting hubs' },
    { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', desc: 'Agent delivering to address' },
    { key: 'DELIVERED', label: 'Delivered', desc: 'Parcel received by buyer' },
    { key: 'COMPLETED', label: 'Completed', desc: 'Funds released to seller' },
  ];

  const getStepIndex = (status: string) => {
    if (status === 'CANCELLED' || status === 'REFUNDED') return -1;
    const idx = steps.findIndex((s) => s.key === status);
    return idx >= 0 ? idx : 0;
  };

  const currentIndex = getStepIndex(orderStatus);

  return (
    <div className="space-y-6">
      {/* Stepper Timeline */}
      <div className="p-6 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="font-heading font-bold text-base text-slate-900 dark:text-ivory mb-6 flex items-center space-x-2">
          <Truck className="w-5 h-5 text-gold" />
          <span>Shipment & Order Progress</span>
        </h3>

        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {steps.map((step, idx) => {
            const isDone = idx <= currentIndex;
            const isCurrent = idx === currentIndex;

            return (
              <div key={step.key} className="flex md:flex-col items-center flex-1 z-10 w-full md:w-auto">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border transition-colors ${
                    isDone
                      ? 'bg-gold text-obsidian border-gold shadow-goldGlow'
                      : 'bg-slate-100 dark:bg-obsidian text-slate-400 border-slate-300 dark:border-slate-800'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                </div>
                <div className="ml-3 md:ml-0 md:mt-2 md:text-center">
                  <p className={`text-xs font-bold ${isCurrent ? 'text-gold' : isDone ? 'text-slate-800 dark:text-ivory' : 'text-slate-400'}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-slate-400 hidden lg:block">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Courier & Tracking Details Card */}
      {shipment && (
        <div className="p-6 rounded-2xl bg-slate-900 text-ivory border border-gold/30 shadow-premium space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-sage block">3PL Courier Service</span>
              <span className="font-heading text-lg font-extrabold text-gold">{shipment.courierName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Tracking ID</span>
              <span className="font-mono text-sm font-bold text-ivory">{shipment.trackingNumber}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Est. Delivery</span>
              <span className="text-xs font-semibold text-emerald-400">
                {new Date(shipment.estDeliveryDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <a
              href={shipment.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl bg-gold text-obsidian font-bold text-xs hover:bg-amber-400 transition"
            >
              Live Tracking on {shipment.courierName} ↗
            </a>
          </div>

          {/* Append-only Shipment Event Logs */}
          {shipment.events && shipment.events.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Live Tracking History</h4>
              <div className="space-y-3">
                {shipment.events.map((evt, i) => (
                  <div key={i} className="flex items-start space-x-3 text-xs">
                    <div className="p-1 rounded bg-slate-800 text-gold mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{evt.status.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(evt.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">{evt.description}</p>
                      {evt.location && <span className="text-[10px] text-sage font-medium">Location: {evt.location}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
