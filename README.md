# BooksLX — Peer-to-Peer Second-Hand Book Marketplace

> 📐 **Architecture:** see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical design — state machines, transaction model, provider abstraction, API surface, and testing strategy.

BooksLX is a full-stack peer-to-peer marketplace exclusively for buying and selling second-hand books. BooksLX operates as a trusted mediator: physical deliveries are handled by 3PL logistics providers, while BooksLX handles marketplace discovery, price negotiation, payment protection (escrow), shipping tracking, dispute mediation, settlement release, and reviews.

Every registered user can perform **both** buying and selling activities within a single account.

---

## 🚀 Technology Stack

### Frontend
- **Framework**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS + Custom Design System
- **Icons**: Lucide React Icons
- **Routing**: React Router v6
- **API Client**: Centralized Axios Client (`frontend/src/api/client.ts`)
- **Theme**: Light / Dark / System Mode Toggle

### Backend
- **Runtime**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Prisma ORM)
- **Security**: bcryptjs password hashing, HTTP-only Cookie / Bearer JWT auth, Rate Limiter
- **Payment Abstraction**: `PaymentProvider` interface — `PAYMENT_MODE=mock` (dev) & real **Razorpay** integration (test/live) with signature-verified checkout + webhooks
- **Logistics Abstraction**: `LogisticsProvider` interface — `LOGISTICS_MODE=mock` (auto delivery simulator) & real **Shiprocket** integration (auth token, shipment creation, tracking webhooks)
- **State Engine**: Authoritative order state machine with Prisma `$transaction` protections

---

## 🎨 Visual Identity & Color System
- **Obsidian Black**: `#0B0D0F` (Dark background)
- **Graphite**: `#171A1D` (Card backgrounds)
- **Smoky White**: `#F5F5F2` (Body text)
- **Warm Ivory**: `#FAF9F6` (Light background)
- **Muted Sage**: `#6F806A` (Educational accents)
- **Antique Gold**: `#C8A96B` (Highlights & rating stars)

---

## 📁 Project Structure

```text
BooksLX/
│
├── backend/
│   ├── src/
│   │   ├── config/         # Database & Env configuration
│   │   ├── controllers/    # Express REST route controllers
│   │   ├── integrations/   # Pluggable Payment & Logistics providers
│   │   │   ├── payment/    # MockPaymentProvider & RazorpayPaymentProvider
│   │   │   └── logistics/  # MockLogisticsProvider & ShiprocketProvider
│   │   ├── middleware/     # Auth, Admin Guard, Rate Limiter, Error Handler
│   │   ├── routes/         # REST API Router endpoints
│   │   ├── services/       # Core business logic & database transactions
│   │   ├── types/          # Express type definitions
│   │   ├── utils/          # Authoritative pricing & HTTP errors
│   │   ├── app.ts          # Express application server
│   │   └── seed.ts         # Rich PostgreSQL seed data script
│   ├── prisma/
│   │   └── schema.prisma   # PostgreSQL schema & audit models
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── api/            # Centralized Axios API client
│   │   ├── components/     # Navbar, Footer, BookCard, OfferModal, ShipmentTimeline
│   │   ├── context/        # AuthContext (with Demo Switcher) & ThemeContext
│   │   ├── pages/          # Home, Browse, BookDetails, ListingWizard, OfferDetails, Cart, Checkout, OrderDetail, DisputeHub, UserProfile, AdminDashboard, AuthPage
│   │   ├── App.tsx         # React Router v6 setup
│   │   └── main.tsx        # React root entry
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
└── README.md
```

---

## 🔑 Demo Accounts & Instant Switcher

The application includes a **Fast Demo Account Switcher Bar** at the top of the navbar for testing complete multi-user workflows:

| Role | Name | Email | Password |
|---|---|---|---|
| **Buyer Demo** | Rahul Sharma | `rahul@bookslx.local` | `user123` |
| **Seller Demo** | Priya Patel | `priya@bookslx.local` | `user123` |
| **Admin Demo** | BooksLX Admin | `admin@bookslx.local` | `admin123` |

---

## 🛠️ Installation & Running Locally

