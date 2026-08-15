# BookLX (BooksLX) — Architecture Document

> **Status:** Living document — reflects the codebase as of August 2026.
> **Companion:** [README.md](./README.md) (concept, setup, golden-path demo).

---

## Table of Contents

1. [Overview & Concept](#1-overview--concept)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Technology Stack](#4-technology-stack)
5. [System Context & Actors](#5-system-context--actors)
6. [Repository Layout](#6-repository-layout)
7. [Backend Architecture](#7-backend-architecture)
8. [The Domain Model](#8-the-domain-model)
9. [The State Machines (Core of the System)](#9-the-state-machines-core-of-the-system)
10. [Transactionality & Concurrency Control](#10-transactionality--concurrency-control)
11. [Integrations: Payment & Logistics Providers](#11-integrations-payment--logistics-providers)
12. [Frontend Architecture](#12-frontend-architecture)
13. [End-to-End Golden Path](#13-end-to-end-golden-path)
14. [Security Model](#14-security-model)
15. [Testing Strategy](#15-testing-strategy)
16. [API Surface](#16-api-surface)
17. [Production Readiness & Known Gaps](#17-production-readiness--known-gaps)
18. [Extension Points](#18-extension-points)

---

## 1. Overview & Concept

**BookLX is a peer-to-peer marketplace exclusively for second-hand books, operating as a trusted mediator.** Sellers and buyers transact directly, but BookLX provides the trust infrastructure that makes peer-to-peer book sales safe:

- **Discovery** — searchable, filterable catalog of authentic second-hand listings with structured condition data.
- **Negotiation** — offer/counter-offer with floor-price enforcement, 48-hour expiry, and a full audit history.
- **Escrow payment protection** — buyer funds are "PROTECTED" by the platform, never released to the seller until delivery is confirmed.
- **Managed 3PL logistics** — sellers ship through pluggable courier providers; both parties track the parcel in-app.
- **Settlement release** — funds are released to the seller only after the buyer confirms receipt.
- **Dispute mediation** — admin-resolved disputes with evidence and refund/funds-release outcomes.
- **Reputation** — multi-dimensional reviews feed back into per-user ratings.

Every registered user is **both a buyer and a seller** in a single account — there is no separate seller onboarding.

**In one line:** *an exchange + escrow + managed courier, but only for used books.*

---

## 2. Goals & Non-Goals

### Goals
- Complete, demonstrable end-to-end marketplace loop: list → negotiate → pay (escrow) → ship → track → deliver → settle → review.
- **Authoritative state machines** for listings, offers, orders, payments, shipments, and disputes, with server-side guard rails on every transition.
- **Provider abstraction** so real payment (Razorpay) and logistics (Shiprocket) integrations can replace mocks without touching business logic.
- Demo-friendly: seeded data, one-click account switching, and a documented golden path.

### Non-Goals (current scope)
- Real-money payment processing (mock gateway by default).
- Production-grade image storage (cover art is remote URLs).
- Real-time chat between buyers and sellers (negotiation happens via offer messages).
- Background task queue with retries (single-process `setInterval` job).
- Multi-tenant / multi-instance deployment.

---

## 3. High-Level Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                            Browser (SPA)                              │
│   React 18 + Vite + TypeScript + Tailwind (design system)             │
│   React Router v6 · AuthContext · ThemeContext · Axios client         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  /api (Vite dev proxy → :5000)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Express REST API (:5000)                      │
│                                                                        │
│  middleware: cors · json · cookieParser · rateLimiters                 │
│  routes ──► controllers ──► services ──► Prisma ORM ──► SQLite (dev)   │
│                        │                 │                             │
│                        │                 ├─ integrations/              │
│                        │                 │   ├─ payment/  (mock | razorpay)   ◄── PAYMENT_MODE
│                        │                 │   └─ logistics/ (mock | shiprocket) ◄── LOGISTICS_MODE
│                        │                 │
│                        │                 └─ jobs/expireReservations.ts  (60s sweep)
│                        │                                              │
│                        └──────────── errorHandler (AppError model)     │
└──────────────────────────────────────────────────────────────────────┘
```

- The frontend is a thin consumer of the API; **all business rules live server-side** and are re-validated on every request (never trusted from the client).
- Both the payment and logistics layers are **strategy-pattern factories** switched by environment variables.

---

## 4. Technology Stack

### Frontend
| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 (dev server :5173, `/api` proxied to :5000) |
| Styling | Tailwind CSS 3 (`darkMode: 'class'`) + custom design tokens |
| Icons | lucide-react |
| Routing | React Router v6 |
| HTTP | Axios (centralized client with interceptors) |
| State | React Context (`AuthContext`, `ThemeContext`) — no external state library |

### Backend
| Concern | Choice |
|---|---|
| Runtime | Node.js + Express 4 + TypeScript |
| ORM | Prisma 5 |
| Database | SQLite `prisma/dev.db` (schema pinned; `DATABASE_URL` override supported) |
| Auth | bcryptjs + JWT (7d), httpOnly cookie **and** Bearer header |
| Validation | Manual, in-service checks (zod is a dependency but not yet used) |
| Rate limiting | express-rate-limit (auth: 30/15 min, API: 120/min) |
| Background jobs | In-process `setInterval` sweep (`src/jobs/`) |
| Tests | Vitest 3 (unit + integration, 60 tests) |

---

## 5. System Context & Actors

| Actor | Role | Key capabilities |
|---|---|---|
| **Buyer** | `USER` | Browse/search, make offers, cart, checkout, pay, track, confirm receipt, review, raise disputes |
| **Seller** | `USER` (same account) | List books, respond to offers, ship orders, receive settlements |
| **Admin** | `ADMIN` | Dashboard stats, dispute resolution, listing moderation, user/order tables |
| **Payment provider** | external | Captures/protects funds (mock by default) |
| **Logistics provider** | external | Creates shipments & tracking events (mock by default) |
| **Background job** | internal | Expires lapsed listing reservations |

Demo accounts (seeded): `rahul@bookslx.local`, `priya@bookslx.local` (`user123`), `admin@bookslx.local` (`admin123`). A **Demo Switcher bar** in the navbar lets a single browser session impersonate any of the three instantly — the primary way the golden path is exercised.

---

## 6. Repository Layout

```text
BookLX/
├── README.md            # Concept, setup, golden path
├── ARCHITECTURE.md      # This document
├── Backend/
│   ├── prisma/
│   │   ├── schema.prisma    # 20 models (see §8)
│   │   └── dev.db           # SQLite dev database (seeded)
│   ├── src/
│   │   ├── app.ts           # Express bootstrap + job wiring
│   │   ├── seed.ts          # Demo data seeder
│   │   ├── config/          # env.ts (dotenv) · db.ts (PrismaClient)
│   │   ├── middleware/      # auth · admin · errorHandler · rateLimiter
│   │   ├── routes/          # 10 REST routers
│   │   ├── controllers/     # Thin HTTP adapters
│   │   ├── services/        # Business logic + Prisma transactions
│   │   ├── integrations/    # payment/ + logistics/ provider abstraction
│   │   ├── jobs/            # expireReservations.ts (background sweep)
│   │   └── utils/           # errors.ts · pricing.ts
│   ├── tests/               # Vitest: unit/ + integration/
│   ├── vitest.config.ts
│   └── package.json
└── Frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── main.tsx · App.tsx (routes)
        ├── api/client.ts     # Axios instance + interceptors
        ├── context/          # AuthContext · ThemeContext
        ├── components/       # Navbar · Footer · BookCard · OfferModal · ShipmentTimeline
        └── pages/            # 13 pages (see §12)
```

---

## 7. Backend Architecture

### 7.1 Layering & Request Lifecycle

```text
HTTP request
   │
   ▼
CORS → body parsers → cookie parser → (router-specific) rate limiter
   │
   ▼
route → controller            # parse req, call service, shape response
   │
   ▼
service                      # business rules + prisma.$transaction
   │
   ▼
Prisma → SQLite
   │
   ▼
errorHandler                 # AppError → { success, message, code }; else 500
```

- **Routes** are declarative one-liners (`router.post('/:id/pay', apiRateLimiter, ...)`) mounting controller methods.
- **Controllers** are thin: extract `req.user.id` / params / body, delegate, and wrap errors with `next(error)`.
- **Services** own all rules. This is where state transitions, authorization checks, and transactions live.
- **Middleware** is mounted per-router (`authenticate`, `requireAdmin`) or per-route (`apiRateLimiter`).

### 7.2 Configuration & Environment

`src/config/env.ts` loads `Backend/.env` via dotenv and exposes a typed `env` object:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API port |
| `DATABASE_URL` | `file:./dev.db` | Prisma datasource (SQLite in dev; override supported) |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | dev secret / `7d` | Token signing |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `PAYMENT_MODE` | `mock` | `mock` \| `razorpay` |
| `PAYMENT_KEY` / `PAYMENT_SECRET` | mock values | Razorpay credentials |
| `LOGISTICS_MODE` | `mock` | `mock` \| `shiprocket` |
| `LOGISTICS_API_KEY` / `LOGISTICS_API_SECRET` | mock values | Shiprocket credentials |

`src/config/db.ts` constructs a single shared `PrismaClient`. The datasource URL is read from `env.DATABASE_URL`, which lets tests (and future deployments) point the client at an isolated database without changing the schema.

### 7.3 Authentication & Authorization

**Authentication (`authMiddleware.authenticate`)**
- Accepts a JWT from either the `token` httpOnly cookie **or** the `Authorization: Bearer <jwt>` header.
- Verifies signature against `JWT_SECRET`, attaches `req.user = { id, name, email, role }`.
- Rejects with `401 TOKEN_MISSING / TOKEN_INVALID` otherwise.

**Authorization — two layers:**
1. **Role guard:** `requireAdmin` middleware on `/api/admin/*` and dispute resolution.
2. **Ownership guards inside services:** every sensitive operation re-checks that the caller is the buyer/seller/admin of the resource (e.g., `orderService.getOrderDetails` allows buyer, seller, or admin; `cancelOrder` is buyer-only; `updateDeliveryAddress` is buyer-only). This is a deliberate pattern: **even if a route is mis-mounted, the service refuses.**

**Session endpoints:** `POST /auth/register`, `POST /auth/login`, `POST /auth/login-verified` (Firebase email-verification completion), `POST /auth/reset-password` (syncs a Firebase password reset into the local hash), `POST /auth/logout`, `GET /auth/me`, plus address management (`POST /auth/addresses` create, `GET /auth/addresses` list).

Registration supports two paths: a classic **password-only** signup (immediately usable, token issued) and a **Firebase email-verification** signup (`firebaseUid` + optional `password`; the account is created with `emailVerified: false`, no token is issued, and the user must click the verification link — after which `/auth/login-verified` marks the account verified and issues a token). Password logins for unverified Firebase accounts return `403 EMAIL_NOT_VERIFIED`.

### 7.4 Error Handling

Centralized `errorHandler` middleware maps thrown errors to consistent JSON:

```json
{ "success": false, "message": "...", "code": "..." }
```

| Source | HTTP | Code |
|---|---|---|
| `AppError` subclasses | 400/401/403/404/409 | `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, custom codes (`OFFER_EXPIRED`, `REFUND_FAILED`, …) |
| Prisma `P2002` (unique violation) | 409 | `DUPLICATE_ENTRY` |
| Prisma `P2025` (record missing) | 404 | `NOT_FOUND` |
| Anything else | 500 | `INTERNAL_SERVER_ERROR` |

The frontend's Axios interceptor normalizes these into `{ message, code, status }` rejections, so UI error banners read `err.message` directly.

### 7.5 Rate Limiting

- `authRateLimiter` — 30 req / 15 min on login/register (brute-force protection).
- `apiRateLimiter` — 120 req / 1 min on write-heavy routes (order creation, payment, cancellation, offers, disputes).

---

## 8. The Domain Model

20 Prisma models. Highlights of the design:

| Model | Purpose | Notable design points |
|---|---|---|
| `User` | Single account for buying & selling | `rating` (recomputed from reviews), `totalSales/totalPurchases` |
| `Address` | Delivery & pickup addresses | `isDefault`, `isPickupAddress`; snapshotted into orders at purchase time |
| `Book` | Canonical book record | Unique `isbn`; listings attach to a shared book |
| `Listing` | The sellable item | `askingPrice`, `minimumOfferPrice`, `condition` (LIKE_NEW→POOR), JSON `conditionDetails`, status lifecycle |
| `ListingImage` | Gallery per listing | `isPrimary`, `displayOrder` |
| `Offer` + `OfferHistory` | Negotiation thread | Immutable history log of every price/message; 48h `expiresAt` |
| `Cart` + `CartItem` | Unique-copy cart | One copy per listing (correct for second-hand); quantity is intentionally absent |
| `Order` | The fulfillment contract | **Address snapshots** frozen at creation; `idempotencyKey`; full status history |
| `OrderStatusHistory` | Audit trail | Every transition recorded with actor + reason |
| `Payment` + `PaymentEvent` | Escrow lifecycle | Provider refs, `idempotencyKey`, JSON `metadata`, provider event log |
| `Shipment` + `ShipmentEvent` | Tracking timeline | Courier + tracking number + timestamped events |
| `Dispute` + `DisputeEvidence` | Mediation | Reason enum, evidence URLs, resolution outcome/notes |
| `Review` | Reputation | Overall + communication + accuracy + shipping ratings; unique per (order, reviewer) |
| `Wishlist` | Saved listings | Unique per (user, listing) |
| `Notification` | Event plumbing | Typed, with deep links and read state |

**Address snapshots deserve emphasis:** when an order is created, the buyer's delivery address and the seller's pickup address are **copied into the order** as JSON. Later edits to user profiles can never corrupt fulfillment.

---

## 9. The State Machines (Core of the System)

Every lifecycle is an explicit state machine with **server-side guards** — an operation throws unless the current state permits it. All transitions write an audit entry where a history model exists.

### 9.1 Listing

```text
                  ┌────────── direct order created / offer accepted
ACTIVE ─────────► RESERVED ──────────────────────────────► SOLD  (delivery confirmed)
  │  ▲                  │
  │  │                  │  buyer cancel / payment fail / reservation expiry
  │  └──────────────────┘
  ├──► PAUSED (seller/admin pause) ◄──► ACTIVE
  └──► DELETED
```

- `RESERVED` carries `reservedUntil` (15 min) and `reservedByUserId`.
- The reservation is taken at **order creation** (`createDirectOrder` or offer acceptance); `processPayment` does not change the listing — it stays `RESERVED` through payment until `completeOrder` marks it `SOLD`.
- Reservation release points: buyer cancellation (`cancelOrder`), payment failure (`processPayment`), and the **expiry job** (see §10.3).

### 9.2 Offer (negotiation)

```text
PENDING ◄── buyer revises (new OFFER_CREATED history; also allowed from COUNTERED)
   │  ▲
   │  └── seller/buyer COUNTER_OFFER ──► COUNTERED ◄──┐
   ▼                                               │
ACCEPTED ──► creates Order (transactionally) ───────┘
REJECTED · EXPIRED (48h) · CANCELLED
```

Rules: offers respect `minimumOfferPrice`; self-offers forbidden; only active listings accept offers; expiry is re-checked server-side on counter **and** accept.

### 9.3 Order (the heart of the system)

```text
        processPayment (success)            sellerShipOrder
PAYMENT_PENDING ─────────────────────► AWAITING_SHIPMENT ──────────► SHIPPED
      │  │                                  │  │                           │
      │  │ payment failure /                │  └── buyer cancel ──► REFUNDED
      │  └── reservation expiry ──► CANCELLED
      │                                                          │
      │                                autoAdvanceShipmentStatus (logistics / mock simulator)
      │                                              ▼
      │                        SHIPPED ──► IN_TRANSIT ──► OUT_FOR_DELIVERY ──► DELIVERED
      │                                                                               │
      │                                                        completeOrder (buyer confirms)
      │                                                                               ▼
      └────────────────────────────────────────────────────────────────────────► COMPLETED

   Buyer raises dispute on any non-terminal order ──► DISPUTED
        ── admin resolves: REFUNDED (refund buyer)  or  COMPLETED (release funds to seller)
```

Guards per transition:
- `processPayment` — only buyer; only `PAYMENT_PENDING`; **conditional transition** (aborts with `409` if the reservation was expired mid-payment).
- `sellerShipOrder` — only seller; only `AWAITING_SHIPMENT` / `PAYMENT_PROTECTED`.
- `autoAdvanceShipmentStatus` — logistics-owned; the courier status is driven by the provider (mock simulator job / tracking webhook), never by users.
- `completeOrder` — only `DELIVERED`; releases settlement, marks listing `SOLD`, increments user metrics.
- `cancelOrder` — buyer-only, pre-shipment; triggers provider refund (see §10.2).

### 9.4 Payment (escrow)

```text
PENDING ──► PROTECTED (funds held) ──► RELEASED (settlement, order COMPLETED)
              │
              └─► REFUNDED (buyer cancel or admin dispute refund)
   FAILED (payment verification failed → order CANCELLED)
```

The platform never auto-releases funds; release is always the result of an explicit, audited action.

### 9.5 Shipment

```text
(CREATED) ──► SHIPPED ──► IN_TRANSIT ──► OUT_FOR_DELIVERY ──► DELIVERED
```

`CREATED` is only the schema default — `sellerShipOrder` creates shipments directly as `SHIPPED`. Each hop appends a `ShipmentEvent` and mirrors the status onto the order.

### 9.6 Dispute

```text
OPEN ──► RESOLVED  (outcome: REFUND | RELEASE_FUNDS | REJECT_DISPUTE | RETURN_REQUIRED)
```

Only the buyer can raise (on a non-terminal order); only an admin can resolve. Resolution atomically settles the order and payment in the chosen direction.

---

## 10. Transactionality & Concurrency Control

### 10.1 `prisma.$transaction` discipline

All multi-step operations run in a single database transaction so partial states can never be observed:

- **Offer acceptance** (`offerService.acceptOffer`) — marks offer `ACCEPTED`, reserves the listing, expires every competing offer, and creates the order snapshot **atomically**. This is what prevents two buyers from both "winning" a single-copy listing.
- **Payment processing** — creates/updates the payment, transitions the order, writes history, notifies both parties, and cleans the cart in one transaction.
- **Order completion** — order `COMPLETED` + listing `SOLD` + payment `RELEASED` + user metrics increment + notifications.
- **Cancellation/refund** — order `REFUNDED` + payment `REFUNDED` (+ `PaymentEvent`) + listing released + notifications.
- **Dispute resolution** — dispute `RESOLVED` + order/payment/listing settled in the chosen direction.

### 10.2 Conditional writes (race protection)

The most recent hardening work made the critical transitions **conditional under the write lock**:

- `processPayment` transitions the order via `updateMany WHERE status = PAYMENT_PENDING` — if a concurrent expiry/cancel won first, payment aborts with `409 Conflict` instead of resurrecting a dead order.
- `cancelOrder` likewise transitions only from `AWAITING_SHIPMENT`/`PAYMENT_PROTECTED`; the provider refund is issued **only after** the state transition is secured, so a shipped order can never be refunded.
- The expiry sweep re-validates state inside its transaction (see below).

### 10.3 The reservation expiry job

`src/jobs/expireReservations.ts` (started from `app.ts`: one sweep 5s after boot to catch reservations that lapsed while offline, then every **60s**; stopped on `SIGINT`/`SIGTERM`):

1. Finds listings still `RESERVED` whose `reservedUntil` has passed **and** that have no order in a "live" state (paid/in-transit/disputed).
2. In one transaction: cancels linked `PAYMENT_PENDING` orders (conditionally), writes `statusHistory`, notifies the buyer, and releases the listing back to `ACTIVE` (conditionally).

The `orders: { none: { status: { in: LIVE } } }` filter guarantees a **paid order can never be double-sold** — a listing with `AWAITING_SHIPMENT` or later status is never released, no matter how stale `reservedUntil` looks.

### 10.4 Idempotency

Orders and payments carry optional `idempotencyKey` (unique): retrying a checkout with the same key returns the existing order/payment instead of duplicating it.

---

## 11. Integrations: Payment & Logistics Providers

Both layers use the same **strategy + factory** pattern:

```ts
class PaymentServiceFactory {
  constructor() {
    this.provider = env.PAYMENT_MODE === 'razorpay'
      ? new RazorpayPaymentProvider(env.PAYMENT_KEY, env.PAYMENT_SECRET)
      : new MockPaymentProvider();
  }
}
```

| Interface | Methods | Mock | Real (stub) |
|---|---|---|---|
| `PaymentProvider` | `createPayment`, `verifyPayment`, `refundPayment`, `handleWebhook` | Synchronous, deterministic (`PROTECTED`/`FAILED` via `simulateFailure`, `MOCK_*` ids) | Razorpay: HMAC signature verification implemented; network calls stubbed |
| `LogisticsProvider` | `createShipment`, `getTracking`, `cancelShipment`, `handleWebhook` | Generates `BLX-*` tracking + event stream | Shiprocket: generates `SR-*` tracking; network calls stubbed |

**Implications:**
- The entire business flow runs end-to-end in mock mode with zero external dependencies.
- Swapping in a real provider is a per-class implementation task — business logic (services) depends only on the interface.
- Webhook handlers exist in the interface but are not yet exposed as routes (see §17).

---

## 12. Frontend Architecture

### 12.1 Structure

- **`api/client.ts`** — a single Axios instance: `baseURL: '/api'`, `withCredentials: true`, auto-attaches the Bearer token from `localStorage`, and its response interceptor **unwraps `response.data`** and normalizes errors to `{ message, code, status }`.
- **Contexts** (no external state library):
  - `AuthContext` — `user`, `loading`, `login/register/logout`, `refreshUser`, and `switchDemoUser(email)` (the Demo Switcher).
  - `ThemeContext` — `light | dark | system`, persisted to `localStorage` (`bookslx_theme`), toggles the `dark` class on `<html>`.
- **Routing** (React Router v6, in `App.tsx`) — 19 routes; several pages are reused across routes (e.g., `UserProfile` serves `/profile`, `/profile/orders`, `/wishlist`, `/notifications`).

### 12.2 Pages

| Page | Route(s) | Responsibility |
|---|---|---|
| `Home` | `/` | Hero search, categories, recent listings, "How it works" |
| `BrowseBooks` | `/books`, `/categories/:category` | Search/filter/sort with pagination |
| `BookDetails` | `/books/:id` | Gallery, condition matrix, Buy Now / Offer / Cart / Wishlist |
| `ListingWizard` | `/sell/create` | Multi-step listing creation |
| `OfferHub` / `OfferDetails` | `/offers`, `/offers/:id` | Negotiation inbox + counter/accept/reject thread |
| `CartPage` | `/cart` | Unique-copy cart |
| `CheckoutPage` | `/checkout?orderId=` | Escrow summary, address selection, pay / simulate failure |
| `OrderDetail` | `/orders/:id` | **Action console** (ship / dev-courier controls / cancel & refund / confirm / review / dispute), shipment timeline, address snapshots |
| `DisputeHub` | `/disputes`, `/disputes/new` | Raise dispute with evidence; list |
| `UserProfile` | `/profile`, `/profile/orders`, `/wishlist`, `/notifications` | Tabs: orders (buyer/seller), wishlist, notifications, addresses |
| `AdminDashboard` | `/admin` | Stats, dispute resolution, users & orders tables |
| `AuthPage` | `/login`, `/signup` | Auth forms |

### 12.3 Design System

Tailwind tokens (`tailwind.config.js`) — a consistent editorial/bookshelf identity:

| Token | Value | Use |
|---|---|---|
| `obsidian` | `#0B0D0F` | Dark background |
| `graphite` | `#171A1D` | Cards (dark) |
| `ivory` / `smoky` | `#FAF9F6` / `#F5F5F2` | Light background / text |
| `sage` / `forest` | `#6F806A` / `#26382D` | Educational accents / gradients |
| `gold` | `#C8A96B` | Highlights, stars, CTAs |
| `brandSuccess/Error/Warning` | — | Status semantics |
| `shadow-premium`, `shadow-goldGlow` | — | Depth |
| Fonts | Inter (body), Plus Jakarta Sans (headings) | Typography |

The UI is fully responsive and theme-aware (light/dark/system).

---

## 13. End-to-End Golden Path

The canonical demo flow (from the README, verified by the integration tests):

1. **Login** — as Rahul (Buyer) via the Demo Switcher.
2. **Discover** — search *Clean Code* / filter by condition.
3. **Negotiate** — offer ₹350 on Priya's listing (respects the ₹350 floor).
4. **Counter** — Priya (Seller) counters ₹400; Rahul is notified.
5. **Accept** — Rahul accepts; one transaction reserves the listing, expires competing offers, and creates a `PAYMENT_PENDING` order snapshot.
6. **Pay** — checkout → "Pay & Protect"; payment becomes `PROTECTED`, order `AWAITING_SHIPMENT`.
7. **Ship** — Priya clicks "Ship Order Now"; mock logistics issues `BLX-*` tracking; order `SHIPPED`.
8. **Track** — the logistics provider advances `IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED` automatically (mock simulator in dev; provider webhooks in prod). Both parties see the courier's live tracking link.
9. **Settle** — Rahul confirms receipt; order `COMPLETED`, listing `SOLD`, payment `RELEASED`.
10. **Review** — 5-star review recalculates Priya's rating.

**Variants covered by the system:** payment failure (order `CANCELLED`, listing relisted), buyer cancellation/refund before shipment (order `REFUNDED`, listing relisted), reservation expiry (job releases + cancels unpaid orders), and admin-resolved disputes.

---

## 14. Security Model

| Layer | Controls |
|---|---|
| Authentication | bcrypt(10) password hashing; JWT (7d) in httpOnly cookie **and** Bearer header |
| Authorization | `requireAdmin` on admin routes + ownership re-checks in every sensitive service method |
| Business-rule guards | Every state transition validates current state; self-purchase/self-offer forbidden; minimum offer price enforced; review only on `COMPLETED` orders, once per order |
| Abuse protection | Rate limits on auth and write endpoints; idempotency keys on orders/payments |
| Data integrity | Address/price snapshots frozen at order time; immutable history tables |
| Error hygiene | Central error handler never leaks stack traces |

**Remaining gaps** (see §17): no input-validation layer (zod unused), no CSRF handling for cookie auth, no webhook signature routes, no image upload validation.

---

## 15. Testing Strategy

**Vitest 3**, run with `npm test` in `Backend/`. 60 tests across 7 files:

| File | Type | Covers |
|---|---|---|
| `tests/unit/pricing.test.ts` | unit | `calculateOrderAmount` (defaults, custom fees, discount, clamping, rounding) |
| `tests/unit/mockPaymentProvider.test.ts` | unit | Mock gateway create/verify/refund states |
| `tests/unit/razorpayPaymentProvider.test.ts` | unit | Razorpay signature verification & webhook parsing (10 tests) |
| `tests/integration/orderStateMachine.test.ts` | integration | Full order lifecycle: create → pay → cancel/refund → ship → track → complete; authorization & state guards (23 tests) |
| `tests/integration/offerAcceptance.test.ts` | integration | Negotiation → accept → order creation, competing-offer expiry, guards (5 tests) |
| `tests/integration/expiryJob.test.ts` | integration | Reservation expiry sweep (release/cancel, paid-order protection, no-op) (4 tests) |
| `tests/integration/authFlow.test.ts` | integration | `register` (password-only vs Firebase signup, token gating, duplicate emails), `login` verification gate (403 for unverified Firebase accounts, legacy compatibility), `loginVerified` (token issuance, UID mismatch rejection, UID attach) (10 tests) |

**Isolation:** the global setup copies `prisma/dev.db` to an OS-temp SQLite file and points `DATABASE_URL` at it (via `config/db.ts`'s override); `prisma/dev.db` is never modified. Test files run sequentially (SQLite is single-writer), and every test truncates the copy first. A leftover temp file is best-effort cleaned and re-seeded on the next run.

---

## 16. API Surface

All routes under `/api`. `*` = authenticated, `A` = admin-only, `(L)` = rate-limited.

| Module | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/register (L)`, `POST /auth/login (L)`, `POST /auth/login-verified (L)`, `POST /auth/reset-password (L)`, `POST /auth/logout`, `GET /auth/me *`, `POST /auth/addresses *`, `GET /auth/addresses *` |
| Books | `GET /books/listings`, `GET /books/listings/:id`, `GET /books/categories`, `POST /books/listings *`, `PATCH /books/listings/:id/status *`, `GET /books/seller/listings *` |
| Offers | `POST / * (L)`, `GET / *`, `GET /:id *`, `POST /:id/counter * (L)`, `POST /:id/accept *`, `POST /:id/reject *` |
| Cart | `GET / *`, `POST / *`, `DELETE /:listingId *`, `DELETE / *` |
| Orders | `POST /direct * (L)`, `GET / *`, `GET /:id *`, `PUT /:id/delivery-address *`, `POST /:id/pay * (L)`, `POST /:id/cancel * (L)`, `POST /:id/ship *`, `POST /:id/complete *` |
| Disputes | `POST / * (L)`, `GET / *`, `POST /:id/resolve * A` |
| Reviews | `POST / *`, `GET /user/:userId? *` |
| Wishlist | `POST /toggle *`, `GET / *` |
| Notifications | `GET / *`, `PATCH /:id/read *`, `PATCH /read-all *` |
| Admin | `GET /stats A`, `GET /users A`, `GET /orders A`, `PATCH /listings/:id/moderate A` |

---

## 17. Production Readiness & Known Gaps

**Would ship to production after:**

1. **Real provider integrations** — Razorpay and Shiprocket implementations are stubs (interfaces + signature verification only). Webhooks are defined on the interfaces but **not exposed as routes**; payment/shipment events would need webhook endpoints with signature verification and a reconciliation strategy.
2. **Reservation expiry on a durable scheduler** — the in-process `setInterval` works for a single instance; multi-instance deployments need a distributed lock or cron to avoid duplicate sweeps.
3. **Input validation** — zod is installed but unused; request bodies are validated ad hoc inside services.
4. **Image upload** — covers are remote URLs; a real upload path (with validation/scanning) is needed.
5. **Tests for auth, cart, reviews, notifications, and admin flows** — current coverage is state-machine focused.
6. **Database story** — README/schema mismatch resolved toward SQLite in dev; production would use PostgreSQL via `DATABASE_URL` (the override in `config/db.ts` already supports it).

**Known limitations:**
- `processPayment` reads the order state before its transaction; the conditional-write guard closes the common race, but the pre-read is not itself part of the transaction.
- Notifications are write-time only (no email/SMS channel).
- No seller-side "accept offer" deadline enforcement UI beyond the server-side 48h expiry check.
- Courier status is driven by the logistics provider only — there is no user-facing shipment-status endpoint (the mock simulator / provider webhook own the transitions).

---

## 18. Extension Points

- **New payment/logistics provider** → implement the interface, add a `PAYMENT_MODE`/`LOGISTICS_MODE` branch in the factory.
- **New marketplace verticals** → the `Book`/`Listing`/`Offer`/`Order` split generalizes; only `Book` is book-specific.
- **Notifications channel** → add a dispatcher behind the existing `Notification` model.
- **Real-time** → WebSockets/SSE on top of `ShipmentEvent`/`Notification` writes.
- **Seller tools** → inventory dashboard over `getSellerListings` + order seller views.
- **Pricing policy** → `utils/pricing.ts` is the single authority for fees/discounts.

---

*Generated from a full codebase review. Keep this document in sync with any changes to the state machines, provider interfaces, or project layout.*
