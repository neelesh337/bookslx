import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ShieldCheck, Truck, ArrowRightLeft, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-obsidian border-t border-slate-800 text-slate-400 text-sm mt-16">
      {/* Platform Core Pillars */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-4 gap-6 border-b border-slate-800/80">
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-graphite text-gold border border-gold/20">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-bold text-ivory text-sm">Direct Negotiation</h4>
            <p className="text-xs text-slate-400 mt-0.5">Make offers and counter-offers directly with readers.</p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-graphite text-gold border border-gold/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-bold text-ivory text-sm">Payment Protection</h4>
            <p className="text-xs text-slate-400 mt-0.5">Platform holds funds until delivery confirmation.</p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-graphite text-gold border border-gold/20">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-bold text-ivory text-sm">3PL Doorstep Delivery</h4>
            <p className="text-xs text-slate-400 mt-0.5">Couriers pick up from seller and deliver to buyer.</p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-graphite text-gold border border-gold/20">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-bold text-ivory text-sm">Dispute Mediation</h4>
            <p className="text-xs text-slate-400 mt-0.5">Fair admin resolution for unfulfilled or damaged orders.</p>
          </div>
        </div>
      </div>

      {/* Links & Brand */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center space-x-2 mb-3">
            <BookOpen className="w-6 h-6 text-gold" />
            <span className="font-heading text-lg font-bold text-ivory">BooksLX</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            The trusted peer-to-peer marketplace exclusively for second-hand books. Find textbook deals, rare novels, and academic resources directly from fellow readers.
          </p>
        </div>

        <div>
          <h5 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Categories</h5>
          <ul className="space-y-1.5 text-xs">
            <li><Link to="/categories/Engineering" className="hover:text-gold transition">Engineering & Tech</Link></li>
            <li><Link to="/categories/Programming" className="hover:text-gold transition">Programming & CS</Link></li>
            <li><Link to="/categories/Competitive Exams" className="hover:text-gold transition">Competitive Exams (GATE/CAT)</Link></li>
            <li><Link to="/categories/Novels" className="hover:text-gold transition">Fiction & Novels</Link></li>
            <li><Link to="/categories/Self Help" className="hover:text-gold transition">Self Help & Business</Link></li>
          </ul>
        </div>

        <div>
          <h5 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Platform</h5>
          <ul className="space-y-1.5 text-xs">
            <li><Link to="/books" className="hover:text-gold transition">Browse All Books</Link></li>
            <li><Link to="/sell/create" className="hover:text-gold transition">Sell Second-Hand Book</Link></li>
            <li><Link to="/offers" className="hover:text-gold transition">Active Offers</Link></li>
            <li><Link to="/profile/orders" className="hover:text-gold transition">Order History</Link></li>
          </ul>
        </div>

        <div>
          <h5 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Trust & Security</h5>
          <p className="text-xs text-slate-400 leading-relaxed">
            BooksLX does not operate physical warehouses or delivery fleets. All shipments are fulfilled by verified 3PL courier partners with end-to-end tracking.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 border-t border-slate-800/60 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} BooksLX Inc. All rights reserved. Built for Readers & Students.
      </div>
    </footer>
  );
};
