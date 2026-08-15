import { initializeApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Validate Firebase config
const isFirebaseConfigured = Object.values(firebaseConfig).every(value => value !== '');

if (!isFirebaseConfigured) {
  console.warn(
    'Firebase configuration is incomplete. Email verification will not work. ' +
    'Please add Firebase credentials to your .env.local file.'
  );
}

let firebaseApp: any;
let auth: Auth | null = null;

try {
  if (isFirebaseConfigured) {
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
  }
} catch (error) {
  console.error('Failed to initialize Firebase:', error);
}

export { firebaseApp, auth };
