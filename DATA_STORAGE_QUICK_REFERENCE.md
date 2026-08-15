# Quick Reference - Data Storage Locations

## 📍 Where Everything is Stored

### Database Storage
```
📁 Backend/
├─ prisma/
│  └─ dev.db          ← SQLite Database (All structured data)
│     Contains:
│     ├─ Users (names, emails, passwords, ratings)
│     ├─ Books (titles, authors, ISBNs)
│     ├─ Listings (book listings, prices, conditions)
│     ├─ Orders (transactions, amounts, status)
│     ├─ Payments (payment records, status)
│     ├─ Shipments (tracking, delivery dates)
│     ├─ Reviews (ratings, comments)
│     ├─ Disputes (issues, resolution)
│     ├─ Cart & Wishlist (user preferences)
│     └─ Notifications (alerts)
```

### Image Storage (Current)
```
🖼️  Images are stored as URLs
├─ Profile Images: https://images.unsplash.com/...
├─ Book Covers: https://images.unsplash.com/...
├─ Listing Images: https://images.unsplash.com/...
└─ Dispute Evidence: https://images.unsplash.com/...

✅ Stored as: String URLs in database (ListingImage.url)
❌ NOT stored as files on server
```

### Firebase (Frontend)
```
🔐 Firebase (Google Cloud)
├─ User Authentication
│  ├─ Email/Password auth
│  ├─ Email Verification
│  └─ Firebase UID
└─ Frontend Config (.env)
   ├─ VITE_FIREBASE_API_KEY
   ├─ VITE_FIREBASE_PROJECT_ID
   └─ etc.
```

### Frontend Code
```
📁 Frontend/
├─ src/
│  ├─ pages/AuthPage.tsx          ← Login/Signup UI
│  ├─ context/AuthContext.tsx     ← Auth state management
│  └─ api/client.ts               ← API calls
└─ .env.local                     ← Firebase credentials
```

### Backend Code
```
📁 Backend/
├─ src/
│  ├─ controllers/                ← API endpoints
│  ├─ services/                   ← Business logic
│  ├─ routes/                     ← API routes
│  ├─ config/
│  │  ├─ db.ts                    ← Database config
│  │  └─ env.ts                   ← Environment variables
│  └─ seed.ts                     ← Test data
├─ .env                           ← Backend secrets
└─ prisma/schema.prisma           ← Database schema
```

---

## 📊 Data Storage by Feature

### User Registration
```
1️⃣  Frontend (AuthPage.tsx)
   └─ User enters email & password
   
2️⃣  Firebase (Google Cloud)
   └─ Email/Password authentication
   └─ Sends verification email
   
3️⃣  Backend (POST /auth/register)
   └─ Stores in SQLite:
      ├─ User ID (UUID)
      ├─ Name, Email
      ├─ Password Hash (bcrypt)
      ├─ Firebase UID
      └─ Email Verified: false

4️⃣  Database (dev.db)
   └─ User table row created
```

### User Profile Image
```
❌ Current: Not implemented (defaults to null or URL)

✅ To add profile image upload:
1. Frontend: File upload input
2. Upload to: S3 / Google Cloud / Cloudinary
3. Get: Secure URL
4. Store in: SQLite User.profileImage
```

### Listing with Images
```
1️⃣  Frontend (ListingWizard.tsx)
   └─ User uploads book images
   
2️⃣  Upload to: S3 / Cloud Storage (TBD)
   └─ Get: Secure URLs
   
3️⃣  Backend (POST /listings/create)
   └─ Create in SQLite:
      ├─ Book record (title, author, isbn, coverImage URL)
      └─ Listing record (price, condition, seller)
      └─ ListingImage records (image URLs)

4️⃣  Database (dev.db)
   └─ Listing table + ListingImage table rows
```

### Order & Payment
```
1️⃣  Frontend (CheckoutPage.tsx)
   └─ User confirms purchase
   
2️⃣  Backend (POST /orders/create)
   └─ Create in SQLite:
      ├─ Order record (amount, buyer, seller, listing)
      ├─ Payment record (payment provider, status)
      └─ Shipment record (tracking number)

3️⃣  Database (dev.db)
   └─ Order, Payment, Shipment table rows
   └─ All data stored, no files
```

### Dispute Evidence
```
1️⃣  Frontend (DisputeHub.tsx)
   └─ User uploads evidence (images/docs)
   
2️⃣  Upload to: S3 / Cloud Storage (TBD)
   └─ Get: Secure URL
   
3️⃣  Backend (POST /disputes/create)
   └─ Create in SQLite:
      └─ DisputeEvidence record (URL, description, file type)

4️⃣  Database (dev.db)
   └─ Dispute + DisputeEvidence table rows
```

---

## 📈 Database Size Estimates

