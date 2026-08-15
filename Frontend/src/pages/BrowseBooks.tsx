import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { BookCard } from '../components/BookCard';
import { OfferModal } from '../components/OfferModal';
import { Search, Filter, ArrowUpDown } from 'lucide-react';

export const BrowseBooks: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get('query') || '';
  const categoryParam = searchParams.get('category') || '';
  const conditionParam = searchParams.get('condition') || '';
  const sortByParam = searchParams.get('sortBy') || 'newest';

  const [listings, setListings] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [searchQuery, setSearchQuery] = useState(query);
  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [selectedCondition, setSelectedCondition] = useState(conditionParam);
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState(sortByParam);
  const [selectedOfferListing, setSelectedOfferListing] = useState<any>(null);

  useEffect(() => {
    api.get('/books/categories').then((res: any) => setCategories(res.data || [])).catch(() => {});
  }, []);

  const fetchListings = (page = 1) => {
    setLoading(true);

    const params: any = {
      page,
      limit: 12,
      sortBy,
    };

    if (searchQuery.trim()) params.query = searchQuery.trim();
    if (selectedCategory) params.category = selectedCategory;
    if (selectedCondition) params.condition = selectedCondition;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;

    api.get('/books/listings', { params })
      .then((res: any) => {
        setListings(res.data || []);
        setPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchListings(1);
  }, [selectedCategory, selectedCondition, sortBy]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchListings(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
          Second-Hand Book Marketplace
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Browse authentic peer listings, inspect detailed book conditions, and negotiate prices directly.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Filters */}
        <div className="md:col-span-1 p-6 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800/80 space-y-6 h-fit">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-ivory flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gold" />
              <span>Filters</span>
            </h3>
            <button
              onClick={() => {
                setSelectedCategory('');
                setSelectedCondition('');
                setMinPrice('');
                setMaxPrice('');
                setSearchQuery('');
                setSearchParams({});
              }}
              className="text-[11px] text-sage hover:underline"
            >
              Reset All
            </button>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Condition Filter */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Book Condition</label>
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
            >
              <option value="">All Conditions</option>
              <option value="LIKE_NEW">Like New</option>
              <option value="EXCELLENT">Excellent</option>
              <option value="GOOD">Good</option>
              <option value="ACCEPTABLE">Acceptable</option>
              <option value="POOR">Poor</option>
            </select>
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Price Range (₹)</label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
              />
              <span className="text-slate-400 text-xs">-</span>
              <input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
              />
            </div>
            <button
              onClick={() => fetchListings(1)}
              className="w-full mt-2 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-gold hover:text-obsidian transition"
            >
              Apply Price Filter
            </button>
          </div>
        </div>

        {/* Listings Grid Area */}
        <div className="md:col-span-3 space-y-6">
          {/* Top Controls: Search + Sort */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800/80">
            <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md flex items-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search Title, Author, ISBN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-l-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 border-r-0 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold rounded-r-xl bg-gold text-obsidian hover:bg-amber-400 transition flex-shrink-0"
              >
                Search
              </button>
            </form>

            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <ArrowUpDown className="w-4 h-4 text-gold" />
              <span>Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory font-semibold focus:outline-none"
              >
                <option value="newest">Newest Listed</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="popular">Most Offers</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-80 rounded-2xl bg-slate-200 dark:bg-graphite animate-pulse" />
              ))}
            </div>
          ) : listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((listing) => (
                <BookCard
                  key={listing.id}
                  listing={listing}
                  onMakeOffer={(l) => setSelectedOfferListing(l)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white dark:bg-graphite rounded-2xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No book listings match your filter criteria.</p>
              <button
                onClick={() => {
                  setSelectedCategory('');
                  setSelectedCondition('');
                  setSearchQuery('');
                  fetchListings(1);
                }}
                className="mt-3 text-xs font-bold text-gold hover:underline"
              >
                Clear filters and show all books
              </button>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2 pt-6">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => fetchListings(p)}
                  className={`w-9 h-9 rounded-xl font-bold text-xs transition ${
                    pagination.page === p
                      ? 'bg-gold text-obsidian shadow-goldGlow'
                      : 'bg-white dark:bg-graphite text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-gold'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Offer Modal */}
      {selectedOfferListing && (
        <OfferModal
          listing={selectedOfferListing}
          isOpen={!!selectedOfferListing}
          onClose={() => setSelectedOfferListing(null)}
        />
      )}
    </div>
  );
};
