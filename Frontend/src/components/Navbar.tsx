import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  BookOpen,
  Search,
  ShoppingCart,
  Heart,
  Bell,
  User as UserIcon,
  Sun,
  Moon,
  PlusCircle,
  ShieldCheck,
  LogOut,
  Tag,
  ArrowRightLeft,
  ChevronDown
} from 'lucide-react';
import { api } from '../api/client';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [cartCount, setCartCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user) {
      api.get('/cart').then((res: any) => setCartCount(res.data?.totalCount || 0)).catch(() => {});
      api.get('/notifications').then((res: any) => {
        const unread = (res.data || []).filter((n: any) => !n.isRead).length;
        setUnreadNotifications(unread);
      }).catch(() => {});
    }
  }, [user, location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/books?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-graphite/80 bg-ivory/90 dark:bg-obsidian/90 backdrop-blur-md transition-colors">
      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sage via-forest to-obsidian border border-gold/40 flex items-center justify-center shadow-goldGlow group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5 text-gold" />
          </div>
          <div>
            <span className="font-heading text-xl font-extrabold tracking-tight text-slate-900 dark:text-ivory">
              Books<span className="text-gold">LX</span>
            </span>
            <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-widest text-sage block -mt-1">
              Peer Marketplace
            </span>
          </div>
        </Link>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md relative hidden md:block">
          <input
            type="text"
            placeholder="Search by Title, Author, ISBN, Category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-slate-100 dark:bg-graphite border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory placeholder-slate-400 focus:outline-none focus:border-gold transition"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </form>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          <Link
            to="/sell/create"
            className="hidden sm:flex items-center space-x-1.5 bg-gradient-to-r from-sage to-forest text-ivory px-4 py-2 rounded-xl text-sm font-medium hover:brightness-110 shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4 text-gold" />
            <span>Sell Book</span>
          </Link>

          {/* Theme Selector */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-xl bg-slate-100 dark:bg-graphite text-slate-600 dark:text-slate-300 hover:text-gold transition"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {user ? (
            <>
              {/* Wishlist */}
              <Link
                to="/wishlist"
                className="p-2 rounded-xl bg-slate-100 dark:bg-graphite text-slate-600 dark:text-slate-300 hover:text-gold transition"
                title="Wishlist"
              >
                <Heart className="w-5 h-5" />
              </Link>

              {/* Cart */}
              <Link
                to="/cart"
                className="p-2 rounded-xl bg-slate-100 dark:bg-graphite text-slate-600 dark:text-slate-300 hover:text-gold transition relative"
                title="Cart"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-gold text-obsidian text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>

              {/* Notifications */}
              <Link
                to="/notifications"
                className="p-2 rounded-xl bg-slate-100 dark:bg-graphite text-slate-600 dark:text-slate-300 hover:text-gold transition relative"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brandError text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </Link>

              {/* User Menu Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-2 p-1.5 rounded-xl bg-slate-100 dark:bg-graphite hover:border-gold/50 border border-transparent transition"
                >
                  <img
                    src={user.profileImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                    alt={user.name}
                    className="w-8 h-8 rounded-lg object-cover border border-gold/30"
                  />
                  <span className="hidden lg:inline-block text-xs font-semibold text-slate-800 dark:text-ivory max-w-[100px] truncate">
                    {user.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showProfileMenu && (
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-premium py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                    onMouseLeave={() => setShowProfileMenu(false)}
                  >
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-bold text-slate-900 dark:text-ivory truncate">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      <div className="mt-1 flex items-center text-xs text-gold font-medium">
                        ★ {user.rating} ({user.totalSales} sales)
                      </div>
                    </div>

                    <Link
                      to="/profile"
                      className="flex items-center space-x-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-obsidian/50 transition"
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <UserIcon className="w-4 h-4 text-sage" />
                      <span>My Profile</span>
                    </Link>

                    <Link
                      to="/offers"
                      className="flex items-center space-x-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-obsidian/50 transition"
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <ArrowRightLeft className="w-4 h-4 text-gold" />
                      <span>Offers & Negotiations</span>
                    </Link>

                    <Link
                      to="/profile/orders"
                      className="flex items-center space-x-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-obsidian/50 transition"
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <Tag className="w-4 h-4 text-sage" />
                      <span>Orders & Purchases</span>
                    </Link>

                    {user.role === 'ADMIN' && (
                      <Link
                        to="/admin"
                        className="flex items-center space-x-2 px-4 py-2 text-sm text-gold font-semibold hover:bg-slate-100 dark:hover:bg-obsidian/50 transition"
                        onClick={() => setShowProfileMenu(false)}
                      >
                        <ShieldCheck className="w-4 h-4 text-gold" />
                        <span>Admin Dashboard</span>
                      </Link>
                    )}

                    <div className="border-t border-slate-100 dark:border-slate-800 mt-1">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          logout();
                          navigate('/login');
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-brandError hover:bg-slate-100 dark:hover:bg-obsidian/50 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center space-x-2">
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-ivory hover:text-gold transition"
              >
                Log In
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-gold text-obsidian hover:bg-amber-400 transition"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