| Table | Rows | Size | Growth Rate |
|-------|------|------|-------------|
| User | 5 | ~2KB | +0.5 rows/day |
| Book | 10 | ~3KB | +1 row/week |
| Listing | 20 | ~5KB | +2 rows/day |
| Order | 10 | ~5KB | +1 row/day |
| Payment | 10 | ~3KB | +1 row/day |
| Review | 8 | ~4KB | +0.5 rows/day |
| Total (current) | ~100K rows | ~500KB | |

**Production estimate:**
- 1000 users = ~5-10 MB
- 10,000 listings = ~50-100 MB
- 100,000 orders = ~500 MB
- **Total: ~1 GB (with growth buffer)**

---

## 🔐 Data Privacy & Security

### Encrypted at Rest
- ❌ SQLite (dev.db) - Not encrypted in dev
- ✅ Firebase - Google managed encryption
- ⚠️ Production - Use PostgreSQL with encryption

### In Transit
- ✅ HTTPS only (production)
- ✅ JWT tokens (bearer auth)
- ✅ CORS configured

### Access Control
- ✅ User can only see own data
- ✅ Admin role for moderation
- ✅ API endpoint authentication

---

## 🚀 Production Setup Checklist

### Database
- [ ] Migrate from SQLite to PostgreSQL
- [ ] Enable automated backups
- [ ] Set up read replicas
- [ ] Enable query logging
- [ ] Configure connection pooling

### Images
- [ ] Set up AWS S3 bucket
- [ ] Configure CloudFront CDN
- [ ] Enable image optimization
- [ ] Set up lifecycle policies
- [ ] Configure CORS

### Monitoring
- [ ] Set up database monitoring (CloudWatch)
- [ ] Configure alerts for disk space
- [ ] Enable query performance insights
- [ ] Set up backup verification
- [ ] Create disaster recovery plan

---

## 🔄 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  (React + TypeScript)                                        │
│  ├─ AuthPage.tsx (Login/Signup UI)                           │
│  ├─ ListingWizard.tsx (Create listings)                      │
│  ├─ CheckoutPage.tsx (Place orders)                          │
│  └─ context/AuthContext.tsx (State)                          │
└────────────┬────────────────────────────────────────────────┘
             │
    HTTP/HTTPS API Calls
             │
┌────────────▼────────────────────────────────────────────────┐
│                       Backend                                │
│  (Express + TypeScript)                                      │
│  ├─ controllers/ (API endpoints)                             │
│  ├─ services/ (Business logic)                               │
│  └─ routes/ (Route handlers)                                 │
└────────────┬────────────────────────────────────────────────┘
             │
    Prisma ORM
             │
┌────────────▼────────────────────────────────────────────────┐
│                      SQLite                                  │
│  Backend/prisma/dev.db                                       │
│  ├─ Users, Books, Listings                                   │
│  ├─ Orders, Payments, Shipments                              │
│  ├─ Reviews, Disputes, Cart                                  │
│  └─ Notifications, Wishlist                                  │
└────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Firebase (Google Cloud)                   │
│  (Email Verification)                                        │
│  └─ sendEmailVerification()                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               Image Storage (To Be Implemented)              │
│  Options: AWS S3, Google Cloud Storage, Cloudinary           │
│  └─ Currently: External URLs only (Unsplash)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Common Questions

### Q: Where is my user password stored?
**A:** In SQLite (`Backend/prisma/dev.db`), hashed using bcrypt. Never stored in plain text.

### Q: Where are book cover images stored?
**A:** Currently as URLs (Unsplash). In production, should be in AWS S3 or similar cloud storage.

### Q: Where are my orders stored?
**A:** In SQLite (`dev.db`). Order records, payment details, and shipment tracking all in database.

### Q: How do I back up my data?
**A:** Currently, copy the `Backend/prisma/dev.db` file. In production, use PostgreSQL backups.

### Q: Can I access the database directly?
**A:** Yes! Use Prisma Studio:
```bash
cd Backend
npx prisma studio
```
Opens web UI on http://localhost:5555

### Q: How do I add image uploads?
**A:** Need to implement file upload endpoint with S3/Cloud Storage integration.

---

## 🛠️ Development Commands

```bash
# View database schema
cd Backend
npx prisma studio      # Opens visual database editor

# Reset database with seed data
npx prisma db push     # Apply schema changes
npx prisma db seed     # Run seed.ts

# Create database backup
cp prisma/dev.db prisma/dev.db.backup

# Generate Prisma types
npx prisma generate
```

---

## 📌 Key Files

| File | Purpose | Location |
|------|---------|----------|
| Database | All structured data | `Backend/prisma/dev.db` |
| Schema | Database structure | `Backend/prisma/schema.prisma` |
| Seed Data | Test data | `Backend/src/seed.ts` |
| Config | Environment vars | `Backend/.env` |
| Image URLs | Book/profile images | Stored in SQLite as strings |
| Firebase Config | Auth credentials | `Frontend/.env.local` |

