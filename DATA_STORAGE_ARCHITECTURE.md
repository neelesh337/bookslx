# BooksLX - Data Storage Architecture

## Current Data Storage Overview

### 1. **Database - SQLite (Development)**

**Location:** `Backend/prisma/dev.db`

**Provider:** SQLite (lightweight file-based database)

**Current Tables:**

```
┌─────────────────────┐
│     User Data       │
├─────────────────────┤
│ id (UUID)           │
│ name                │
│ email               │
│ phone               │
│ passwordHash        │
│ firebaseUid         │
│ emailVerified       │
│ profileImage (URL)  │
│ rating              │
│ totalSales          │
│ totalPurchases      │
│ role                │
│ createdAt           │
│ updatedAt           │
└─────────────────────┘
        ↓
    [Relationships]
        ↓
┌──────────────────────────────────────────────────────┐
│          Other Related Data                          │
├──────────────────────────────────────────────────────┤
│ • Addresses (delivery & pickup)                      │
│ • Listings (books for sale)                          │
│ • ListingImages (book images/URLs)                   │
│ • Orders (transactions)                              │
│ • Payments (payment records)                         │
│ • Shipments (delivery tracking)                      │
│ • Disputes (customer issues)                         │
│ • Reviews (ratings & feedback)                       │
│ • Cart (shopping cart items)                         │
│ • Wishlist (saved books)                             │
│ • Notifications (user alerts)                        │
└──────────────────────────────────────────────────────┘
```

---

## 2. **Image Storage - Currently URLs Only**

### Current Implementation:

**Type:** External URL storage (no local file upload)

**Where Images Are Stored:**
- **Profile Images**: Stored as URLs (e.g., `https://images.unsplash.com/...`)
- **Book Cover Images**: Stored as URLs in `Book.coverImage` field
- **Listing Images**: Stored as URLs in `ListingImage.url` field
- **Dispute Evidence**: Stored as URLs in `DisputeEvidence.url` field

**Database Schema:**

```typescript
model User {
  profileImage: String?  // e.g., "https://images.unsplash.com/..."
}

model Book {
  coverImage: String?    // e.g., "https://images.unsplash.com/..."
}

model ListingImage {
  id: String
  listingId: String
  url: String            // Image URL
  altText: String?
  isPrimary: Boolean     // Main image for listing
  displayOrder: Int
}

model DisputeEvidence {
  id: String
  disputeId: String
  uploadedById: String
  url: String            // Evidence image URL
  description: String?
  fileType: String       // "image", "document", etc.
}
```

---

## 3. **Complete Data Model**

### User & Profile
```
User
├─ ID (UUID)
├─ Name, Email (unique), Phone
├─ Password Hash (bcrypt)
├─ Profile Image (URL)
├─ Firebase UID (for email verification)
├─ Email Verification Status
├─ Rating & Statistics
├─ Role (USER, ADMIN)
└─ Timestamps (createdAt, updatedAt)
```

### Books & Listings
```
Book
├─ ID, ISBN (unique), Title, Author
├─ Publisher, Edition, Category
├─ Description
├─ Cover Image (URL)
└─ References from Listings

Listing
├─ ID, Seller ID
├─ Book ID, Asking Price, Minimum Offer
├─ Condition (LIKE_NEW, EXCELLENT, GOOD, ACCEPTABLE, POOR)
├─ Status (ACTIVE, RESERVED, SOLD, PAUSED, DELETED)
├─ Reserve Status (if reserved until when, by whom)
├─ Multiple Listing Images
└─ Timestamps

ListingImage
├─ ID, Listing ID
├─ Image URL
├─ Alt Text for accessibility
├─ isPrimary (main image)
└─ Display Order
```

### Orders & Transactions
```
Order
├─ ID, Order Number (unique)
├─ Buyer ID, Seller ID
├─ Listing ID, Total Amount
├─ Book Price, Shipping Fee, Platform Fee
├─ Status (PAYMENT_PENDING, SHIPPED, DELIVERED, etc.)
├─ Delivery Address (snapshot JSON)
├─ Pickup Address (snapshot JSON)
├─ Idempotency Key (prevent duplicates)
└─ Related: Payment, Shipment, Disputes, Reviews

Payment
├─ ID, Order ID (unique)
├─ Payment Number (unique)
├─ Provider (mock, razorpay, stripe, etc.)
├─ Provider Transaction ID
├─ Amount, Status
├─ Metadata (JSON)
└─ Payment Events

Shipment
├─ ID, Order ID (unique)
├─ Tracking Number (unique)
├─ Tracking URL
├─ Courier Name
├─ Status, Estimated Delivery Date
├─ Shipped Date, Delivered Date
└─ Shipment Events
```

