# Email Verification Setup Guide

## Firebase Configuration

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project" and create a new Firebase project
3. Enable Authentication with Email/Password provider
4. In Project Settings, copy your Firebase config values

### 2. Environment Variables

Create a `.env.local` file in the `Frontend` directory with your Firebase credentials:

```
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Configure Email Action URL

1. In Firebase Console, go to **Authentication > Templates > Email Verification**
2. Click the edit icon (pencil)
3. Set the **Action URL** to your application's verification endpoint:
   ```
   https://yourdomain.com/verify-email?oobCode={{OOBCODE}}
   ```
   
   For local development:
   ```
   http://localhost:5173/verify-email?oobCode={{OOBCODE}}
   ```

## Backend Integration

### Required Backend Changes

The following endpoints need to be updated/created in the backend:

#### 1. Update `/auth/register` Endpoint

The register endpoint should now accept an optional `firebaseUid` and handle the registration without immediately issuing a token:

```typescript
// Backend auth controller
POST /auth/register
Body: {
  name: string
  email: string
  phone?: string
  firebaseUid: string (from Firebase)
}
Response: {
  message: "Registration successful. Please verify your email."
  user: { id, email, name, ... }
  // NO token in initial response
}
```

#### 2. Create `/auth/login-verified` Endpoint

This new endpoint completes the login flow after email verification:

```typescript
POST /auth/login-verified
Body: {
  email: string
  firebaseUid: string
}
Response: {
  token: string
  user: { id, email, name, ... }
}
```

#### 3. Update User Model

Add email verification tracking to your User schema:

```typescript
// Prisma Schema
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  name            String
  phone           String?
  password        String
  firebaseUid     String?  @unique
  emailVerified   Boolean  @default(false)
  verifiedAt      DateTime?
  // ... other fields
}
```

### Database Migration

Run the migration to add email verification fields:

```bash
cd Backend
npx prisma migrate dev --name add_email_verification
```

## How It Works

### User Registration Flow

1. **Sign Up**: User fills signup form with name, email, phone, and password
2. **Firebase Account Created**: Frontend creates Firebase user with email/password
3. **Verification Email Sent**: Firebase sends verification email to user
4. **Backend Registration**: User record created in backend database with `emailVerified: false`
5. **Verification Page**: User sees message to check email and verify
6. **Email Click**: User clicks verification link in email
7. **Verification Confirmed**: Frontend verifies with Firebase using `oobCode`
8. **Token Issued**: Backend issues authentication token
9. **Logged In**: User is now fully authenticated and redirected to home page

### User Login Flow (Post-Verification)

1. **Login**: User enters email and password
2. **Firebase Auth**: Firebase authenticates user
3. **Token Issued**: Backend issues JWT token
4. **Logged In**: User is redirected to home page

## Password Visibility Toggle

The login/signup form now includes a password visibility toggle button with Eye/EyeOff icons from lucide-react that allows users to show/hide their password while typing.

## Features Included

✅ Firebase Email Verification
✅ Two-step signup (create account + verify email)
✅ Resend verification email option
✅ Auto-verification when clicking email link
✅ Password visibility toggle button
✅ Dark mode support
✅ Error handling and user feedback
✅ Responsive design

## Testing Locally

1. Set up Firebase project and get credentials
2. Add `.env.local` with Firebase config
3. Update backend to support verification endpoints
4. Run `npm run dev` in Frontend directory
5. Test signup with your email
6. Check Firebase Console to see verification email
7. Use Firebase Console's "Test email link" feature or click the link in your email

## Troubleshooting

**Email Not Received**
- Check spam folder
- Verify Firebase project email templates are configured
- Ensure Action URL is correct for your environment

**Verification Link Expired**
- Click "Resend Verification Email" button
- Verification links expire after 24 hours by default

**Backend Integration Issues**
- Ensure `/auth/register` and `/auth/login-verified` endpoints are properly implemented
- Verify `firebaseUid` is correctly stored in user database
- Check CORS settings if frontend and backend are on different domains
