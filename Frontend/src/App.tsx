import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';

import { Home } from './pages/Home';
import { BrowseBooks } from './pages/BrowseBooks';
import { BookDetails } from './pages/BookDetails';
import { ListingWizard } from './pages/ListingWizard';
import { OfferHub } from './pages/OfferHub';
import { OfferDetails } from './pages/OfferDetails';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderDetail } from './pages/OrderDetail';
import { DisputeHub } from './pages/DisputeHub';
import { UserProfile } from './pages/UserProfile';
import { AdminDashboard } from './pages/AdminDashboard';
import { AuthPage } from './pages/AuthPage';
import { EmailVerificationPage } from './pages/EmailVerificationPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen flex flex-col bg-ivory dark:bg-obsidian text-slate-900 dark:text-ivory transition-colors">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/books" element={<BrowseBooks />} />
                <Route path="/categories/:category" element={<BrowseBooks />} />
                <Route path="/books/:id" element={<BookDetails />} />
                <Route path="/sell/create" element={<ListingWizard />} />
                <Route path="/offers" element={<OfferHub />} />
                <Route path="/offers/:id" element={<OfferDetails />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/orders/:id" element={<OrderDetail />} />
                <Route path="/profile/orders" element={<UserProfile />} />
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/wishlist" element={<UserProfile />} />
                <Route path="/notifications" element={<UserProfile />} />
                <Route path="/disputes" element={<DisputeHub />} />
                <Route path="/disputes/new" element={<DisputeHub />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/login" element={<AuthPage />} />
                <Route path="/signup" element={<AuthPage />} />
                <Route path="/verify-email" element={<EmailVerificationPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
};