### 1. Backend Setup

```bash
cd backend
npm install

# Push database schema
npx prisma db push

# Populate demo books, listings, offers, shipments, and reviews
npm run seed

# Build TypeScript backend
npm run build

# Start backend server (runs on http://localhost:5000)
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install

# Start Vite dev server (runs on http://localhost:5173)
npm run dev
```

Open your browser at `http://localhost:5173`.

### 3. Enabling Real Razorpay Payments (free, test mode)

BookLX ships with a working **Razorpay** integration. Test mode is **free** and needs **no KYC or business verification** — you only need free test keys.

**Steps required from you (≈5 minutes):**

1. **Create a free Razorpay account** → https://dashboard.razorpay.com (sign up with email; no KYC needed for test mode).
2. **Get your test keys** → Dashboard → *Settings → API Keys* → **Generate Key**. This gives you a `Key ID` (starts with `rzp_test_`) and a `Key Secret`.
3. **Paste them into `backend/.env`**:

   ```bash
   PAYMENT_MODE=razorpay
   PAYMENT_ENV=test
   RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxxxxx"
   RAZORPAY_KEY_SECRET="your_key_secret"
   ```

4. **Restart the backend** (`npm run dev`) — the boot log will show `💳 Payment Mode: [RAZORPAY]`.
5. (Optional, for webhook-based confirmations in production) Set `RAZORPAY_WEBHOOK_SECRET` and register the webhook URL `https://<your-host>/api/payments/webhook/razorpay` for the `payment.captured` + `order.paid` events in the Razorpay dashboard. The checkout flow works without a webhook — the in-app modal is confirmed by server-side signature verification.

**Try it with test cards** (from the checkout page):

- Card: `4111 1111 1111 1111` · any future expiry · any CVV · OTP `1234` (auto-simulated)
- UPI: `success@razorpay`

No real money moves in test mode. When you're ready for live payments, set `PAYMENT_ENV=live`, paste your live keys, and complete Razorpay's KYC.

If `PAYMENT_MODE=razorpay` is set but keys are missing, the server **falls back to mock** with a warning — nothing breaks.

### 4. Running Tests

Backend unit + integration tests run with **Vitest** against an isolated SQLite copy of the schema — the real `prisma/dev.db` is never touched.

```bash
cd backend
npm test          # run once
npm run test:watch
```

---

## 🔄 Complete End-to-End Golden Path Workflow

1. **User Sign Up / Login**: Log in as `Rahul` (Buyer) using the top Demo Switcher.
2. **Browse & Search**: Search for *"Clean Code"* or filter by condition *"EXCELLENT"*.
3. **Make Offer (Negotiation)**: Click **Make Offer** on Priya's *Clean Code* listing and offer ₹350.
4. **Seller Counter-Offer**: Click **Priya (Seller)** on the Demo Switcher. Open the offer notification and send a counter-offer of ₹400 with a note.
5. **Buyer Acceptance & Reservation**: Switch back to **Rahul**. Accept the ₹400 counter-offer. The system performs a `$transaction`: reserves the listing (`RESERVED`), marks competing offers `EXPIRED`, and creates an Order snapshot.
6. **Checkout & Payment**: Proceed to Checkout, select delivery address, and click **Pay & Protect Order** (mock) or **Pay with Razorpay** (real gateway). Payment state transitions to `PROTECTED` and Order to `AWAITING_SHIPMENT`.
7. **Seller 3PL Shipping**: Switch to **Priya**. Click **Ship Order Now**. Mock logistics generates tracking ID `BLX-XXXXXXXXX` and transitions status to `SHIPPED`.
8. **Shipment Tracking**: Status updates are handled automatically by the logistics provider — in mock mode a background simulator advances *In Transit* → *Out for Delivery* → *Delivered* on its own. Open the **Live Tracking** link (courier portal) to see the package journey.
9. **Delivery Confirmation & Settlement**: Switch to **Rahul**. Click **Confirm Book Receipt & Release Settlement**. Order status becomes `COMPLETED` and seller payment becomes `RELEASED`.
10. **Review Submission**: Submit a 5-star review for Priya.