### Reviews & Disputes
```
Review
├─ ID, Order ID (unique per reviewer)
├─ Reviewer ID, Reviewee ID
├─ Ratings (overall, communication, accuracy, shipping)
├─ Comment
└─ Created At

Dispute
├─ ID, Order ID
├─ Raised By (User ID)
├─ Reason, Description
├─ Status (OPEN, RESOLVED, CLOSED)
├─ Resolution Details
└─ Multiple Evidence Files
```

### Cart & Wishlist
```
Cart
├─ ID, User ID (unique)
└─ Multiple Cart Items

CartItem
├─ Cart ID, Listing ID (unique combination)
└─ Added At

Wishlist
├─ User ID, Listing ID (unique combination)
└─ Created At
```

### Notifications
```
Notification
├─ ID, User ID
├─ Type, Title, Message
├─ Link (for action)
├─ Is Read Status
└─ Created At
```

---

## 4. **Current Data Flow**

```
[User Signup]
     ↓
[Firebase Auth Creates Account]
     ↓
[POST /auth/register]
     ↓
[Create User Record in SQLite]
├─ Store: name, email, phone, firebaseUid
├─ profileImage defaults to null (or URL)
├─ emailVerified = false
└─ Save to User table
     ↓
[User Verification Email]
     ↓
[Email Verification Click]
     ↓
[POST /auth/login-verified]
     ↓
[Update User: emailVerified = true, verifiedAt = now]
     ↓
[Issue JWT Token]

[User Lists Book]
     ↓
[POST /listings/create]
     ↓
[Create Book Record (if new)]
├─ Store: title, author, isbn, coverImage (URL)
└─ Save to Book table
     ↓
[Create Listing Record]
├─ Store: sellerId, bookId, price, condition
└─ Save to Listing table
     ↓
[Upload/Store Images]
├─ Current: Store image URLs
├─ Expected: Upload to S3/Cloud Storage
└─ Save URLs to ListingImage table
```

---

## 5. **Where Each Data Type is Stored**

| Data Type | Current Storage | Location | Format |
|-----------|-----------------|----------|--------|
| **User Profile** | SQLite | `Backend/prisma/dev.db` | Structured records |
| **User Password** | SQLite | `Backend/prisma/dev.db` | Bcrypt Hash |
| **Profile Images** | External URL | (Unsplash/Cloud) | URL String |
| **Book Metadata** | SQLite | `Backend/prisma/dev.db` | Structured records |
| **Book Cover Images** | External URL | (Unsplash/Cloud) | URL String |
| **Listing Data** | SQLite | `Backend/prisma/dev.db` | Structured records |
| **Listing Images** | External URL | (Cloud Storage) | URL String in DB |
| **Order Records** | SQLite | `Backend/prisma/dev.db` | Structured records |
| **Payment Records** | SQLite | `Backend/prisma/dev.db` | Structured records + JSON |
| **Shipment Tracking** | SQLite | `Backend/prisma/dev.db` | Structured records |
| **Dispute Evidence** | External URL | (Cloud Storage) | URL String in DB |
| **Reviews & Ratings** | SQLite | `Backend/prisma/dev.db` | Structured records |
| **Notifications** | SQLite | `Backend/prisma/dev.db` | Structured records |
| **Cart Items** | SQLite | `Backend/prisma/dev.db` | Relationships |

---

## 6. **Database Indexes for Performance**

```
User:        [email]
Address:     [userId]
Book:        [isbn, category, title]
Listing:     [sellerId, bookId, status, askingPrice]
ListingImage:[listingId]
Offer:       [listingId, buyerId, sellerId, status]
OfferHistory:[offerId]
Cart:        [userId] (unique)
CartItem:    [cartId]
Order:       [orderNumber, buyerId, sellerId, status]
Payment:     [orderId, status]
Shipment:    [orderId, trackingNumber]
Review:      [revieweeId]
Wishlist:    [userId]
Notification:[userId, isRead]
Dispute:     [orderId, raisedById, status]
```

---

## 7. **Production Image Storage Recommendations**

### Option 1: AWS S3 (Recommended)
```
Setup:
├─ Create AWS S3 bucket (e.g., bookslx-prod-images)
├─ Enable versioning & lifecycle policies
├─ Configure CloudFront CDN for fast delivery
├─ Set up IAM roles for API access
└─ Encrypt at rest & in transit

Structure:
├─ /profiles/{userId}/
├─ /books/covers/{bookId}/
├─ /listings/{listingId}/images/
└─ /disputes/{disputeId}/evidence/

Implementation:
├─ Add multer package
├─ Add aws-sdk or @aws-sdk/client-s3
├─ Create upload controller
├─ Generate signed URLs for storage
└─ Update database with S3 URLs
```

### Option 2: Google Cloud Storage
```
Setup:
├─ Create Google Cloud Storage bucket
├─ Set up IAM service account
├─ Configure signed URLs
└─ Optional: Cloud CDN for caching

Similar structure and implementation to S3
```

### Option 3: Cloudinary (Easiest for MVP)
```
Setup:
├─ Sign up at cloudinary.com
├─ Get API key & secret
├─ Install cloudinary package
└─ Configure folder structure

Implementation:
├─ Upload directly from frontend
├─ Get secure URL immediately
├─ Auto-optimization & CDN included
└─ Easy to migrate later
```

### Option 4: Local File Storage (Development Only)
```
NOT RECOMMENDED FOR PRODUCTION

Structure:
├─ /public/uploads/profiles/
├─ /public/uploads/listings/
└─ /public/uploads/disputes/

Risks:
├─ Server disk space limitations
├─ No automatic backups
├─ Difficult to scale horizontally
└─ CDN integration complicated
```

---

## 8. **Environment Variables for Image Storage**

```bash
# .env (Backend)

# Image Storage Configuration
IMAGE_STORAGE_TYPE=s3              # s3, gcs, cloudinary, local
IMAGE_UPLOAD_MAX_SIZE=5242880      # 5MB in bytes
IMAGE_ALLOWED_TYPES=jpg,png,webp

# S3 Configuration (if using AWS S3)
AWS_REGION=ap-south-1
AWS_S3_BUCKET=bookslx-prod-images
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_UPLOAD_URL=https://bookslx-prod-images.s3.amazonaws.com

# Cloudinary Configuration (if using Cloudinary)
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google Cloud Storage (if using GCS)
GCS_PROJECT_ID=your_project_id
GCS_BUCKET=bookslx-prod-images
GCS_SERVICE_ACCOUNT_KEY=path/to/key.json
```

---

## 9. **Current Database Connection**

**Development:**
```typescript
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

**Location:** `N:\BooksLX\Backend\prisma\dev.db`

**File Size:** ~500KB (with seed data)

**To Backup:**
```bash
# Copy the database file
cp N:\BooksLX\Backend\prisma\dev.db N:\BooksLX\Backend\prisma\dev.db.backup
```

---

## 10. **Data Access Patterns**

### Create User
```
POST /auth/register
├─ Input: name, email, phone, password
├─ Process: Firebase auth + SQLite user creation
└─ Output: User record created (emailVerified=false)
```

### Upload Listing with Images
```
POST /listings/create
├─ Input: Book data, listing price, images, condition
├─ Process:
│  ├─ Create/find Book record
│  ├─ Create Listing record
│  └─ Create ListingImage records (with URLs)
└─ Output: Listing record with images
```

### Create Order
```
POST /orders/create
├─ Input: Listing ID, buyer address, seller address
├─ Process:
│  ├─ Create Order record
│  ├─ Create Payment record
│  └─ Create Shipment record
└─ Output: Order record with payment & shipment
```

---

## 11. **Data Retention & Privacy**

### Data Deleted When:
- **User Deletion**: All related records cascade deleted
  - User record → Addresses, Listings, Orders, Reviews, etc.
- **Listing Deletion**: Images and offers cascade deleted
- **Order Completion**: No automatic deletion, kept for history

### GDPR Compliance:
- Implement data export API
- Implement right-to-be-forgotten
- Anonymize sensitive fields
- Audit logs for data access

---

## 12. **Monitoring & Backups**

### Current Gaps:
- ❌ No automatic backups configured
- ❌ No database monitoring
- ❌ No query performance logging
- ❌ No image storage CDN

### Recommendations:
```
Daily:
├─ Backup SQLite database
├─ Verify backup integrity
└─ Log backup success/failure

Weekly:
├─ Run database optimization
├─ Analyze slow queries
└─ Archive old logs

Monthly:
├─ Review data growth
├─ Plan storage scaling
└─ Test backup restoration
```

---

## Summary

| Component | Storage | Current | Recommended for Production |
|-----------|---------|---------|------------------------------|
| **User Data** | SQLite (dev.db) | ✅ Working | Migrate to PostgreSQL/MySQL |
| **Images** | External URLs | ✅ Working | AWS S3 / Google Cloud Storage |
| **Backups** | None | ❌ Missing | Daily automated backups |
| **CDN** | None | ❌ Missing | CloudFront / Cloudflare |
| **Encryption** | None | ⚠️ Partial | Full E2E encryption |

**Next Steps:**
1. Set up image upload endpoints
2. Configure S3/Cloud storage
3. Implement backup strategy
4. Set up CDN for images
5. Plan production database (PostgreSQL recommended)
